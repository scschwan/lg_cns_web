package com.example.finance.service.data;

import com.example.finance.exception.BusinessException;
import com.example.finance.model.session.FileSession;
import com.example.finance.model.session.UploadedFileInfo;
import com.example.finance.repository.data.SessionDataRepository;
import com.example.finance.repository.session.FileSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import com.example.finance.enums.ProcessStep;

@Slf4j
@Service
@RequiredArgsConstructor
public class SessionDataService {

    private final MongoTemplate mongoTemplate;
    private final FileSessionRepository fileSessionRepository;
    private final SessionDataRepository sessionDataRepository;

    private static final int BATCH_SIZE = 10_000;
    private static final int THREAD_POOL_SIZE = 4;
    private static final int CURSOR_BATCH_SIZE = 5_000;

    /**
     * 계정 분석 시작 - raw_data → session_data 복사
     *
     * @param sessionId 대상 세션 ID
     * @return 복사된 총 문서 수
     */
    public long startAccountAnalysis(String sessionId) {
        log.info("계정 분석 시작: sessionId={}", sessionId);
        long startTime = System.currentTimeMillis();

        // 1. 세션 정보 조회
        FileSession session = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new BusinessException(
                        "SESSION_NOT_FOUND", "세션을 찾을 수 없습니다: " + sessionId));

        // 2. 기존 session_data 가 있으면 삭제 (재분석 대응)
        if (sessionDataRepository.existsBySessionId(sessionId)) {
            log.info("기존 session_data 삭제: sessionId={}", sessionId);
            sessionDataRepository.deleteBySessionId(sessionId);
        }

        // 3. 파일별 복사 작업 생성
        List<UploadedFileInfo> files = session.getUploadedFiles();
        if (files == null || files.isEmpty()) {
            log.warn("세션에 파일이 없습니다: sessionId={}", sessionId);
            return 0;
        }

        // 4. 세션의 계정명 목록
        List<String> accountNames = session.getAccountNames();
        if (accountNames == null || accountNames.isEmpty()) {
            log.warn("세션에 계정명이 없습니다: sessionId={}", sessionId);
            return 0;
        }

        // 5. 병렬 스레드풀 생성
        ExecutorService executor = Executors.newFixedThreadPool(
                Math.min(THREAD_POOL_SIZE, files.size()));

        AtomicLong totalCopied = new AtomicLong(0);

        try {
            // 6. 파일별 병렬 복사 작업 제출
            List<CompletableFuture<Long>> futures = files.stream()
                    .map(file -> CompletableFuture.supplyAsync(
                            () -> copyFileDataToSession(
                                    session.getProjectId(),
                                    sessionId,
                                    file,
                                    accountNames),
                            executor))
                    .collect(Collectors.toList());

            // 7. 모든 작업 완료 대기 + 결과 집계
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

            for (CompletableFuture<Long> future : futures) {
                try {
                    totalCopied.addAndGet(future.get());
                } catch (ExecutionException e) {
                    log.error("파일 복사 작업 실패: {}", e.getCause().getMessage(), e.getCause());
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    log.error("파일 복사 작업 인터럽트", e);
                }
            }
        } finally {
            executor.shutdown();
            try {
                if (!executor.awaitTermination(30, TimeUnit.MINUTES)) {
                    executor.shutdownNow();
                }
            } catch (InterruptedException e) {
                executor.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }

        long elapsed = System.currentTimeMillis() - startTime;
        log.info("계정 분석 완료: sessionId={}, 복사된 문서 수={}, 소요시간={}ms",
                sessionId, totalCopied.get(), elapsed);

        // 8. 세션 상태 업데이트
        session.setCurrentStep(ProcessStep.FILE_LOAD);

        session.setUpdatedAt(LocalDateTime.now());
        fileSessionRepository.save(session);

        return totalCopied.get();
    }

    /**
     * 단일 파일의 raw_data → session_data 복사 (스레드 단위 작업)
     */
    private long copyFileDataToSession(String projectId,
                                       String sessionId,
                                       UploadedFileInfo file,
                                       List<String> accountNames) {
        String uploadId = extractUploadIdFromS3Key(file.getS3Key());
        String accountColumnName = file.getAccountColumnName();

        if (uploadId == null || accountColumnName == null) {
            log.warn("[{}] uploadId 또는 accountColumnName이 없어 건너뜁니다.", file.getFileName());
            return 0;
        }

        log.info("[{}] 복사 시작: uploadId={}, 계정컬럼={}, 계정값={}",
                file.getFileName(), uploadId, accountColumnName, accountNames);

        String dataFieldKey = "data." + accountColumnName;

        Criteria criteria = Criteria.where("upload_id").is(uploadId)
                .and(dataFieldKey).in(accountNames);

        long copiedCount = 0;
        int skip = 0;
        LocalDateTime now = LocalDateTime.now();

        while (true) {
            // CURSOR_BATCH_SIZE 만큼씩 조회
            Query query = new Query(criteria)
                    .skip(skip)
                    .limit(CURSOR_BATCH_SIZE);

            List<Document> rawDocs = mongoTemplate.find(query, Document.class, "raw_data");

            if (rawDocs.isEmpty()) {
                break;
            }

            // 변환 + 배치 insert
            List<Document> batch = new ArrayList<>(rawDocs.size());
            for (Document rawDoc : rawDocs) {
                Document sessionDoc = new Document();
                sessionDoc.put("project_id", projectId);
                sessionDoc.put("session_id", sessionId);
                sessionDoc.put("raw_data_id", rawDoc.getObjectId("_id").toString());
                sessionDoc.put("upload_id", uploadId);
                sessionDoc.put("row_number", rawDoc.getInteger("row_number"));
                sessionDoc.put("data", rawDoc.get("data"));
                sessionDoc.put("created_at", now);
                batch.add(sessionDoc);
            }

            mongoTemplate.getCollection("session_data").insertMany(batch);
            copiedCount += batch.size();
            skip += rawDocs.size();

            log.debug("[{}] 배치 insert 완료: {}건 (누적: {}건)",
                    file.getFileName(), batch.size(), copiedCount);

            // 조회된 건수가 CURSOR_BATCH_SIZE보다 작으면 마지막 페이지
            if (rawDocs.size() < CURSOR_BATCH_SIZE) {
                break;
            }
        }

        log.info("[{}] 복사 완료: {}건", file.getFileName(), copiedCount);
        return copiedCount;
    }


    /**
     * s3Key에서 uploadId 추출
     * 형식: "projects/{projectId}/sessions/{sessionId}/uploads/{uploadId}/{fileName}"
     */
    private String extractUploadIdFromS3Key(String s3Key) {
        if (s3Key == null) return null;
        String[] parts = s3Key.split("/");
        // parts[0]=projects, [1]=projectId, [2]=sessions, [3]=sessionId,
        // [4]=uploads, [5]=uploadId, [6]=fileName
        if (parts.length >= 6) {
            return parts[5];
        }
        log.warn("s3Key에서 uploadId를 추출할 수 없습니다: {}", s3Key);
        return null;
    }

    /**
     * 세션의 session_data 건수 조회
     */
    public long getSessionDataCount(String sessionId) {
        return sessionDataRepository.countBySessionId(sessionId);
    }

    /**
     * 세션의 session_data 삭제 (재분석 또는 세션 삭제 시)
     */
    public void deleteSessionData(String sessionId) {
        log.info("session_data 삭제: sessionId={}", sessionId);
        sessionDataRepository.deleteBySessionId(sessionId);
    }
}
