package com.example.finance.service.upload;

import com.example.finance.dto.request.upload.AccountPartition;
import com.example.finance.dto.request.upload.SetFileColumnsRequest;
import com.example.finance.dto.request.upload.UploadFileRequest;
import com.example.finance.dto.response.upload.PartitionAnalysisResponse;
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
import org.springframework.data.domain.Sort;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.DoubleAdder;
import java.util.concurrent.atomic.LongAdder;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.query.Criteria;
import org.bson.Document;
import java.time.Duration;

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
    private final FileAnalysisService fileAnalysisService; // 주입 필요
    private final S3Service s3Service;
    private final MongoTemplate mongoTemplate;  // ← 추가
    // ★ 클래스 필드에 전용 스레드풀 추가
    private final ExecutorService metadataExecutor = Executors.newFixedThreadPool(2,
            r -> {
                Thread t = new Thread(r, "metadata-worker");
                t.setDaemon(true);
                return t;
            });


    // Lambda와 공유하는 Redis Key Prefix
    private static final String UPLOAD_STATUS_KEY_PREFIX = "upload:status:";


    /**
     * Excel 메타데이터 (내부 클래스)
     */
    @lombok.Data
    @lombok.AllArgsConstructor
    private static class ExcelMetadata {
        private List<String> columns;
        private Long rowCount;
    }

    /**
     * 세션 ID 생성
     */
    /**
     * 세션 ID 생성 및 FileSession 저장
     */
    @Transactional
    public String createSession(String projectId, String userId) {
        String sessionId = "session-" + UUID.randomUUID().toString();

        // FileSession 생성
        FileSession fileSession = FileSession.builder()
                .sessionId(sessionId)
                .projectId(projectId)
                .createdBy(userId)
                .uploadedFiles(new ArrayList<>())
                .totalFiles(0)
                .isCompleted(false)
                .isDeleted(false)
                .createdAt(LocalDateTime.now())
                .lastAccessedAt(LocalDateTime.now())
                .build();

        // MongoDB 저장
        fileSessionRepository.save(fileSession);

        log.info("FileSession 생성 완료: sessionId={}, projectId={}", sessionId, projectId);

        return sessionId;
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

    @Transactional
    public UploadFileResponse completeFileUpload(
            String projectId, String userId, UploadFileRequest request) {

        log.info("파일 업로드 완료 처리: projectId={}, uploadId={}, fileName={}",
                projectId, request.getUploadId(), request.getFileName());

        FileSession fileSession = fileSessionRepository.findBySessionId(request.getSessionId())
                .orElseThrow(() -> new BusinessException(
                        "SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + request.getSessionId()));

        if (!fileSession.getCreatedBy().equals(userId)) {
            throw new BusinessException("FORBIDDEN", "세션에 대한 권한이 없습니다");
        }

        // ★ raw_data에서 즉시 조회 시도 (대기 없이)
        String uploadId = extractUploadIdFromS3Key(request.getS3Key());
        ExcelMetadata metadata = null;

        if (uploadId != null) {
            long rowCount = mongoTemplate.getCollection("raw_data")
                    .countDocuments(new org.bson.Document("upload_id", uploadId));

            if (rowCount > 0) {
                org.bson.Document rawDoc = mongoTemplate.getCollection("raw_data")
                        .find(new org.bson.Document("upload_id", uploadId))
                        .limit(1)
                        .first();

                List<String> columns = new ArrayList<>();
                if (rawDoc != null) {
                    Object dataObj = rawDoc.get("data");
                    if (dataObj instanceof org.bson.Document dataDoc) {
                        columns.addAll(dataDoc.keySet());
                    }
                }
                metadata = new ExcelMetadata(columns, rowCount);
                log.info("raw_data 즉시 조회 성공: uploadId={}, rows={}", uploadId, rowCount);
            }
        }

        String fileId = new ObjectId().toString();
        boolean metadataReady = (metadata != null && metadata.rowCount > 0);

        UploadedFileInfo fileInfo = UploadedFileInfo.builder()
                .fileId(fileId)
                .fileName(request.getFileName())
                .fileSize(request.getFileSize())
                .s3Key(request.getS3Key())
                .rowCount(metadataReady ? metadata.rowCount : 0L)
                .uploadedAt(LocalDateTime.now())
                .detectedColumns(metadataReady ? metadata.columns : new ArrayList<>())
                .accountContents(new ArrayList<>())
                .build();

        fileSession.getUploadedFiles().add(fileInfo);
        fileSession.setTotalFiles(fileSession.getUploadedFiles().size());
        fileSession.setUpdatedAt(LocalDateTime.now());
        fileSessionRepository.save(fileSession);

        // ★ 메타데이터가 없을 때만 전용 스레드풀에서 비동기 처리
        if (!metadataReady) {
            metadataExecutor.submit(() -> updateFileMetadataAsync(
                    fileSession.getSessionId(), fileId, request.getS3Key()));
        }

        log.info("파일 업로드 완료: fileId={}, metadataReady={}", fileId, metadataReady);

        return UploadFileResponse.builder()
                .fileId(fileId)
                .fileName(request.getFileName())
                .fileSize(request.getFileSize())
                .s3Key(request.getS3Key())
                .uploadedAt(LocalDateTime.now())
                .detectedColumns(metadataReady ? metadata.columns : new ArrayList<>())
                .rowCount(metadataReady ? metadata.rowCount : 0L)
                .status(metadataReady ? "UPLOADED" : "PROCESSING")
                .build();
    }

    /**
     * 비동기 메타데이터 업데이트 (전용 스레드풀에서 실행)
     */
    private void updateFileMetadataAsync(String sessionId, String fileId, String s3Key) {
        String uploadId = extractUploadIdFromS3Key(s3Key);
        if (uploadId == null) return;

        try {
            // raw_data 대기 - 최대 2분
            long rowCount = 0;
            for (int retry = 0; retry < 40; retry++) {
                rowCount = mongoTemplate.getCollection("raw_data")
                        .countDocuments(new org.bson.Document("upload_id", uploadId));
                if (rowCount > 0) break;
                Thread.sleep(3000);
                log.debug("raw_data 대기: uploadId={}, retry={}", uploadId, retry + 1);
            }

            if (rowCount == 0) {
                log.warn("raw_data 대기 타임아웃: uploadId={}", uploadId);
                return;
            }

            // 컬럼 추출
            org.bson.Document rawDoc = mongoTemplate.getCollection("raw_data")
                    .find(new org.bson.Document("upload_id", uploadId))
                    .limit(1)
                    .first();

            List<String> columns = new ArrayList<>();
            if (rawDoc != null) {
                Object dataObj = rawDoc.get("data");
                if (dataObj instanceof org.bson.Document dataDoc) {
                    columns.addAll(dataDoc.keySet());
                }
            }

            final long finalRowCount = rowCount;
            final List<String> finalColumns = columns;

            // DB 업데이트
            FileSession session = fileSessionRepository.findBySessionId(sessionId).orElse(null);
            if (session == null) return;

            session.getUploadedFiles().stream()
                    .filter(f -> f.getFileId().equals(fileId))
                    .findFirst()
                    .ifPresent(file -> {
                        file.setDetectedColumns(finalColumns);
                        file.setRowCount(finalRowCount);
                    });

            session.setUpdatedAt(LocalDateTime.now());
            fileSessionRepository.save(session);

            log.info("메타데이터 비동기 업데이트 완료: fileId={}, rowCount={}, columns={}",
                    fileId, rowCount, columns.size());

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.error("메타데이터 비동기 업데이트 실패: fileId={}", fileId, e);
        }
    }


    /**
     * Excel 메타데이터 감지 - raw_data 우선, fallback으로 Excel
     */
    private ExcelMetadata detectExcelMetadata(String s3Key) {
        String uploadId = extractUploadIdFromS3Key(s3Key);

        if (uploadId != null) {
            // raw_data에 데이터가 들어올 때까지 최대 30초 대기
            long rowCount = 0;
            for (int retry = 0; retry < 10; retry++) {
                rowCount = mongoTemplate.getCollection("raw_data")
                        .countDocuments(new org.bson.Document("upload_id", uploadId));
                if (rowCount > 0) break;
                try {
                    log.info("raw_data 대기 중: uploadId={}, retry={}", uploadId, retry + 1);
                    Thread.sleep(3000);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }

            if (rowCount > 0) {
                org.bson.Document rawDoc = mongoTemplate.getCollection("raw_data")
                        .find(new org.bson.Document("upload_id", uploadId))
                        .limit(1)
                        .first();

                List<String> columns = new ArrayList<>();
                if (rawDoc != null) {
                    Object dataObj = rawDoc.get("data");
                    if (dataObj instanceof org.bson.Document dataDoc) {
                        columns.addAll(dataDoc.keySet());
                    }
                }

                log.info("raw_data 메타데이터 조회 성공: uploadId={}, columns={}, rowCount={}",
                        uploadId, columns.size(), rowCount);
                return new ExcelMetadata(columns, rowCount);
            }
        }

        // Fallback: 파일 크기 체크 후 소용량만 Excel 파싱
        try {
            byte[] fileBytes = s3Service.downloadFile(s3Key);

            // 10MB 이상이면 POI 파싱 포기 (OOM 방지)
            if (fileBytes.length > 10 * 1024 * 1024) {
                log.warn("대용량 파일 Excel 파싱 스킵 ({}MB): s3Key={}",
                        fileBytes.length / 1024 / 1024, s3Key);
                return new ExcelMetadata(new ArrayList<>(), 0L);
            }

            try (ByteArrayInputStream bis = new ByteArrayInputStream(fileBytes);
                 Workbook workbook = new XSSFWorkbook(bis)) {

                Sheet sheet = workbook.getSheetAt(0);
                Row headerRow = sheet.getRow(0);

                List<String> columns = new ArrayList<>();
                if (headerRow != null) {
                    for (int i = 0; i < headerRow.getLastCellNum(); i++) {
                        Cell cell = headerRow.getCell(i);
                        if (cell != null) {
                            String columnName = getCellValueAsString(cell);
                            if (columnName != null && !columnName.trim().isEmpty()) {
                                columns.add(columnName.trim());
                            }
                        }
                    }
                }

                long rowCount = sheet.getLastRowNum();
                if (rowCount > 0) rowCount--;

                return new ExcelMetadata(columns, rowCount);
            }
        } catch (Exception e) {
            log.error("Excel 메타데이터 감지 실패: s3Key={}", s3Key, e);
            return new ExcelMetadata(new ArrayList<>(), 0L);
        }
    }


    /**
     * Excel 컬럼 자동 감지 + rowCount 계산
     */
    private List<String> detectExcelColumns(String s3Key) {
        try {
            byte[] fileBytes = s3Service.downloadFile(s3Key);

            try (ByteArrayInputStream bis = new ByteArrayInputStream(fileBytes);
                 Workbook workbook = new XSSFWorkbook(bis)) {

                Sheet sheet = workbook.getSheetAt(0);
                Row headerRow = sheet.getRow(0);

                if (headerRow == null) {
                    log.warn("헤더 행이 없음: s3Key={}", s3Key);
                    return new ArrayList<>();
                }

                // ⭐ rowCount 계산을 위해 인스턴스 변수 사용 필요
                // 대신 completeFileUpload()에서 처리하도록 수정

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
     * 계정명 값 추출
     *
     * @param projectId 프로젝트 ID
     * @param fileId 파일 ID
     * @param columnName 계정명 컬럼
     * @return 계정명 고유값 리스트
     */
    public List<String> extractAccountValues(String projectId, String fileId, String columnName) {
        log.info("계정명 추출: projectId={}, fileId={}, columnName={}", projectId, fileId, columnName);

        // 1. 파일 정보 조회
        FileSession fileSession = fileSessionRepository.findFirstByUploadedFilesFileId(fileId)
                .orElseThrow(() -> new BusinessException(
                        "FILE_NOT_FOUND", "파일을 찾을 수 없습니다: " + fileId));

        UploadedFileInfo fileInfo = fileSession.getUploadedFiles().stream()
                .filter(f -> f.getFileId().equals(fileId))
                .findFirst()
                .orElseThrow(() -> new BusinessException(
                        "FILE_NOT_FOUND", "파일을 찾을 수 없습니다: " + fileId));

        // 2. S3에서 파일 다운로드
        byte[] fileBytes = s3Service.downloadFile(fileInfo.getS3Key());

        // 3. Excel 파싱 (계정명 추출)
        try (ByteArrayInputStream bis = new ByteArrayInputStream(fileBytes);
             Workbook workbook = new XSSFWorkbook(bis)) {

            Sheet sheet = workbook.getSheetAt(0);
            Row headerRow = sheet.getRow(0);

            // 컬럼 인덱스 찾기
            int columnIndex = -1;
            for (int i = 0; i < headerRow.getLastCellNum(); i++) {
                Cell cell = headerRow.getCell(i);
                if (cell != null && columnName.equals(getCellValueAsString(cell))) {
                    columnIndex = i;
                    break;
                }
            }

            if (columnIndex == -1) {
                throw new BusinessException("COLUMN_NOT_FOUND",
                        "컬럼을 찾을 수 없습니다: " + columnName);
            }

            // 고유값 추출 (최대 1000개 샘플링)
            Set<String> accountValues = new HashSet<>();
            int maxRows = Math.min(sheet.getLastRowNum(), 1000);

            for (int i = 1; i <= maxRows; i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                Cell cell = row.getCell(columnIndex);
                if (cell == null) continue;

                String value = getCellValueAsString(cell);
                if (value != null && !value.trim().isEmpty()) {
                    accountValues.add(value.trim());
                }
            }

            log.info("계정명 추출 완료: {} 개", accountValues.size());
            return new ArrayList<>(accountValues);

        } catch (IOException e) {
            log.error("Excel 파싱 실패: fileId={}", fileId, e);
            throw new BusinessException("FILE_PARSE_ERROR", "파일 파싱 실패: " + e.getMessage());
        }
    }

    /**
     * 금액 합계 계산
     *
     * @param projectId 프로젝트 ID
     * @param fileId 파일 ID
     * @param columnName 금액 컬럼
     * @return 금액 합계
     */
    public Double calculateTotalAmount(String projectId, String fileId, String columnName) {
        log.info("금액 합산: projectId={}, fileId={}, columnName={}", projectId, fileId, columnName);

        // 1. 파일 정보 조회
        FileSession fileSession = fileSessionRepository.findFirstByUploadedFilesFileId(fileId)
                .orElseThrow(() -> new BusinessException(
                        "FILE_NOT_FOUND", "파일을 찾을 수 없습니다: " + fileId));

        UploadedFileInfo fileInfo = fileSession.getUploadedFiles().stream()
                .filter(f -> f.getFileId().equals(fileId))
                .findFirst()
                .orElseThrow(() -> new BusinessException(
                        "FILE_NOT_FOUND", "파일을 찾을 수 없습니다: " + fileId));

        // 2. S3에서 파일 다운로드
        byte[] fileBytes = s3Service.downloadFile(fileInfo.getS3Key());

        // 3. Excel 파싱 (금액 합산)
        try (ByteArrayInputStream bis = new ByteArrayInputStream(fileBytes);
             Workbook workbook = new XSSFWorkbook(bis)) {

            Sheet sheet = workbook.getSheetAt(0);
            Row headerRow = sheet.getRow(0);

            // 컬럼 인덱스 찾기
            int columnIndex = -1;
            for (int i = 0; i < headerRow.getLastCellNum(); i++) {
                Cell cell = headerRow.getCell(i);
                if (cell != null && columnName.equals(getCellValueAsString(cell))) {
                    columnIndex = i;
                    break;
                }
            }

            if (columnIndex == -1) {
                throw new BusinessException("COLUMN_NOT_FOUND",
                        "컬럼을 찾을 수 없습니다: " + columnName);
            }

            // 금액 합산
            double totalAmount = 0.0;
            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                Cell cell = row.getCell(columnIndex);
                if (cell == null) continue;

                if (cell.getCellType() == CellType.NUMERIC) {
                    totalAmount += cell.getNumericCellValue();
                } else if (cell.getCellType() == CellType.STRING) {
                    String value = cell.getStringCellValue().replaceAll("[^0-9.-]", "");
                    if (!value.isEmpty()) {
                        try {
                            totalAmount += Double.parseDouble(value);
                        } catch (NumberFormatException e) {
                            // 무시
                        }
                    }
                }
            }

            log.info("금액 합산 완료: {}", totalAmount);
            return totalAmount;

        } catch (IOException e) {
            log.error("Excel 파싱 실패: fileId={}", fileId, e);
            throw new BusinessException("FILE_PARSE_ERROR", "파일 파싱 실패: " + e.getMessage());
        }
    }

    /**
     * 파일 삭제
     *
     * @param projectId 프로젝트 ID
     * @param fileId 파일 ID
     */
    public void deleteFile(String projectId, String fileId) {
        log.info("파일 삭제: projectId={}, fileId={}", projectId, fileId);

        FileSession fileSession = fileSessionRepository.findFirstByUploadedFilesFileId(fileId)
                .orElseThrow(() -> new BusinessException(
                        "FILE_NOT_FOUND", "파일을 찾을 수 없습니다: " + fileId));

        UploadedFileInfo fileToDelete = fileSession.getUploadedFiles().stream()
                .filter(f -> f.getFileId().equals(fileId))
                .findFirst()
                .orElseThrow(() -> new BusinessException(
                        "FILE_NOT_FOUND", "파일을 찾을 수 없습니다: " + fileId));

        // ★ S3 파일 삭제
        try {
            s3Service.deleteFile(fileToDelete.getS3Key());
        } catch (Exception e) {
            log.warn("S3 파일 삭제 실패 (계속 진행): s3Key={}", fileToDelete.getS3Key(), e);
        }

        // ★ raw_data 삭제
        String uploadId = extractUploadIdFromS3Key(fileToDelete.getS3Key());
        if (uploadId != null) {
            long deleted = mongoTemplate.getCollection("raw_data")
                    .deleteMany(new org.bson.Document("upload_id", uploadId))
                    .getDeletedCount();
            log.info("raw_data 삭제: uploadId={}, count={}", uploadId, deleted);
        }

        fileSession.getUploadedFiles().removeIf(f -> f.getFileId().equals(fileId));

        if (fileSession.getUploadedFiles().isEmpty()) {
            fileSessionRepository.delete(fileSession);
            log.info("빈 세션 완전 삭제: sessionId={}", fileSession.getSessionId());
        } else {
            fileSession.setUpdatedAt(LocalDateTime.now());
            fileSessionRepository.save(fileSession);
        }

        log.info("파일 삭제 완료: fileId={}", fileId);
    }





    /**
     * 파일 컬럼 설정 (계정명, 금액 컬럼)
     * ⭐ 선택 시 자동으로 계정명 추출 & 금액 계산 & 저장
     */
    @Transactional
    public UploadedFileInfo updateFileColumns( // 메서드 이름 변경
                                               String projectId, String fileId, SetFileColumnsRequest request) {

        log.info("파일 컬럼 분석 및 업데이트: projectId={}, fileId={}, account={}, amount={}",
                projectId, fileId, request.getAccountColumnName(), request.getAmountColumnName());

        // 1. 파일 세션 및 파일 정보 조회
        FileSession fileSession = fileSessionRepository.findFirstByUploadedFilesFileId(fileId)
                .orElseThrow(() -> new BusinessException("FILE_NOT_FOUND", "파일을 찾을 수 없습니다: " + fileId));

        UploadedFileInfo fileInfo = fileSession.getUploadedFiles().stream()
                .filter(f -> f.getFileId().equals(fileId))
                .findFirst()
                .orElseThrow(() -> new BusinessException("FILE_NOT_FOUND", "파일을 찾을 수 없습니다: " + fileId));

        // 2. 계정명 컬럼이 선택된 경우 -> 데이터 추출 및 저장
        if (request.getAccountColumnName() != null) {
            fileInfo.setAccountColumnName(request.getAccountColumnName());

            // S3 다운로드 -> 엑셀 파싱 -> 중복제거된 리스트 반환
            List<String> accountValues = extractAccountValuesInternal(
                    fileInfo.getS3Key(),
                    request.getAccountColumnName()
            );
            fileInfo.setAccountContents(accountValues); // DB 저장용 필드 업데이트
            log.info("계정명 그룹핑 완료: {} 개 항목", accountValues.size());
        }

        // 3. 금액 컬럼이 선택된 경우 -> 합계 계산 및 저장
        if (request.getAmountColumnName() != null) {
            fileInfo.setAmountColumnName(request.getAmountColumnName());

            // S3 다운로드 -> 엑셀 파싱 -> 합계 반환
            Double totalAmount = calculateTotalAmountInternal(
                    fileInfo.getS3Key(),
                    request.getAmountColumnName()
            );
            fileInfo.setTotalAmount(totalAmount); // DB 저장용 필드 업데이트
            log.info("금액 합산 완료: {}", totalAmount);
        }

        // ⭐⭐⭐ [신규 추가] 세션 전체 통계 재계산 및 저장 ⭐⭐⭐
        recalculateSessionStats(fileSession);

        // 4. 변경사항 저장
        fileSession.setUpdatedAt(LocalDateTime.now());
        fileSessionRepository.save(fileSession);

        return fileInfo;
    }

    // ⭐ [신규 헬퍼 메서드] 세션 통계 재계산
    private void recalculateSessionStats(FileSession session) {
        if (session.getUploadedFiles() == null) return;

        // 1. 총 행 수 합산
        long totalRows = session.getUploadedFiles().stream()
                .mapToLong(f -> f.getRowCount() != null ? f.getRowCount() : 0L)
                .sum();
        session.setTotalRowCount(totalRows);

        // 2. 총 금액 합산
        long totalAmount = session.getUploadedFiles().stream()
                .mapToLong(f -> f.getTotalAmount() != null ? f.getTotalAmount().longValue() : 0L)
                .sum();
        session.setTotalAmount(totalAmount);

        // 3. 계정명 컬럼 목록 (중복 제거)
        List<String> accountCols = session.getUploadedFiles().stream()
                .map(UploadedFileInfo::getAccountColumnName)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        session.setAccountColumnNames(accountCols);

        // 4. 계정명 값 목록 (중복 제거)
        List<String> accountNames = session.getUploadedFiles().stream()
                .map(UploadedFileInfo::getAccountContents)
                .filter(Objects::nonNull)
                .flatMap(List::stream)
                .distinct()
                .collect(Collectors.toList());
        session.setAccountNames(accountNames);
    }

    /**
     * 계정명 추출 (내부 메서드)
     */
    private List<String> extractAccountValuesInternal(String s3Key, String columnName) {
        String uploadId = extractUploadIdFromS3Key(s3Key);
        if (uploadId == null) return extractAccountValuesFromExcel(s3Key, columnName);

        String cacheKey = "accounts:" + uploadId + ":" + columnName;
        String cached = redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) return Arrays.asList(cached.split("\\|\\|"));

        try {
            Set<String> valueSet = new TreeSet<>();

            try (var cursor = mongoTemplate.getCollection("raw_data")
                    .find(new org.bson.Document("upload_id", uploadId))
                    .projection(new org.bson.Document("data", 1))
                    .batchSize(5000).cursor()) {

                while (cursor.hasNext()) {
                    org.bson.Document doc = cursor.next();
                    org.bson.Document data = doc.get("data", org.bson.Document.class);
                    if (data == null) continue;

                    Object val = data.get(columnName);
                    if (val != null && !val.toString().trim().isEmpty()) {
                        valueSet.add(val.toString().trim());
                    }
                }
            }

            List<String> values = new ArrayList<>(valueSet);
            log.info("계정명 추출 완료: uploadId={}, column={}, count={}", uploadId, columnName, values.size());

            if (!values.isEmpty()) {
                redisTemplate.opsForValue().set(cacheKey, String.join("||", values), Duration.ofMinutes(10));
            }
            return values;

        } catch (Exception e) {
            log.error("raw_data 계정명 추출 실패: uploadId={}", uploadId, e);
            return extractAccountValuesFromExcel(s3Key, columnName);
        }
    }



    // 기존 로직을 fallback용으로 이름만 변경
    private List<String> extractAccountValuesFromExcel(String s3Key, String columnName) {
        File tempFile = null;
        try {
            tempFile = s3Service.downloadFileToTemp(s3Key);
            return ExcelStreamingParser.extractAccountValues(tempFile, columnName);
        } catch (Exception e) {
            log.error("계정명 추출 실패: s3Key={}", s3Key, e);
            return new ArrayList<>();
        } finally {
            if (tempFile != null && tempFile.exists()) {
                tempFile.delete();
            }
        }
    }



    /**
     * 금액 합산 (내부 메서드)
     */
    private Double calculateTotalAmountInternal(String s3Key, String columnName) {
        String uploadId = extractUploadIdFromS3Key(s3Key);
        if (uploadId == null) return calculateTotalAmountFromExcel(s3Key, columnName);

        String cacheKey = "amount:" + uploadId + ":" + columnName;
        String cached = redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) return Double.parseDouble(cached);

        try {
            String fieldPath = "data." + columnName;
            double total = 0.0;
            long count = 0;
            long failCount = 0;

            try (var cursor = mongoTemplate.getCollection("raw_data")
                    .find(new org.bson.Document("upload_id", uploadId))
                    .projection(new org.bson.Document("data", 1))
                    .batchSize(5000).cursor()) {

                while (cursor.hasNext()) {
                    org.bson.Document doc = cursor.next();
                    org.bson.Document data = doc.get("data", org.bson.Document.class);
                    if (data == null) continue;

                    // ★ data.get(columnName)으로 직접 접근 - 점 포함 키도 정상 동작
                    Object val = data.get(columnName);
                    if (val == null) continue;

                    try {
                        if (val instanceof Number num) {
                            total += num.doubleValue();
                            count++;
                        } else {
                            // 쉼표, 공백, 통화기호 제거 후 파싱
                            String str = val.toString()
                                    .replaceAll("[,\\s₩\\\\]", "")
                                    .trim();
                            if (!str.isEmpty() && !str.equals("-") && !str.equals("N/A")) {
                                total += Double.parseDouble(str);
                                count++;
                            }
                        }
                    } catch (NumberFormatException e) {
                        failCount++;
                    }
                }
            }

            log.info("금액 합산 완료: uploadId={}, column={}, total={}, count={}, failCount={}",
                    uploadId, columnName, total, count, failCount);

            redisTemplate.opsForValue().set(cacheKey, String.valueOf(total), Duration.ofMinutes(10));
            return total;

        } catch (Exception e) {
            log.error("raw_data 금액 합산 실패: uploadId={}", uploadId, e);
            return calculateTotalAmountFromExcel(s3Key, columnName);
        }
    }



    // 기존 로직을 fallback용으로 이름만 변경
    private Double calculateTotalAmountFromExcel(String s3Key, String columnName) {
        File tempFile = null;
        try {
            tempFile = s3Service.downloadFileToTemp(s3Key);
            return ExcelStreamingParser.calculateTotalAmount(tempFile, columnName);
        } catch (Exception e) {
            log.error("금액 계산 실패: s3Key={}", s3Key, e);
            return 0.0;
        } finally {
            if (tempFile != null && tempFile.exists()) {
                tempFile.delete();
            }
        }
    }

    private String extractUploadIdFromS3Key(String s3Key) {
        if (s3Key == null) return null;
        // uploads/upload-xxxx/ 패턴에서 upload-xxxx 추출
        int uploadsIdx = s3Key.indexOf("uploads/");
        if (uploadsIdx == -1) return null;
        String afterUploads = s3Key.substring(uploadsIdx + "uploads/".length());
        int slashIdx = afterUploads.indexOf("/");
        if (slashIdx == -1) return null;
        return afterUploads.substring(0, slashIdx);
    }



    /**
     * 프로젝트의 업로드된 파일 목록 조회
     */
    public List<UploadedFileInfo> getProjectFiles(String projectId) {
        List<FileSession> sessions = fileSessionRepository.findByProjectIdAndIsDeletedFalse(projectId);

        // fileId를 키로 사용하여 중복 제거 (Map 활용)
        Map<String, UploadedFileInfo> uniqueFilesMap = new HashMap<>();

        for (FileSession session : sessions) {
            if (session.getUploadedFiles() != null) {
                for (UploadedFileInfo file : session.getUploadedFiles()) {
                    // 이미 존재하는 fileId라면 put하지 않음 (최초 1회만 등록)
                    uniqueFilesMap.putIfAbsent(file.getFileId(), file);
                }
            }
        }

        // Map의 값들만 리스트로 반환
        return new ArrayList<>(uniqueFilesMap.values());
    }


    /**
     * [신규] 파티션 분석 (계정별로 데이터 분리 및 집계)
     * Issue 2 해결: 파일 내 계정명 별로 행을 나누어 통계 계산
     */
    public PartitionAnalysisResponse analyzePartitions(String projectId, List<String> fileIds) {
        List<AccountPartition> partitionList = Collections.synchronizedList(new ArrayList<>());

        log.info("파티션 분석 시작: 대상 파일 {}개", fileIds.size());

        // 파일별 병렬 처리 (파일이 많을 경우 효과적)
        fileIds.parallelStream().forEach(fileId -> {
            try {
                // 1. 파일 정보 조회
                FileSession session = fileSessionRepository.findFirstByUploadedFilesFileId(fileId)
                        .orElseThrow(() -> new BusinessException("FILE_NOT_FOUND", "파일 세션을 찾을 수 없습니다: " + fileId));

                UploadedFileInfo fileInfo = session.getUploadedFiles().stream()
                        .filter(f -> f.getFileId().equals(fileId))
                        .findFirst()
                        .orElseThrow(() -> new BusinessException("FILE_NOT_FOUND", "파일 정보가 없습니다."));

                log.info("[{}] 파일 분석 시작 (계정컬럼: {}, 금액컬럼: {})",
                        fileInfo.getFileName(), fileInfo.getAccountColumnName(), fileInfo.getAmountColumnName());

                // 2. 엑셀 파싱 및 그룹핑 (병렬)
                Map<String, ExcelStreamingParser.PartitionStats> statsMap = groupFileByAccountParallel(fileInfo);

                for (Map.Entry<String, ExcelStreamingParser.PartitionStats> entry : statsMap.entrySet()) {
                    String accountName = entry.getKey();
                    ExcelStreamingParser.PartitionStats stats = entry.getValue();

                    partitionList.add(AccountPartition.builder()
                            .fileId(fileInfo.getFileId())
                            .fileIds(Collections.singletonList(fileInfo.getFileId())) // ⭐ [수정] 리스트에도 추가
                            .fileName(fileInfo.getFileName())
                            .accountName(accountName)
                            .rowCount(stats.getCount())
                            .totalAmount(stats.getAmount())
                            .build());

                    log.debug("[{}] 계정: {}, 행수: {}, 금액: {}",
                            fileInfo.getFileName(), accountName, stats.getCount(), stats.getAmount());
                }

            } catch (Exception e) {
                log.error("파일 분석 중 오류 발생 (fileId: {}): {}", fileId, e.getMessage(), e);
            }
        });

        log.info("파티션 분석 완료: 총 {}개 파티션 생성", partitionList.size());

        return PartitionAnalysisResponse.builder()
                .partitions(partitionList)
                .build();
    }

    // --- 내부 헬퍼 클래스 및 메서드 ---

    @lombok.Data
    private static class PartitionStats {
        private final LongAdder count = new LongAdder();
        private final DoubleAdder amount = new DoubleAdder();

        public void add(double amountVal) {
            count.increment();
            amount.add(amountVal);
        }

        public long getCount() { return count.sum(); }
        public double getAmount() { return amount.sum(); }
    }

    private Map<String, ExcelStreamingParser.PartitionStats> groupFileByAccountParallel(UploadedFileInfo fileInfo) {
        String accountColName = fileInfo.getAccountColumnName();
        String amountColName = fileInfo.getAmountColumnName();

        if (accountColName == null) {
            log.warn("[{}] 계정 컬럼이 설정되지 않아 분석을 건너뜁니다.", fileInfo.getFileName());
            return new ConcurrentHashMap<>();
        }

        File tempFile = null;
        try {
            tempFile = s3Service.downloadFileToTemp(fileInfo.getS3Key());
            return ExcelStreamingParser.groupByAccount(tempFile, accountColName, amountColName);
        } catch (Exception e) {
            log.error("[{}] 엑셀 그룹핑 실패: {}", fileInfo.getFileName(), e.getMessage());
            return new ConcurrentHashMap<>();
        } finally {
            if (tempFile != null && tempFile.exists()) {
                tempFile.delete();
            }
        }
    }


    private int findColumnIndex(Row headerRow, String columnName) {
        if (headerRow == null || columnName == null) return -1;
        for (int i = 0; i < headerRow.getLastCellNum(); i++) {
            Cell cell = headerRow.getCell(i);
            String val = getCellValueAsString(cell);
            if (val != null && val.trim().equalsIgnoreCase(columnName.trim())) return i;
        }
        return -1;
    }

    private String getCellValueAsString(Cell cell) {
        if (cell == null) return null;
        switch (cell.getCellType()) {
            case STRING: return cell.getStringCellValue();
            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) return cell.getLocalDateTimeCellValue().toString();
                return String.valueOf(cell.getNumericCellValue());
            case FORMULA:
                try { return cell.getStringCellValue(); } catch (Exception e) { return String.valueOf(cell.getNumericCellValue()); }
            default: return "";
        }
    }

    // getCellValueAsNumeric 헬퍼 (기존 코드에 없다면 추가)
    private double getCellValueAsNumeric(Cell cell) {
        if (cell == null) return 0.0;
        try {
            switch (cell.getCellType()) {
                case NUMERIC:
                    return cell.getNumericCellValue();
                case STRING:
                    // 콤마 제거 및 공백 제거 후 파싱
                    String val = cell.getStringCellValue().replaceAll("[^0-9.-]", "").trim();
                    return val.isEmpty() ? 0.0 : Double.parseDouble(val);
                case FORMULA:
                    try { return cell.getNumericCellValue(); }
                    catch (Exception e) {
                        String fVal = cell.getStringCellValue().replaceAll("[^0-9.-]", "").trim();
                        return fVal.isEmpty() ? 0.0 : Double.parseDouble(fVal);
                    }
                default:
                    return 0.0;
            }
        } catch (Exception e) {
            // 파싱 실패 시 0.0 반환하고 로그는 남기지 않음 (너무 많이 쌓일 수 있음)
            return 0.0;
        }
    }
}