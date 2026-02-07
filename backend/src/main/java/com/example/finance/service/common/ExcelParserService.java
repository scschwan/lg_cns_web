package com.example.finance.service.common;

import com.example.finance.model.data.RawDataDocument;
import com.example.finance.model.upload.UploadSession;
import com.example.finance.repository.data.RawDataRepository;
import com.example.finance.repository.upload.UploadSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
@RequiredArgsConstructor
public class ExcelParserService {

    private final S3Client s3Client;
    private final RawDataRepository rawDataRepository;
    private final UploadSessionRepository uploadSessionRepository;
    private final RedisService redisService;
    private final S3Service s3Service;

    @Value("${aws.s3.excel-bucket}")
    private String excelBucket;

    private static final int BATCH_SIZE = 5000; // MongoDB 배치 삽입 크기 (1000→5000 증가)
    private static final String UPLOAD_STATUS_KEY_PREFIX = "upload:status:"; // ★ Lambda Worker와 동일한 키

    /**
     * Excel 파일 비동기 파싱
     */
    public CompletableFuture<Void> parseExcelAsync(String uploadId) {
        return CompletableFuture.runAsync(() -> parseExcel(uploadId));
    }

    /**
     * Excel 파일 파싱 및 MongoDB 저장
     * ★ 개선: 임시 파일 다운로드 방식으로 메모리 효율적 처리
     *    + Redis 키를 Lambda Worker와 동일한 "upload:status:{uploadId}" 로 통일
     */
    public void parseExcel(String uploadId) {
        log.info("[백엔드 Fallback] Excel 파싱 시작: uploadId={}", uploadId);

        // 1. UploadSession 조회
        UploadSession session = uploadSessionRepository.findByUploadId(uploadId)
                .orElseThrow(() -> new RuntimeException("Upload session not found: " + uploadId));

        File tempFile = null;

        try {
            // 2. 상태 업데이트: PROCESSING
            updateSessionStatus(session, UploadSession.UploadStatus.PROCESSING, 0);

            // 3. S3에서 임시 파일로 다운로드 (메모리 절약)
            log.info("S3에서 파일 다운로드: key={}", session.getS3Key());
            tempFile = s3Service.downloadFileToTemp(session.getS3Key());
            log.info("임시 파일 다운로드 완료: {} bytes", tempFile.length());

            // 4. Excel 파싱 (XSSFWorkbook - 임시 파일에서 로드)
            try (FileInputStream fis = new FileInputStream(tempFile);
                 Workbook workbook = new XSSFWorkbook(fis)) {

                Sheet sheet = workbook.getSheetAt(0);
                int totalRows = sheet.getPhysicalNumberOfRows();
                log.info("총 행 개수: {}", totalRows);

                // 5. 헤더 추출 (첫 번째 행)
                Row headerRow = sheet.getRow(0);
                if (headerRow == null) {
                    throw new RuntimeException("헤더 행이 없습니다");
                }
                List<String> headers = extractHeaders(headerRow);
                log.info("헤더: {}", headers);

                // 6. 데이터 행 파싱 (배치 처리)
                List<RawDataDocument> batch = new ArrayList<>();
                int processedRows = 0;

                for (int rowIndex = 1; rowIndex < totalRows; rowIndex++) {
                    Row row = sheet.getRow(rowIndex);
                    if (row == null) continue;

                    Map<String, Object> rowData = extractRowData(headers, row);

                    RawDataDocument document = RawDataDocument.builder()
                            .projectId(session.getProjectId())
                            .sessionId(session.getSessionId())
                            .uploadId(uploadId)
                            .rowNumber(rowIndex)
                            .data(rowData)
                            .createdAt(LocalDateTime.now())
                            .updatedAt(LocalDateTime.now())
                            .build();

                    batch.add(document);

                    if (batch.size() >= BATCH_SIZE) {
                        rawDataRepository.saveAll(batch);
                        processedRows += batch.size();
                        batch.clear();

                        int progress = (int) ((processedRows * 100.0) / (totalRows - 1));
                        updateSessionProgress(session, processedRows, totalRows - 1, progress);

                        if (processedRows % 20000 == 0) {
                            log.info("[백엔드 Fallback] 진행률: {}% ({}/{})", progress, processedRows, totalRows - 1);
                        }
                    }
                }

                // 남은 데이터 삽입
                if (!batch.isEmpty()) {
                    rawDataRepository.saveAll(batch);
                    processedRows += batch.size();
                }

                // 7. 완료 처리
                updateSessionStatus(session, UploadSession.UploadStatus.COMPLETED, 100);
                session.setTotalRows(totalRows - 1);
                session.setProcessedRows(processedRows);
                session.setCompletedAt(LocalDateTime.now());
                uploadSessionRepository.save(session);

                log.info("[백엔드 Fallback] Excel 파싱 완료: uploadId={}, totalRows={}, processedRows={}",
                        uploadId, totalRows - 1, processedRows);

            } catch (IOException e) {
                throw new RuntimeException("Excel 파일 읽기 실패", e);
            }

        } catch (Exception e) {
            log.error("[백엔드 Fallback] Excel 파싱 실패: uploadId={}", uploadId, e);

            session.setStatus(UploadSession.UploadStatus.FAILED);
            session.setErrorMessage(e.getMessage());
            session.setUpdatedAt(LocalDateTime.now());
            uploadSessionRepository.save(session);

            // Redis 상태 업데이트 (Lambda Worker와 동일한 키)
            String statusKey = UPLOAD_STATUS_KEY_PREFIX + uploadId;
            redisService.hSet(statusKey, "status", "FAILED");
            redisService.hSet(statusKey, "error", e.getMessage());

            throw new RuntimeException("Excel 파싱 중 오류 발생", e);
        } finally {
            // 임시 파일 정리
            if (tempFile != null && tempFile.exists()) {
                tempFile.delete();
            }
        }
    }

    /**
     * S3에서 파일 다운로드
     */
    private ResponseInputStream<GetObjectResponse> downloadFromS3(String bucket, String key) {
        GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .build();

        return s3Client.getObject(getObjectRequest);
    }

    /**
     * 헤더 추출
     */
    private List<String> extractHeaders(Row headerRow) {
        List<String> headers = new ArrayList<>();
        for (Cell cell : headerRow) {
            String header = getCellValueAsString(cell);
            headers.add(header != null ? header : "Column_" + cell.getColumnIndex());
        }
        return headers;
    }

    /**
     * 행 데이터 추출
     */
    private Map<String, Object> extractRowData(List<String> headers, Row row) {
        Map<String, Object> data = new LinkedHashMap<>();

        for (int i = 0; i < headers.size(); i++) {
            Cell cell = row.getCell(i);
            String header = headers.get(i);
            Object value = getCellValue(cell);
            data.put(header, value);
        }

        return data;
    }

    /**
     * 셀 값 추출 (타입별 처리)
     */
    private Object getCellValue(Cell cell) {
        if (cell == null) {
            return null;
        }

        switch (cell.getCellType()) {
            case STRING:
                return cell.getStringCellValue();

            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) {
                    return cell.getLocalDateTimeCellValue().toString();
                } else {
                    return cell.getNumericCellValue();
                }

            case BOOLEAN:
                return cell.getBooleanCellValue();

            case FORMULA:
                return cell.getCellFormula();

            case BLANK:
                return null;

            default:
                return cell.toString();
        }
    }

    /**
     * 셀 값을 문자열로 추출
     */
    private String getCellValueAsString(Cell cell) {
        Object value = getCellValue(cell);
        return value != null ? value.toString() : null;
    }

    /**
     * 세션 상태 업데이트
     * ★ Redis 키를 Lambda Worker와 동일한 "upload:status:{uploadId}" 로 통일
     */
    private void updateSessionStatus(UploadSession session, UploadSession.UploadStatus status, int progress) {
        session.setStatus(status);
        session.setProgress(progress);
        session.setUpdatedAt(LocalDateTime.now());
        uploadSessionRepository.save(session);

        String statusKey = UPLOAD_STATUS_KEY_PREFIX + session.getUploadId();
        redisService.hSet(statusKey, "status", status.name());
        redisService.hSet(statusKey, "progress", progress);
    }

    /**
     * 진행률 업데이트
     */
    private void updateSessionProgress(UploadSession session, int processedRows, int totalRows, int progress) {
        session.setProgress(progress);
        session.setProcessedRows(processedRows);
        session.setTotalRows(totalRows);
        session.setUpdatedAt(LocalDateTime.now());
        uploadSessionRepository.save(session);

        String statusKey = UPLOAD_STATUS_KEY_PREFIX + session.getUploadId();
        redisService.hSet(statusKey, "progress", progress);
        redisService.hSet(statusKey, "processedRows", processedRows);
        redisService.hSet(statusKey, "totalRows", totalRows);
    }
}