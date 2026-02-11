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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Sort;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.databind.ObjectMapper;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

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
    private final FileSessionService fileSessionService;
    private final S3Service s3Service;
    private final SqsClient sqsClient;
    private final MongoTemplate mongoTemplate;

    @Value("${aws.sqs.excel-queue-url}")
    private String sqsQueueUrl;

    private static final int CHUNK_SIZE = 50000; // Worker Lambda 청크 크기

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
     * ★ COMPLETED 감지 시 file_sessions.row_count 자동 업데이트
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

            // ★ COMPLETED 감지 시 file_sessions.row_count 업데이트
            String currentStatus = rawData.getOrDefault("status", "UNKNOWN");
            if ("COMPLETED".equals(currentStatus)) {
                String sessionId = rawData.get("sessionId");
                String s3Key = rawData.get("s3Key");
                if (sessionId != null) {
                    long finalRowCount = syncFileSessionRowCount(uploadId, sessionId, s3Key);
                    if (finalRowCount > 0) {
                        status.put("processedRows", finalRowCount);
                    }
                }
            }

            return status;

        } catch (Exception e) {
            log.error("Redis 조회 중 오류 발생: uploadId={}, error={}", uploadId, e.getMessage());
            throw new RuntimeException("업로드 상태 조회 실패: " + e.getMessage());
        }
    }

    /**
     * ★ COMPLETED 시 file_sessions.row_count를 정확한 값으로 업데이트
     *
     * - raw_data.countDocuments()로 정확한 행 수 조회 (모든 Worker 완료 후이므로 정확)
     * - file_sessions.row_count가 아직 0이면 업데이트 (멱등성 보장)
     * - 컬럼 정보도 함께 업데이트
     *
     * @return 업데이트된 row count (이미 업데이트 완료면 기존 값, 실패면 0)
     */
    private long syncFileSessionRowCount(String uploadId, String sessionId, String s3Key) {
        try {
            FileSession session = fileSessionRepository.findBySessionId(sessionId).orElse(null);
            if (session == null || session.getUploadedFiles() == null) return 0;

            // uploadId가 포함된 s3Key를 가진 파일 찾기
            Optional<UploadedFileInfo> fileOpt = session.getUploadedFiles().stream()
                    .filter(f -> {
                        if (f.getS3Key() == null) return false;
                        String fUploadId = extractUploadIdFromS3Key(f.getS3Key());
                        return uploadId.equals(fUploadId);
                    })
                    .findFirst();

            if (fileOpt.isEmpty()) return 0;

            UploadedFileInfo file = fileOpt.get();

            // 이미 정확한 rowCount가 설정되어 있으면 스킵 (멱등성)
            if (file.getRowCount() != null && file.getRowCount() > 0) {
                return file.getRowCount();
            }

            // raw_data에서 정확한 count 조회 (COMPLETED 이후이므로 모든 데이터 존재)
            long rowCount = mongoTemplate.getCollection("raw_data")
                    .countDocuments(new org.bson.Document("upload_id", uploadId));

            if (rowCount == 0) {
                log.warn("COMPLETED인데 raw_data가 비어있음: uploadId={}", uploadId);
                return 0;
            }

            // 컬럼 정보 추출
            if (file.getDetectedColumns() == null || file.getDetectedColumns().isEmpty()) {
                org.bson.Document rawDoc = mongoTemplate.getCollection("raw_data")
                        .find(new org.bson.Document("upload_id", uploadId))
                        .limit(1)
                        .first();

                if (rawDoc != null) {
                    Object dataObj = rawDoc.get("data");
                    if (dataObj instanceof org.bson.Document dataDoc) {
                        file.setDetectedColumns(new ArrayList<>(dataDoc.keySet()));
                    }
                }
            }

            // ★ row_count 업데이트
            file.setRowCount(rowCount);
            file.setUploadStatus("UPLOADED");
            session.setUpdatedAt(LocalDateTime.now());
            fileSessionRepository.save(session);

            log.info("★ file_sessions rowCount 업데이트 완료: uploadId={}, rowCount={}, sessionId={}",
                    uploadId, rowCount, sessionId);
            return rowCount;

        } catch (Exception e) {
            log.warn("file_sessions rowCount 업데이트 실패: uploadId={}, error={}", uploadId, e.getMessage());
            return 0;
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

        String uploadId = extractUploadIdFromS3Key(request.getS3Key());
        ExcelMetadata metadata = null;

        // ★ row_count는 getUploadStatus()에서 COMPLETED 감지 시 업데이트
        // completeFileUpload()에서는 partial count를 사용하지 않음
        // UI가 rowCount != 0을 "업로드 완료"로 표시하므로, Lambda 완료 전에는 0 유지
        if (uploadId != null) {
            try {
                Object statusObj = redisTemplate.opsForHash().get(UPLOAD_STATUS_KEY_PREFIX + uploadId, "status");
                String status = statusObj != null ? statusObj.toString() : null;

                if ("COMPLETED".equals(status)) {
                    // 이미 완료된 경우에만 즉시 row count 설정
                    long rowCount = mongoTemplate.getCollection("raw_data")
                            .countDocuments(new org.bson.Document("upload_id", uploadId));
                    if (rowCount > 0) {
                        org.bson.Document rawDoc = mongoTemplate.getCollection("raw_data")
                                .find(new org.bson.Document("upload_id", uploadId))
                                .limit(1).first();
                        List<String> columns = new ArrayList<>();
                        if (rawDoc != null) {
                            Object dataObj = rawDoc.get("data");
                            if (dataObj instanceof org.bson.Document dataDoc) {
                                columns.addAll(dataDoc.keySet());
                            }
                        }
                        metadata = new ExcelMetadata(columns, rowCount);
                        log.info("Lambda 이미 COMPLETED: uploadId={}, rows={}", uploadId, rowCount);
                    }
                } else {
                    log.info("Lambda 처리 중 (status={}), rowCount=0 유지 → getUploadStatus에서 업데이트 예정: uploadId={}",
                            status, uploadId);
                }
            } catch (Exception e) {
                log.warn("Redis 상태 조회 실패: uploadId={}", uploadId);
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
                .uploadStatus(metadataReady ? "UPLOADED" : "PROCESSING")
                .build();

        fileSession.getUploadedFiles().add(fileInfo);
        fileSession.setTotalFiles(fileSession.getUploadedFiles().size());
        fileSession.setUpdatedAt(LocalDateTime.now());
        fileSessionRepository.save(fileSession);

        // 대용량: S3 Event → Coordinator가 먼저 처리, 백엔드는 백업 전용
        if (!metadataReady) {
            final String s3Key = request.getS3Key();
            final Long fileSize = request.getFileSize();
            final String fileName = request.getFileName();
            metadataExecutor.submit(() -> {
                // ★ S3 Event → ExcelCoordinator 직접 호출 구조로 변경됨
                // triggerWorkerLambdaIfNeeded는 비활성화 (Coordinator가 직접 처리)
                // triggerWorkerLambdaIfNeeded(projectId, fileSession.getSessionId(), uploadId,
                //         "finance-excel-uploads", s3Key, fileName, fileSize);

                // Lambda 완료 대기 후 메타데이터 업데이트
                updateFileMetadataAsync(fileSession.getSessionId(), fileId, s3Key);
            });
        }

        log.info("파일 업로드 완료: fileId={}, metadataReady={}, rowCount={}",
                fileId, metadataReady, metadataReady ? metadata.rowCount : 0);

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
     * ★ Backend SQS Coordinator (백업 전용)
     *
     * S3 Event → ExcelCoordinator가 먼저 처리하도록 20초 대기 후,
     * Redis에서 상태를 확인하여 Coordinator가 미처리 시에만 SQS 발행.
     * 이중 트리거 방지.
     */
    private void triggerWorkerLambdaIfNeeded(String projectId, String sessionId, String uploadId,
                                              String s3Bucket, String s3Key, String fileName, Long fileSize) {
        try {
            String statusKey = UPLOAD_STATUS_KEY_PREFIX + uploadId;
            String coordinatorLockKey = "coordinator:lock:" + uploadId;

            // ★ Coordinator가 처리할 시간을 충분히 대기 (대용량 파일 XML 분석에 2분+ 소요 가능)
            log.info("Coordinator 처리 대기 (20초): uploadId={}", uploadId);
            Thread.sleep(20000);

            // ★ 1차 확인: Coordinator 락 존재 여부 (Coordinator가 시작했으면 락이 있음)
            Boolean lockExists = redisTemplate.hasKey(coordinatorLockKey);
            if (Boolean.TRUE.equals(lockExists)) {
                log.info("★ Coordinator 락 확인됨 (처리 중), 백엔드 SQS 발행 스킵: uploadId={}", uploadId);
                return;
            }

            // ★ 2차 확인: Redis 상태 확인 (이미 처리 중이거나 완료된 경우)
            Object statusObj = redisTemplate.opsForHash().get(statusKey, "status");
            String status = statusObj != null ? statusObj.toString() : null;

            if ("PROCESSING".equals(status) || "COMPLETED".equals(status)) {
                log.info("★ Coordinator 이미 처리 중 (status={}), 백엔드 SQS 발행 스킵: uploadId={}",
                        status, uploadId);
                return;
            }

            // Coordinator가 미처리 → 백엔드가 백업으로 SQS 발행
            log.info("★ Coordinator 미처리 감지, 백엔드 백업 SQS 발행 시작: uploadId={}", uploadId);

            int estimatedRows = (int) Math.max(fileSize / 50, 1000);
            int totalChunks = (int) Math.ceil((double) estimatedRows / CHUNK_SIZE);

            log.info("★ Worker Lambda 트리거: uploadId={}, fileSize={}, estimatedRows={}, chunks={}",
                    uploadId, fileSize, estimatedRows, totalChunks);

            ObjectMapper mapper = new ObjectMapper();

            // ★ 백업 메시지에도 coordinatorRunId 포함 (Worker에서 stale 메시지 구분 가능하도록)
            String backupRunId = "backup-" + UUID.randomUUID().toString();

            for (int i = 0; i < totalChunks; i++) {
                int startRow = i * CHUNK_SIZE + 2;
                int endRow = Math.min((i + 1) * CHUNK_SIZE + 1, estimatedRows + 1);

                Map<String, Object> message = new LinkedHashMap<>();
                message.put("projectId", projectId);
                message.put("sessionId", sessionId);
                message.put("uploadId", uploadId);
                message.put("s3Bucket", s3Bucket);
                message.put("s3Key", s3Key);
                message.put("fileName", fileName);
                message.put("startRow", startRow);
                message.put("endRow", endRow);
                message.put("totalRows", estimatedRows);
                message.put("chunkNumber", i + 1);
                message.put("totalChunks", totalChunks);
                message.put("isFirstChunk", i == 0);
                message.put("coordinatorRunId", backupRunId);

                String messageBody = mapper.writeValueAsString(message);

                sqsClient.sendMessage(SendMessageRequest.builder()
                        .queueUrl(sqsQueueUrl)
                        .messageBody(messageBody)
                        .build());
            }

            log.info("★ 백엔드 백업 SQS 발행 완료: uploadId={}, {} chunks, backupRunId={}",
                    uploadId, totalChunks, backupRunId);

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.error("★ Worker Lambda 트리거 실패: uploadId={}", uploadId, e);
        }
    }

    /**
     * 비동기 메타데이터 업데이트 (전용 스레드풀에서 실행)
     *
     * ★ 2차 안전장치 (백업)
     *   - 1차: Worker Lambda가 COMPLETED 시점에 직접 file_sessions 업데이트
     *   - 2차: 이 메서드가 COMPLETED 대기 후 row_count가 아직 0이면 업데이트
     *
     * Lambda가 정상 동작하면 이 메서드가 실행될 때 이미 row_count > 0이므로 스킵됨
     */
    private void updateFileMetadataAsync(String sessionId, String fileId, String s3Key) {
        String uploadId = extractUploadIdFromS3Key(s3Key);
        if (uploadId == null) return;

        try {
            String statusKey = UPLOAD_STATUS_KEY_PREFIX + uploadId;

            // ━━━ Phase 1: Lambda 처리 대기 (최대 10분) ━━━
            for (int retry = 0; retry < 120; retry++) { // 5초 * 120 = 10분
                try {
                    Object statusObj = redisTemplate.opsForHash().get(statusKey, "status");
                    String status = statusObj != null ? statusObj.toString() : "PENDING";

                    if ("COMPLETED".equals(status)) {
                        log.info("Lambda 업로드 완료 감지 (백업): uploadId={}, retry={}", uploadId, retry);
                        break;
                    } else if ("FAILED".equals(status)) {
                        log.error("Lambda 업로드 실패: uploadId={}", uploadId);
                        return;
                    }

                    if (retry % 12 == 0) { // 1분마다 로그
                        Object progressObj = redisTemplate.opsForHash().get(statusKey, "progress");
                        String progress = progressObj != null ? progressObj.toString() : "0";
                        log.info("Lambda 대기 중 (백업): uploadId={}, status={}, progress={}%",
                                uploadId, status, progress);
                    }
                } catch (Exception e) {
                    log.warn("Redis 상태 조회 실패 (재시도): uploadId={}", uploadId);
                }

                Thread.sleep(5000);
            }

            // ━━━ Phase 2: syncFileSessionRowCount로 row_count 업데이트 ━━━
            // Worker Lambda가 이미 업데이트했으면 내부에서 멱등성 체크로 스킵됨
            long result = syncFileSessionRowCount(uploadId, sessionId, s3Key);
            log.info("메타데이터 백업 업데이트 결과: uploadId={}, rowCount={}", uploadId, result);

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.error("메타데이터 백업 업데이트 실패: uploadId={}", uploadId, e);
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

            // ★ upload_sessions 삭제
            try {
                uploadSessionRepository.deleteByUploadId(uploadId);
                log.info("upload_sessions 삭제: uploadId={}", uploadId);
            } catch (Exception e) {
                log.warn("upload_sessions 삭제 실패 (계속 진행): uploadId={}", uploadId, e);
            }

            // ★ Redis 업로드 상태 삭제
            try {
                redisTemplate.delete(UPLOAD_STATUS_KEY_PREFIX + uploadId);
            } catch (Exception e) {
                log.warn("Redis 업로드 상태 삭제 실패 (계속 진행): uploadId={}", uploadId);
            }
        }

        fileSession.getUploadedFiles().removeIf(f -> f.getFileId().equals(fileId));

        if (fileSession.getUploadedFiles().isEmpty()) {
            fileSessionRepository.delete(fileSession);
            log.info("빈 세션 완전 삭제: sessionId={}", fileSession.getSessionId());
        } else {
            fileSession.setUpdatedAt(LocalDateTime.now());
            fileSessionRepository.save(fileSession);
        }

        // ★ 프로젝트 통계 재계산 (totalSessions, totalFiles 등)
        fileSessionService.refreshProjectStats(projectId);

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
                    if (val != null) {
                        String strVal = val.toString().trim();
                        // StreamingCell@xxx 형태의 오염된 데이터 필터링
                        if (!strVal.isEmpty() && !strVal.contains("StreamingCell@")) {
                            valueSet.add(strVal);
                        }
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
        int uploadsIdx = s3Key.indexOf("uploads/");
        if (uploadsIdx == -1) {
            log.warn("uploads/ 경로를 찾을 수 없음: s3Key={}", s3Key);
            return null;
        }
        String afterUploads = s3Key.substring(uploadsIdx + "uploads/".length());
        int slashIdx = afterUploads.indexOf("/");
        if (slashIdx == -1) {
            log.warn("upload ID 추출 실패: s3Key={}", s3Key);
            return null;
        }
        String uploadId = afterUploads.substring(0, slashIdx);
        log.info("uploadId 추출: s3Key={} → uploadId={}", s3Key, uploadId);
        return uploadId;
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
     *
     * ⭐ 2단계 최적화: S3 다운로드 제거 → raw_data MongoDB aggregation + Redis 캐싱
     *    - 기존: S3 다운로드 → Excel SAX 파싱 (15초+)
     *    - 변경: raw_data aggregation pipeline (1~2초)
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

                // 2. raw_data aggregation 우선 → fallback으로 Excel 파싱
                Map<String, ExcelStreamingParser.PartitionStats> statsMap = groupFileByAccountParallel(fileInfo);

                for (Map.Entry<String, ExcelStreamingParser.PartitionStats> entry : statsMap.entrySet()) {
                    String accountName = entry.getKey();
                    ExcelStreamingParser.PartitionStats stats = entry.getValue();

                    partitionList.add(AccountPartition.builder()
                            .fileId(fileInfo.getFileId())
                            .fileIds(Collections.singletonList(fileInfo.getFileId()))
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

    /**
     * ⭐ 2단계 최적화: raw_data MongoDB aggregation 우선, fallback으로 S3/Excel
     *
     * 변경 전: S3 다운로드 → 임시파일 → ExcelStreamingParser SAX 파싱 (15초+)
     * 변경 후: MongoDB aggregation pipeline으로 계정별 그룹핑 (1~2초)
     *         + Redis 캐싱 (10분 TTL)
     */
    private Map<String, ExcelStreamingParser.PartitionStats> groupFileByAccountParallel(UploadedFileInfo fileInfo) {
        String accountColName = fileInfo.getAccountColumnName();
        String amountColName = fileInfo.getAmountColumnName();

        if (accountColName == null) {
            log.warn("[{}] 계정 컬럼이 설정되지 않아 분석을 건너뜁니다.", fileInfo.getFileName());
            return new ConcurrentHashMap<>();
        }

        // ★ raw_data aggregation 시도
        String uploadId = extractUploadIdFromS3Key(fileInfo.getS3Key());
        if (uploadId != null) {
            Map<String, ExcelStreamingParser.PartitionStats> result = groupByAccountFromRawData(uploadId, accountColName, amountColName, fileInfo.getFileName());
            if (result != null) {
                // 금액 컬럼이 설정되었는데 모든 계정의 금액이 0이면 → Excel fallback으로 금액 재계산
                if (amountColName != null && !result.isEmpty()) {
                    boolean allAmountsZero = result.values().stream()
                            .allMatch(stats -> stats.getAmount() == 0.0);
                    if (allAmountsZero) {
                        log.warn("[{}] raw_data aggregation 금액 합산 결과가 모두 0 → Excel fallback으로 금액 재계산", fileInfo.getFileName());
                        // 잘못된 캐시 데이터 삭제
                        try {
                            String cacheKey = "partition:" + uploadId + ":" + accountColName + ":" + amountColName;
                            redisTemplate.delete(cacheKey);
                        } catch (Exception ignored) {}
                        Map<String, ExcelStreamingParser.PartitionStats> excelResult = groupByAccountFromExcel(fileInfo);
                        if (!excelResult.isEmpty()) {
                            // Excel 결과에서 금액이 실제로 있으면 Excel 결과 사용
                            boolean excelHasAmounts = excelResult.values().stream()
                                    .anyMatch(stats -> stats.getAmount() != 0.0);
                            if (excelHasAmounts) {
                                log.info("[{}] Excel fallback 금액 재계산 성공 → Excel 결과 사용", fileInfo.getFileName());
                                return excelResult;
                            }
                        }
                        // Excel에서도 0이면 원래 aggregation 결과 반환 (실제로 금액이 0인 경우)
                    }
                }
                return result;
            }
        }

        // ★ Fallback: S3 다운로드 → Excel 파싱 (raw_data 없을 경우)
        log.warn("[{}] raw_data 없음, S3/Excel fallback 사용", fileInfo.getFileName());
        return groupByAccountFromExcel(fileInfo);
    }

    /**
     * ⭐ raw_data MongoDB aggregation으로 계정별 그룹핑
     *    - S3 다운로드 없이 DB에서 직접 집계
     *    - Redis 캐싱 적용 (10분 TTL)
     *
     * @return 집계 결과 Map, raw_data가 없으면 null (fallback 유도)
     */
    private Map<String, ExcelStreamingParser.PartitionStats> groupByAccountFromRawData(
            String uploadId, String accountColName, String amountColName, String fileName) {

        // 1. Redis 캐시 확인
        String cacheKey = "partition:" + uploadId + ":" + accountColName + ":" + (amountColName != null ? amountColName : "none");
        try {
            Map<Object, Object> cached = redisTemplate.opsForHash().entries(cacheKey);
            if (!cached.isEmpty()) {
                Map<String, ExcelStreamingParser.PartitionStats> result = new ConcurrentHashMap<>();
                for (Map.Entry<Object, Object> entry : cached.entrySet()) {
                    String accountName = entry.getKey().toString();
                    String[] parts = entry.getValue().toString().split("\\|");
                    long count = Long.parseLong(parts[0]);
                    double amount = Double.parseDouble(parts[1]);
                    result.put(accountName, createPartitionStats(count, amount));
                }
                log.info("[{}] 파티션 분석 Redis 캐시 히트: uploadId={}, 파티션 {}개", fileName, uploadId, result.size());
                return result;
            }
        } catch (Exception e) {
            log.warn("Redis 캐시 조회 실패 (무시): {}", e.getMessage());
        }

        // 2. raw_data 존재 확인
        long rawDataCount = mongoTemplate.getCollection("raw_data")
                .countDocuments(new org.bson.Document("upload_id", uploadId));

        if (rawDataCount == 0) {
            log.info("[{}] raw_data 없음: uploadId={}", fileName, uploadId);
            return null; // fallback 유도
        }

        // 3. MongoDB Aggregation Pipeline
        try {
            long startTime = System.currentTimeMillis();

            String accountField = "data." + accountColName;
            List<org.bson.Document> pipeline = new ArrayList<>();

            // Stage 1: uploadId로 필터링
            pipeline.add(new org.bson.Document("$match",
                    new org.bson.Document("upload_id", uploadId)));

            // Stage 2: 계정명으로 그룹핑 + 행 수 카운트 + 금액 합산
            org.bson.Document groupFields = new org.bson.Document("_id", "$" + accountField)
                    .append("count", new org.bson.Document("$sum", 1));

            if (amountColName != null) {
                String amountField = "data." + amountColName;
                // DocumentDB 호환: $type 체크로 숫자 타입만 합산 (double/int/long/decimal)
                // $convert는 DocumentDB에서 문자열→숫자 변환이 불안정하므로, $type 기반으로 변경
                groupFields.append("totalAmount", new org.bson.Document("$sum",
                        new org.bson.Document("$cond", Arrays.asList(
                                new org.bson.Document("$or", Arrays.asList(
                                        new org.bson.Document("$eq", Arrays.asList(
                                                new org.bson.Document("$type", "$" + amountField), "double")),
                                        new org.bson.Document("$eq", Arrays.asList(
                                                new org.bson.Document("$type", "$" + amountField), "int")),
                                        new org.bson.Document("$eq", Arrays.asList(
                                                new org.bson.Document("$type", "$" + amountField), "long")),
                                        new org.bson.Document("$eq", Arrays.asList(
                                                new org.bson.Document("$type", "$" + amountField), "decimal"))
                                )),
                                "$" + amountField,
                                0
                        ))));
            }

            pipeline.add(new org.bson.Document("$group", groupFields));

            // Stage 3: 계정명 정렬
            pipeline.add(new org.bson.Document("$sort", new org.bson.Document("_id", 1)));

            // 실행
            List<org.bson.Document> results = mongoTemplate.getCollection("raw_data")
                    .aggregate(pipeline)
                    .into(new ArrayList<>());

            long elapsed = System.currentTimeMillis() - startTime;

            // 4. 결과 변환
            Map<String, ExcelStreamingParser.PartitionStats> statsMap = new ConcurrentHashMap<>();
            Map<String, String> cacheData = new HashMap<>();

            for (org.bson.Document doc : results) {
                Object idObj = doc.get("_id");
                if (idObj == null) continue;

                String accountName = idObj.toString().trim();
                if (accountName.isEmpty()) continue;

                // count도 Number 타입으로 안전하게 추출 (DocumentDB가 Long 반환 가능)
                Object countObj = doc.get("count");
                long count = (countObj instanceof Number) ? ((Number) countObj).longValue() : 0L;
                double amount = 0.0;
                if (amountColName != null) {
                    Object totalAmountObj = doc.get("totalAmount");
                    if (totalAmountObj instanceof Number) {
                        amount = ((Number) totalAmountObj).doubleValue();
                    }
                }

                log.info("[{}] 계정={}, count={}, amount={}, amountType={}",
                        fileName, accountName, count, amount,
                        doc.get("totalAmount") != null ? doc.get("totalAmount").getClass().getSimpleName() : "null");

                statsMap.put(accountName, createPartitionStats(count, amount));
                cacheData.put(accountName, count + "|" + amount);
            }

            log.info("[{}] raw_data aggregation 완료: uploadId={}, 파티션 {}개, {}ms",
                    fileName, uploadId, statsMap.size(), elapsed);

            // 5. Redis 캐시 저장 (10분 TTL)
            if (!cacheData.isEmpty()) {
                try {
                    redisTemplate.opsForHash().putAll(cacheKey, cacheData);
                    redisTemplate.expire(cacheKey, Duration.ofMinutes(10));
                } catch (Exception e) {
                    log.warn("Redis 캐시 저장 실패 (무시): {}", e.getMessage());
                }
            }

            return statsMap;

        } catch (Exception e) {
            log.error("[{}] raw_data aggregation 실패: uploadId={}", fileName, uploadId, e);
            return null; // fallback 유도
        }
    }

    /**
     * PartitionStats 생성 헬퍼 (count, amount 직접 설정)
     */
    private ExcelStreamingParser.PartitionStats createPartitionStats(long count, double totalAmount) {
        ExcelStreamingParser.PartitionStats stats = new ExcelStreamingParser.PartitionStats();
        // count 횟수만큼 호출하되, 마지막에만 실제 금액 추가
        if (count > 0) {
            for (long i = 0; i < count - 1; i++) {
                stats.add(0);
            }
            stats.add(totalAmount);
        }
        return stats;
    }

    /**
     * Fallback: S3 다운로드 → Excel SAX 파싱 (기존 로직)
     */
    private Map<String, ExcelStreamingParser.PartitionStats> groupByAccountFromExcel(UploadedFileInfo fileInfo) {
        File tempFile = null;
        try {
            tempFile = s3Service.downloadFileToTemp(fileInfo.getS3Key());
            return ExcelStreamingParser.groupByAccount(tempFile, fileInfo.getAccountColumnName(), fileInfo.getAmountColumnName());
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