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

    @Value("${aws.s3.excel-bucket}")
    private String excelBucket;

    private static final int BATCH_SIZE = 1000; // MongoDB 배치 삽입 크기

    /**
     * Excel 파일 비동기 파싱
     */
    public CompletableFuture<Void> parseExcelAsync(String uploadId) {
        return CompletableFuture.runAsync(() -> parseExcel(uploadId));
    }

    /**
     * Excel 파일 파싱 및 MongoDB 저장
     */
    public void parseExcel(String uploadId) {
        log.info("Excel 파싱 시작: uploadId={}", uploadId);

        // 1. UploadSession 조회
        UploadSession session = uploadSessionRepository.findByUploadId(uploadId)
                .orElseThrow(() -> new RuntimeException("Upload session not found: " + uploadId));

        try {
            // 2. 상태 업데이트: PROCESSING
            updateSessionStatus(session, UploadSession.UploadStatus.PROCESSING, 0);

            // 3. S3에서 파일 다운로드
            log.info("S3에서 파일 다운로드: bucket={}, key={}", session.getS3Bucket(), session.getS3Key());
            ResponseInputStream<GetObjectResponse> s3Object = downloadFromS3(session.getS3Bucket(), session.getS3Key());

            // 4. Excel 파싱
            try (Workbook workbook = new XSSFWorkbook(s3Object)) {
                Sheet sheet = workbook.getSheetAt(0); // 첫 번째 시트
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

                for (int rowIndex = 1; rowIndex < totalRows; rowIndex++) { // 헤더 제외
                    Row row = sheet.getRow(rowIndex);
                    if (row == null) continue;

                    // 행 데이터 추출
                    Map<String, Object> rowData = extractRowData(headers, row);

                    // RawDataDocument 생성
                    RawDataDocument document = RawDataDocument.builder()
                            .projectId(session.getProjectId())  // ⭐ 추가!
                            .sessionId(session.getSessionId())
                            .uploadId(uploadId)
                            .rowNumber(rowIndex)
                            .data(rowData)
                            .createdAt(LocalDateTime.now())
                            .updatedAt(LocalDateTime.now())
                            .build();

                    batch.add(document);

                    // 배치 삽입
                    if (batch.size() >= BATCH_SIZE) {
                        rawDataRepository.saveAll(batch);
                        processedRows += batch.size();
                        batch.clear();

                        // 진행률 업데이트
                        int progress = (int) ((processedRows * 100.0) / (totalRows - 1));
                        updateSessionProgress(session, processedRows, totalRows - 1, progress);

                        log.info("진행률: {}% ({}/{})", progress, processedRows, totalRows - 1);
                    }
                }

                // 남은 데이터 삽입
                if (!batch.isEmpty()) {
                    rawDataRepository.saveAll(batch);
                    processedRows += batch.size();
                }

                // 7. 완료 처리
                updateSessionStatus(session, UploadSession.UploadStatus.COMPLETED, 100);
                session.setTotalRows(totalRows - 1); // 헤더 제외
                session.setProcessedRows(processedRows);
                session.setCompletedAt(LocalDateTime.now());
                uploadSessionRepository.save(session);

                log.info("Excel 파싱 완료: uploadId={}, totalRows={}, processedRows={}",
                        uploadId, totalRows - 1, processedRows);

            } catch (IOException e) {
                throw new RuntimeException("Excel 파일 읽기 실패", e);
            }

        } catch (Exception e) {
            log.error("Excel 파싱 실패: uploadId={}", uploadId, e);

            // 실패 상태 업데이트
            session.setStatus(UploadSession.UploadStatus.FAILED);
            session.setErrorMessage(e.getMessage());
            session.setUpdatedAt(LocalDateTime.now());
            uploadSessionRepository.save(session);

            // Redis 진행률도 업데이트
            redisService.hSet("upload:progress:" + uploadId, "status", "FAILED");
            redisService.hSet("upload:progress:" + uploadId, "errorMessage", e.getMessage());

            throw new RuntimeException("Excel 파싱 중 오류 발생", e);
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
     */
    private void updateSessionStatus(UploadSession session, UploadSession.UploadStatus status, int progress) {
        session.setStatus(status);
        session.setProgress(progress);
        session.setUpdatedAt(LocalDateTime.now());
        uploadSessionRepository.save(session);

        // Redis에도 저장
        redisService.hSet("upload:progress:" + session.getUploadId(), "status", status.name());
        redisService.hSet("upload:progress:" + session.getUploadId(), "progress", progress);
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

        // Redis 진행률 업데이트
        redisService.hSet("upload:progress:" + session.getUploadId(), "progress", progress);
        redisService.hSet("upload:progress:" + session.getUploadId(), "processedRows", processedRows);
        redisService.hSet("upload:progress:" + session.getUploadId(), "totalRows", totalRows);
    }
}