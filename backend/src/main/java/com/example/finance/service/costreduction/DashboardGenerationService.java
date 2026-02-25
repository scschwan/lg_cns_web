package com.example.finance.service.costreduction;

import com.example.finance.enums.ProcessStep;
import com.example.finance.model.data.ClusteringResult;
import com.example.finance.model.data.ProcessViewData;
import com.example.finance.model.data.RawDataDocument;
import com.example.finance.model.data.SessionDataDocument;
import com.example.finance.model.session.FileSession;
import com.example.finance.model.session.UploadedFileInfo;
import com.example.finance.repository.data.ClusteringResultRepository;
import com.example.finance.repository.data.ProcessViewDataRepository;
import com.example.finance.repository.data.SessionDataRepository;
import com.example.finance.repository.session.FileSessionRepository;
import com.example.finance.service.common.RedisService;
import com.example.finance.service.data.ClusterStatisticsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

/**
 * 대시보드 프로젝트 배치 데이터 생성 서비스
 *
 * 업로드된 파일의 raw_data를 읽어 표준 파이프라인을 거쳐
 * session_data → process_view_data → clustering_results → cluster_statistics를
 * 병렬 스레드로 생성한다.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class DashboardGenerationService {

    private final FileSessionRepository fileSessionRepository;
    private final SessionDataRepository sessionDataRepository;
    private final ClusteringResultRepository clusteringResultRepository;
    private final ProcessViewDataRepository processViewDataRepository;
    private final ClusterStatisticsService clusterStatisticsService;
    private final RedisService redisService;
    private final MongoTemplate mongoTemplate;

    // 진행 상태 추적 (projectId → status)
    private final ConcurrentHashMap<String, GenerationStatus> statusMap = new ConcurrentHashMap<>();

    // 대시보드 생성 전용 쓰레드풀 (기본 ForkJoinPool 점유 방지)
    private static final ExecutorService GENERATION_EXECUTOR = Executors.newFixedThreadPool(
            Math.max(2, Runtime.getRuntime().availableProcessors()),
            r -> { Thread t = new Thread(r, "dashboard-gen"); t.setDaemon(true); return t; }
    );

    public static class GenerationStatus {
        public volatile String status = "PROCESSING"; // PROCESSING, COMPLETED, COMPLETED_WITH_ERRORS, FAILED
        public volatile int totalSessions = 0;
        public volatile int completedSessions = 0;
        public volatile List<String> errors = Collections.synchronizedList(new ArrayList<>());
    }

    public static class SessionConfig {
        public String sessionId;
        public String accountName;
        public String accountColumn;
        public String clusterColumn;
        public String subClusterColumn;
        public String amountColumn;
        public String supplierColumn;
        public String costCenterColumn;
    }

    /**
     * 배치 데이터 생성 시작 (비동기)
     */
    public Map<String, Object> startBatchGeneration(String projectId, String userId, List<SessionConfig> configs) {
        log.info("대시보드 배치 데이터 생성 시작: projectId={}, sessions={}", projectId, configs.size());

        GenerationStatus status = new GenerationStatus();
        status.totalSessions = configs.size();
        statusMap.put(projectId, status);

        CompletableFuture.runAsync(() -> {
            try {
                processBatch(projectId, userId, configs, status);
            } catch (Exception e) {
                log.error("배치 생성 실패: projectId={}", projectId, e);
                status.status = "FAILED";
                status.errors.add(e.getMessage());
            }
        }, GENERATION_EXECUTOR);

        Map<String, Object> result = new HashMap<>();
        result.put("status", "PROCESSING");
        result.put("totalSessions", configs.size());
        return result;
    }

    /**
     * 배치 생성 진행 상태 조회
     */
    public Map<String, Object> getStatus(String projectId) {
        GenerationStatus status = statusMap.get(projectId);
        Map<String, Object> result = new HashMap<>();
        if (status == null) {
            result.put("status", "NOT_FOUND");
            return result;
        }
        result.put("status", status.status);
        result.put("totalSessions", status.totalSessions);
        result.put("completedSessions", status.completedSessions);
        result.put("errors", status.errors);
        return result;
    }

    /**
     * 배치 처리 메인 로직 (병렬)
     */
    private void processBatch(String projectId, String userId, List<SessionConfig> configs, GenerationStatus status) {
        AtomicInteger completed = new AtomicInteger(0);

        List<CompletableFuture<Void>> futures = configs.stream()
                .map(config -> CompletableFuture.runAsync(() -> {
                    try {
                        processSession(projectId, userId, config);
                        int done = completed.incrementAndGet();
                        status.completedSessions = done;
                        log.info("세션 처리 완료: sessionId={}, {}/{}", config.sessionId, done, configs.size());
                    } catch (Exception e) {
                        log.error("세션 처리 실패: sessionId={}", config.sessionId, e);
                        status.errors.add(config.sessionId + ": " + e.getMessage());
                        status.completedSessions = completed.incrementAndGet();
                    }
                }, GENERATION_EXECUTOR))
                .collect(Collectors.toList());

        try {
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
                    .get(10, TimeUnit.MINUTES);
        } catch (TimeoutException e) {
            log.error("배치 처리 타임아웃 (10분 초과): projectId={}", projectId);
            status.errors.add("처리 시간이 10분을 초과했습니다.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("배치 처리 인터럽트: projectId={}", projectId);
            status.errors.add("처리가 중단되었습니다.");
        } catch (ExecutionException e) {
            log.error("배치 처리 실행 오류: projectId={}", projectId, e);
            status.errors.add("실행 오류: " + e.getMessage());
        }

        invalidateCache(projectId);

        status.status = status.errors.isEmpty() ? "COMPLETED" : "COMPLETED_WITH_ERRORS";
        log.info("대시보드 배치 생성 완료: projectId={}, completed={}, errors={}",
                projectId, status.completedSessions, status.errors.size());
    }

    /**
     * 개별 세션 처리: raw_data → session_data → process_view_data → clustering_results → cluster_statistics
     */
    private void processSession(String projectId, String userId, SessionConfig config) {
        FileSession session = fileSessionRepository.findBySessionId(config.sessionId)
                .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다: " + config.sessionId));

        // ===== 1. raw_data 조회 =====
        List<Map<String, Object>> rows = new ArrayList<>();
        List<String> rawDataIds = new ArrayList<>();
        for (UploadedFileInfo fileInfo : session.getUploadedFiles()) {
            String uploadId = extractUploadId(fileInfo.getS3Key());
            if (uploadId == null) continue;

            Query query = new Query(Criteria.where("upload_id").is(uploadId));
            List<RawDataDocument> rawDocs = mongoTemplate.find(query, RawDataDocument.class, "raw_data");
            for (RawDataDocument doc : rawDocs) {
                if (doc.getData() != null) {
                    String rawDataId = doc.getId() != null ? doc.getId() : UUID.randomUUID().toString();
                    rows.add(doc.getData());
                    rawDataIds.add(rawDataId);
                }
            }
        }

        if (rows.isEmpty()) {
            throw new RuntimeException("데이터가 없습니다: sessionId=" + config.sessionId);
        }

        log.info("raw_data 로드 완료: sessionId={}, rows={}", config.sessionId, rows.size());

        // ===== 2. session_data 생성 =====
        sessionDataRepository.deleteBySessionId(config.sessionId);
        List<SessionDataDocument> sessionDocs = new ArrayList<>();
        // rawDataId 참조를 row와 함께 저장
        List<String> sessionRawDataIds = new ArrayList<>();

        for (int i = 0; i < rows.size(); i++) {
            String rawDataId = rawDataIds.get(i);
            sessionRawDataIds.add(rawDataId);

            sessionDocs.add(SessionDataDocument.builder()
                    .projectId(projectId)
                    .sessionId(config.sessionId)
                    .rawDataId(rawDataId)
                    .rowNumber(i + 1)
                    .data(rows.get(i))
                    .isHidden(false)
                    .createdAt(LocalDateTime.now())
                    .build());
        }
        sessionDataRepository.saveAll(sessionDocs);
        log.info("session_data 생성 완료: sessionId={}, count={}", config.sessionId, sessionDocs.size());

        // ===== 3. process_view_data 생성 =====
        processViewDataRepository.deleteBySessionId(config.sessionId);
        List<ProcessViewData> pvdList = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> row = rows.get(i);
            String rawDataId = sessionRawDataIds.get(i);

            String moneyVal = getStringValue(row, config.amountColumn);
            String dept = getStringValue(row, config.costCenterColumn);
            String sup = getStringValue(row, config.supplierColumn);

            pvdList.add(ProcessViewData.builder()
                    .sessionId(config.sessionId)
                    .projectId(projectId)
                    .rawDataId(rawDataId)
                    .money(moneyVal)
                    .department(dept)
                    .supplier(sup)
                    .keywords(ProcessViewData.Keywords.builder().finalKeywords(new ArrayList<>()).build())
                    .lastModifiedDate(LocalDateTime.now())
                    .build());
        }
        processViewDataRepository.saveAll(pvdList);
        log.info("process_view_data 생성 완료: sessionId={}, count={}", config.sessionId, pvdList.size());

        // ===== 4. clustering_results 생성 =====
        clusteringResultRepository.deleteBySessionId(config.sessionId);

        String clusterCol = config.clusterColumn;
        String subClusterCol = config.subClusterColumn;
        boolean hasSubClusters = subClusterCol != null && !subClusterCol.isBlank();

        // 클러스터별 그룹핑
        Map<String, List<Integer>> clusterGroups = new LinkedHashMap<>();
        for (int i = 0; i < rows.size(); i++) {
            String cn = getStringValue(rows.get(i), clusterCol);
            if (cn == null || cn.isBlank()) cn = "(미분류)";
            clusterGroups.computeIfAbsent(cn, k -> new ArrayList<>()).add(i);
        }

        List<ClusteringResult> results = new ArrayList<>();
        int seq = 1;

        for (var entry : clusterGroups.entrySet()) {
            String clusterName = entry.getKey();
            List<Integer> indices = entry.getValue();
            List<String> dataIndices = indices.stream()
                    .map(sessionRawDataIds::get)
                    .collect(Collectors.toList());

            int cnt = indices.size();
            double amt = sumAmount(indices, rows, config.amountColumn);
            int parentNum = seq;

            // 상위 클러스터 (Level 2)
            results.add(ClusteringResult.builder()
                    .sessionId(config.sessionId)
                    .clusterNumber(parentNum)
                    .clusterId(parentNum)
                    .clusterSubId(-1)
                    .clusterName(clusterName)
                    .keywords(List.of(clusterName))
                    .count(cnt)
                    .totalAmount(amt)
                    .dataIndices(dataIndices)
                    .createdAt(LocalDateTime.now())
                    .build());
            seq++;

            // 세부 클러스터 (Level 3)
            if (hasSubClusters) {
                Map<String, List<Integer>> subGroups = new LinkedHashMap<>();
                for (int idx : indices) {
                    String scn = getStringValue(rows.get(idx), subClusterCol);
                    if (scn == null || scn.isBlank() || "-".equals(scn)) scn = "(미분류)";
                    subGroups.computeIfAbsent(scn, k -> new ArrayList<>()).add(idx);
                }

                if (subGroups.size() > 1 || !subGroups.containsKey("(미분류)")) {
                    for (var subEntry : subGroups.entrySet()) {
                        String scn = subEntry.getKey();
                        List<Integer> subIndices = subEntry.getValue();
                        List<String> subDataIndices = subIndices.stream()
                                .map(sessionRawDataIds::get)
                                .collect(Collectors.toList());

                        int subCnt = subIndices.size();
                        double subAmt = sumAmount(subIndices, rows, config.amountColumn);
                        int subNum = seq;

                        results.add(ClusteringResult.builder()
                                .sessionId(config.sessionId)
                                .clusterNumber(subNum)
                                .clusterId(parentNum)
                                .clusterSubId(subNum)
                                .clusterName(scn)
                                .keywords(List.of(scn))
                                .count(subCnt)
                                .totalAmount(subAmt)
                                .dataIndices(subDataIndices)
                                .createdAt(LocalDateTime.now())
                                .build());
                        seq++;
                    }
                }
            }
        }

        clusteringResultRepository.saveAll(results);
        log.info("clustering_results 생성 완료: sessionId={}, clusters={}", config.sessionId, results.size());

        // ===== 5. 세션 상태 업데이트 (generateStatistics보다 먼저 실행해야 accountName 참조 가능) =====
        // accountColumn에서 고유값 추출하여 accountName 결정
        String accountName;
        if (config.accountColumn != null && !config.accountColumn.isBlank()) {
            Set<String> uniqueAccounts = rows.stream()
                    .map(row -> getStringValue(row, config.accountColumn))
                    .filter(v -> v != null && !v.isBlank())
                    .collect(Collectors.toSet());

            if (uniqueAccounts.size() > 1) {
                throw new RuntimeException("대계정 컬럼에 2개 이상의 고유값이 있습니다: " + uniqueAccounts);
            }
            accountName = uniqueAccounts.isEmpty() ? "(미설정)" : uniqueAccounts.iterator().next();
        } else {
            accountName = config.accountName != null ? config.accountName : "(미설정)";
        }

        session.setIsCompleted(true);
        session.setCompletedAt(LocalDateTime.now());
        session.setCurrentStep(ProcessStep.EXPORT);
        session.setAccountNames(List.of(accountName));
        session.setTotalRowCount((long) rows.size());
        session.setCategoryColumn(config.accountColumn);
        session.setCostCenterColumn(config.costCenterColumn);
        session.setSupplierColumn(config.supplierColumn);
        session.setAmountColumn(config.amountColumn);
        fileSessionRepository.save(session);

        // ===== 6. ClusterStatisticsService 호출 (세션 accountNames 저장 후 실행) =====
        clusterStatisticsService.generateStatistics(config.sessionId, projectId);
        log.info("cluster_statistics 생성 완료: sessionId={}", config.sessionId);

        log.info("세션 처리 완료: sessionId={}", config.sessionId);
    }

    // ===== 유틸리티 메서드 =====

    private String extractUploadId(String s3Key) {
        if (s3Key == null) return null;
        String[] parts = s3Key.split("/");
        for (int i = 0; i < parts.length - 1; i++) {
            if ("uploads".equals(parts[i])) return parts[i + 1];
        }
        return null;
    }

    private String getStringValue(Map<String, Object> row, String column) {
        if (column == null || column.isBlank()) return null;
        Object val = row.get(column);
        return val != null ? val.toString().trim() : null;
    }

    private double sumAmount(List<Integer> indices, List<Map<String, Object>> rows, String amountColumn) {
        double total = 0.0;
        for (int idx : indices) {
            Object val = rows.get(idx).get(amountColumn);
            if (val instanceof Number) {
                total += ((Number) val).doubleValue();
            } else if (val != null) {
                try { total += Double.parseDouble(val.toString().replaceAll("[^\\d.\\-]", "")); }
                catch (NumberFormatException ignored) {}
            }
        }
        return total;
    }

    private void invalidateCache(String projectId) {
        try {
            redisService.delete("longlist:tree:" + projectId);
            redisService.delete("shortlist:tree:" + projectId);
        } catch (Exception e) { log.warn("캐시 무효화 실패: {}", e.getMessage()); }
    }
}
