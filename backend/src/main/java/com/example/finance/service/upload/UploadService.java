package com.example.finance.service.upload;

import com.example.finance.dto.request.upload.SetFileColumnsRequest;
import com.example.finance.dto.request.upload.UploadFileRequest;
import com.example.finance.dto.response.upload.UploadFileResponse;
import com.example.finance.exception.BusinessException;
import com.example.finance.model.session.FileSession;
import com.example.finance.model.session.UploadedFileInfo;
import com.example.finance.model.upload.UploadSession;
import com.example.finance.repository.session.FileSessionRepository;
import com.example.finance.repository.upload.UploadSessionRepository;
import com.example.finance.service.common.S3Service;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.bson.types.ObjectId;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 업로드 서비스
 *
 * Step 1: Multi File Upload
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UploadService {

    private final StringRedisTemplate redisTemplate;
    private final UploadSessionRepository uploadSessionRepository;
    private final FileSessionRepository fileSessionRepository;
    private final S3Service s3Service;

    // Lambda와 공유하는 Redis Key Prefix
    private static final String UPLOAD_STATUS_KEY_PREFIX = "upload:status:";

    /**
     * 세션 ID 생성
     */
    public String createSession(String projectId, String userId) {
        return "session-" + UUID.randomUUID().toString();
    }

    /**
     * 업로드 ID 생성
     */
    public String createUploadId() {
        return "upload-" + UUID.randomUUID().toString();
    }

    /**
     * 업로드 세션 초기화 및 메타데이터 저장
     */
    public void saveUploadSession(String projectId, String sessionId, String uploadId,
                                  String s3Key, String fileName, Long fileSize) {
        String key = UPLOAD_STATUS_KEY_PREFIX + uploadId;

        Map<String, String> sessionData = new HashMap<>();
        sessionData.put("projectId", projectId);
        sessionData.put("sessionId", sessionId);
        sessionData.put("s3Key", s3Key);
        sessionData.put("fileName", fileName);
        sessionData.put("fileSize", String.valueOf(fileSize));
        sessionData.put("status", "PENDING");
        sessionData.put("progress", "0");
        sessionData.put("processedRows", "0");
        sessionData.put("totalRows", "0");

        try {
            redisTemplate.opsForHash().putAll(key, sessionData);
            redisTemplate.expire(key, 24, java.util.concurrent.TimeUnit.HOURS);
            log.info("업로드 세션 초기화 완료: {}", key);
        } catch (Exception e) {
            log.error("Redis 저장 중 오류 발생: {}", e.getMessage(), e);
            throw new RuntimeException("업로드 세션 생성 실패");
        }

        // MongoDB 저장
        UploadSession uploadSession = UploadSession.builder()
                .projectId(projectId)
                .sessionId(sessionId)
                .uploadId(uploadId)
                .s3Bucket("finance-excel-uploads")
                .s3Key(s3Key)
                .fileName(fileName)
                .fileSize(fileSize)
                .status(UploadSession.UploadStatus.PENDING)
                .progress(0)
                .totalRows(0)
                .processedRows(0)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        try {
            uploadSessionRepository.save(uploadSession);
            log.info("MongoDB 업로드 세션 저장 완료: uploadId={}", uploadId);
        } catch (Exception e) {
            log.error("MongoDB 저장 중 오류 발생: {}", e.getMessage(), e);
            throw new RuntimeException("업로드 세션 저장 실패");
        }
    }

    /**
     * 업로드 상태 조회
     */
    public Map<String, Object> getUploadStatus(String uploadId) {
        String key = UPLOAD_STATUS_KEY_PREFIX + uploadId;

        try {
            HashOperations<String, String, String> hashOps = redisTemplate.opsForHash();
            Map<String, String> rawData = hashOps.entries(key);

            if (rawData.isEmpty()) {
                log.warn("업로드 ID를 찾을 수 없음: {}", uploadId);
                Map<String, Object> notFound = new HashMap<>();
                notFound.put("status", "NOT_FOUND");
                notFound.put("message", "유효하지 않거나 만료된 업로드 ID입니다.");
                return notFound;
            }

            Map<String, Object> status = new HashMap<>();
            status.put("uploadId", uploadId);
            status.put("status", rawData.getOrDefault("status", "UNKNOWN"));
            status.put("progress", Integer.parseInt(rawData.getOrDefault("progress", "0")));
            status.put("processedRows", Long.parseLong(rawData.getOrDefault("processedRows", "0")));
            status.put("totalRows", Long.parseLong(rawData.getOrDefault("totalRows", "0")));
            status.put("fileName", rawData.get("fileName"));

            if (rawData.containsKey("error")) {
                status.put("error", rawData.get("error"));
            }

            return status;

        } catch (Exception e) {
            log.error("Redis 조회 중 오류 발생: uploadId={}, error={}", uploadId, e.getMessage());
            throw new RuntimeException("업로드 상태 조회 실패: " + e.getMessage());
        }
    }

    // ⭐⭐⭐ 신규 메서드 추가 ⭐⭐⭐

    /**
     * 파일 업로드 완료 처리
     *
     * S3 업로드 완료 후 호출
     * - FileSession에 파일 정보 추가
     * - Excel 헤더 자동 감지
     * - Lambda 트리거 (S3 Event)
     */
    @Transactional
    public UploadFileResponse completeFileUpload(
            String projectId, String userId, UploadFileRequest request) {

        log.info("파일 업로드 완료 처리: projectId={}, uploadId={}, fileName={}",
                projectId, request.getUploadId(), request.getFileName());

        // 1. FileSession 조회 (sessionId로)
        FileSession fileSession = fileSessionRepository.findBySessionId(request.getSessionId())
                .orElseThrow(() -> new BusinessException(
                        "SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + request.getSessionId()));

        // 권한 확인
        if (!fileSession.getCreatedBy().equals(userId)) {
            throw new BusinessException("FORBIDDEN", "세션에 대한 권한이 없습니다");
        }

        // 2. Excel 헤더 자동 감지
        List<String> detectedColumns = detectExcelColumns(request.getS3Key());

        // 3. UploadedFileInfo 생성
        String fileId = new ObjectId().toString();

        UploadedFileInfo fileInfo = UploadedFileInfo.builder()
                .fileId(fileId)
                .fileName(request.getFileName())
                .fileSize(request.getFileSize())
                .s3Key(request.getS3Key())
                .rowCount(0L) // Lambda 처리 후 업데이트
                .uploadedAt(LocalDateTime.now())
                .detectedColumns(detectedColumns)
                .accountContents(new ArrayList<>())
                .build();

        // 4. FileSession에 파일 추가
        fileSession.getUploadedFiles().add(fileInfo);
        fileSession.setTotalFiles(fileSession.getUploadedFiles().size());
        fileSession.setUpdatedAt(LocalDateTime.now());

        fileSessionRepository.save(fileSession);

        log.info("파일 업로드 완료: fileId={}, detectedColumns={}",
                fileId, detectedColumns.size());

        // 5. 응답 생성
        return UploadFileResponse.builder()
                .fileId(fileId)
                .fileName(request.getFileName())
                .fileSize(request.getFileSize())
                .s3Key(request.getS3Key())
                .uploadedAt(LocalDateTime.now())
                .detectedColumns(detectedColumns)
                .rowCount(0L)
                .status("UPLOADED")
                .build();
    }

    /**
     * Excel 컬럼 자동 감지
     */
    private List<String> detectExcelColumns(String s3Key) {
        try {
            // S3에서 파일 다운로드 (헤더만)
            byte[] fileBytes = s3Service.downloadFile(s3Key);

            try (ByteArrayInputStream bis = new ByteArrayInputStream(fileBytes);
                 Workbook workbook = new XSSFWorkbook(bis)) {

                Sheet sheet = workbook.getSheetAt(0);
                Row headerRow = sheet.getRow(0);

                if (headerRow == null) {
                    log.warn("헤더 행이 없음: s3Key={}", s3Key);
                    return new ArrayList<>();
                }

                List<String> columns = new ArrayList<>();
                for (int i = 0; i < headerRow.getLastCellNum(); i++) {
                    Cell cell = headerRow.getCell(i);
                    if (cell != null) {
                        String columnName = getCellValueAsString(cell);
                        if (columnName != null && !columnName.trim().isEmpty()) {
                            columns.add(columnName.trim());
                        }
                    }
                }

                log.debug("컬럼 자동 감지 완료: s3Key={}, columns={}", s3Key, columns);
                return columns;
            }

        } catch (IOException e) {
            log.error("Excel 컬럼 감지 실패: s3Key={}, error={}", s3Key, e.getMessage(), e);
            return new ArrayList<>();
        }
    }

    /**
     * Cell 값을 String으로 변환
     */
    private String getCellValueAsString(Cell cell) {
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
                    return String.valueOf((long) cell.getNumericCellValue());
                }
            case BOOLEAN:
                return String.valueOf(cell.getBooleanCellValue());
            case FORMULA:
                return cell.getCellFormula();
            default:
                return null;
        }
    }

    /**
     * 파일 컬럼 설정 (계정명, 금액 컬럼)
     */
    @Transactional
    public UploadedFileInfo setFileColumns(
            String projectId, String fileId, SetFileColumnsRequest request) {

        log.info("파일 컬럼 설정: projectId={}, fileId={}, accountColumn={}, amountColumn={}",
                projectId, fileId, request.getAccountColumnName(), request.getAmountColumnName());

        // FileSession에서 파일 찾기
        FileSession fileSession = fileSessionRepository.findByUploadedFilesFileId(fileId)
                .orElseThrow(() -> new BusinessException(
                        "FILE_NOT_FOUND", "파일을 찾을 수 없습니다: " + fileId));

        // 파일 정보 업데이트
        UploadedFileInfo fileInfo = fileSession.getUploadedFiles().stream()
                .filter(f -> f.getFileId().equals(fileId))
                .findFirst()
                .orElseThrow(() -> new BusinessException(
                        "FILE_NOT_FOUND", "파일을 찾을 수 없습니다: " + fileId));

        fileInfo.setAccountColumnName(request.getAccountColumnName());
        fileInfo.setAmountColumnName(request.getAmountColumnName());

        fileSession.setUpdatedAt(LocalDateTime.now());
        fileSessionRepository.save(fileSession);

        log.info("파일 컬럼 설정 완료: fileId={}", fileId);

        return fileInfo;
    }

    /**
     * 프로젝트의 업로드된 파일 목록 조회
     */
    public List<UploadedFileInfo> getProjectFiles(String projectId) {
        List<FileSession> sessions = fileSessionRepository.findByProjectIdAndIsDeletedFalse(projectId);

        return sessions.stream()
                .flatMap(session -> session.getUploadedFiles().stream())
                .collect(Collectors.toList());
    }
}