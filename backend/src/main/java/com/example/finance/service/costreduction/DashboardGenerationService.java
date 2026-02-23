package com.example.finance.service.costreduction;

import com.example.finance.model.data.ClusterStatistics;
import com.example.finance.model.data.ClusterStatistics.BreakdownItem;
import com.example.finance.model.data.ClusteringResult;
import com.example.finance.model.data.RawDataDocument;
import com.example.finance.model.data.SessionDataDocument;
import com.example.finance.model.session.FileSession;
import com.example.finance.model.session.UploadedFileInfo;
import com.example.finance.repository.data.ClusterStatisticsRepository;
import com.example.finance.repository.data.ClusteringResultRepository;
import com.example.finance.repository.data.SessionDataRepository;
import com.example.finance.repository.session.FileSessionRepository;
import com.example.finance.service.common.RedisService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

/**
 * 대시보드 프로젝트 배치 데이터 생성 서비스
 *
 * 업로드된 파일의 raw_data를 읽어 cluster_statistics 컬렉션을
 * 병렬 스레드로 생성한다.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class DashboardGenerationService {

    private final FileSessionRepository fileSessionRepository;
    private final SessionDataRepository sessionDataRepository;
    private final ClusteringResultRepository clusteringResultRepository;
    private final ClusterStatisticsRepository clusterStatisticsRepository;
    private final RedisService redisService;
    private final MongoTemplate mongoTemplate;

    // 진행 상태 추적 (projectId → status)
    private final ConcurrentHashMap<String, GenerationStatus> statusMap = new ConcurrentHashMap<>();

    public static class GenerationStatus {
        public volatile String status = "PROCESSING"; // PROCESSING, COMPLETED, FAILED
        public volatile int totalSessions = 0;
        public volatile int completedSessions = 0;
        public volatile List<String> errors = Collections.synchronizedList(new ArrayList<>());
    }

    public static class SessionConfig {
        public String sessionId;
        public String accountName;
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

        // 비동기로 병렬 처리 시작
        CompletableFuture.runAsync(() -> {
            try {
                processBatch(projectId, userId, configs, status);
            } catch (Exception e) {
                log.error("배치 생성 실패: projectId={}", projectId, e);
                status.status = "FAILED";
                status.errors.add(e.getMessage());
            }
        });

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

        // 각 세션을 병렬로 처리
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
                }))
                .collect(Collectors.toList());

        // 모든 처리 완료 대기
        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

        // 캐시 무효화
        invalidateCache(projectId);

        status.status = status.errors.isEmpty() ? "COMPLETED" : "COMPLETED_WITH_ERRORS";
        log.info("대시보드 배치 생성 완료: projectId={}, completed={}, errors={}",
                projectId, status.completedSessions, status.errors.size());
    }

    /**
     * 개별 세션 처리: raw_data → session_data + cluster_statistics
     */
    private void processSession(String projectId, String userId, SessionConfig config) {
        FileSession session = fileSessionRepository.findBySessionId(config.sessionId)
                .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다: " + config.sessionId));

        // 1. uploadId 추출 → raw_data 조회
        List<Map<String, Object>> rows = new ArrayList<>();
        for (UploadedFileInfo fileInfo : session.getUploadedFiles()) {
            String uploadId = extractUploadId(fileInfo.getS3Key());
            if (uploadId == null) continue;

            Query query = new Query(Criteria.where("upload_id").is(uploadId));
            List<RawDataDocument> rawDocs = mongoTemplate.find(query, RawDataDocument.class, "raw_data");
            for (RawDataDocument doc : rawDocs) {
                if (doc.getData() != null) {
                    rows.add(doc.getData());
                }
            }
        }

        if (rows.isEmpty()) {
            throw new RuntimeException("데이터가 없습니다: sessionId=" + config.sessionId);
        }

        log.info("raw_data 로드 완료: sessionId={}, rows={}", config.sessionId, rows.size());

        // 2. session_data 생성 (기존 데이터 삭제 후 재생성)
        sessionDataRepository.deleteBySessionId(config.sessionId);
        List<SessionDataDocument> sessionDocs = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> rowData = new LinkedHashMap<>(rows.get(i));
            String rawDataId = UUID.randomUUID().toString();
            rowData.put("__rawDataId", rawDataId);
            rows.set(i, rowData); // rawDataId 참조 유지

            sessionDocs.add(SessionDataDocument.builder()
                    .projectId(projectId)
                    .sessionId(config.sessionId)
                    .rawDataId(rawDataId)
                    .rowNumber(i + 1)
                    .data(filterInternalKeys(rowData))
                    .isHidden(false)
                    .createdAt(LocalDateTime.now())
                    .build());
        }
        sessionDataRepository.saveAll(sessionDocs);

        // 3. 기존 클러스터링 결과/통계 삭제
        clusteringResultRepository.deleteBySessionId(config.sessionId);
        clusterStatisticsRepository.deleteBySessionId(config.sessionId);

        // 4. 클러스터 그룹핑
        String clusterCol = config.clusterColumn;
        String subClusterCol = config.subClusterColumn;
        String amountCol = config.amountColumn;
        String supplierCol = config.supplierColumn;
        String costCenterCol = config.costCenterColumn;
        String accountName = config.accountName;

        Map<String, List<Map<String, Object>>> clusterGroups = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String cn = getStringValue(row, clusterCol);
            if (cn == null || cn.isBlank()) cn = "(미분류)";
            clusterGroups.computeIfAbsent(cn, k -> new ArrayList<>()).add(row);
        }

        boolean hasSubClusters = subClusterCol != null && !subClusterCol.isBlank();
        Map<String, Map<String, List<Map<String, Object>>>> subClusterGroups = new LinkedHashMap<>();
        if (hasSubClusters) {
            for (var entry : clusterGroups.entrySet()) {
                Map<String, List<Map<String, Object>>> subGroups = new LinkedHashMap<>();
                for (Map<String, Object> row : entry.getValue()) {
                    String scn = getStringValue(row, subClusterCol);
                    if (scn == null || scn.isBlank() || "-".equals(scn)) scn = "(미분류)";
                    subGroups.computeIfAbsent(scn, k -> new ArrayList<>()).add(row);
                }
                subClusterGroups.put(entry.getKey(), subGroups);
            }
        }

        // 5. ClusteringResult + ClusterStatistics 생성
        List<ClusteringResult> results = new ArrayList<>();
        List<ClusterStatistics> stats = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        int seq = 1;
        int totalCountAll = 0;
        double totalAmountAll = 0.0;
        Map<String, long[]> sessionCcMap = new LinkedHashMap<>();
        Map<String, long[]> sessionSupMap = new LinkedHashMap<>();

        for (var entry : clusterGroups.entrySet()) {
            String clusterName = entry.getKey();
            List<Map<String, Object>> clusterRows = entry.getValue();
            List<String> dataIndices = clusterRows.stream()
                    .map(r -> (String) r.get("__rawDataId"))
                    .collect(Collectors.toList());

            int cnt = clusterRows.size();
            double amt = sumAmount(clusterRows, amountCol);
            totalCountAll += cnt;
            totalAmountAll += amt;
            int parentNum = seq;

            results.add(ClusteringResult.builder()
                    .sessionId(config.sessionId)
                    .clusterNumber(parentNum).clusterId(parentNum).clusterSubId(-1)
                    .clusterName(clusterName).keywords(List.of(clusterName))
                    .count(cnt).totalAmount(amt).dataIndices(dataIndices)
                    .createdAt(now).build());
            seq++;

            AggResult l2 = aggregate(clusterRows, supplierCol, costCenterCol, amountCol);
            mergeMaps(sessionCcMap, l2.ccMap);
            mergeMaps(sessionSupMap, l2.supMap);

            stats.add(ClusterStatistics.builder()
                    .projectId(projectId).sessionId(config.sessionId)
                    .clusterNumber(parentNum).parentClusterNumber(null)
                    .clusterName(clusterName).accountName(accountName)
                    .level(2).totalCount(cnt).totalAmount(amt)
                    .costCenterCount(l2.ccMap.size()).supplierCount(l2.supMap.size())
                    .costCenterBreakdown(toBreakdownList(l2.ccMap))
                    .supplierBreakdown(toBreakdownList(l2.supMap))
                    .createdAt(now).build());

            if (hasSubClusters && subClusterGroups.containsKey(clusterName)) {
                var subGroups = subClusterGroups.get(clusterName);
                if (subGroups.size() > 1 || !subGroups.containsKey("(미분류)")) {
                    for (var subEntry : subGroups.entrySet()) {
                        String scn = subEntry.getKey();
                        List<Map<String, Object>> subRows = subEntry.getValue();
                        List<String> subIndices = subRows.stream()
                                .map(r -> (String) r.get("__rawDataId"))
                                .collect(Collectors.toList());
                        int subCnt = subRows.size();
                        double subAmt = sumAmount(subRows, amountCol);
                        int subNum = seq;

                        results.add(ClusteringResult.builder()
                                .sessionId(config.sessionId)
                                .clusterNumber(subNum).clusterId(parentNum).clusterSubId(subNum)
                                .clusterName(scn).keywords(List.of(scn))
                                .count(subCnt).totalAmount(subAmt).dataIndices(subIndices)
                                .createdAt(now).build());
                        seq++;

                        AggResult l3 = aggregate(subRows, supplierCol, costCenterCol, amountCol);
                        stats.add(ClusterStatistics.builder()
                                .projectId(projectId).sessionId(config.sessionId)
                                .clusterNumber(subNum).parentClusterNumber(parentNum)
                                .clusterName(scn).accountName(accountName)
                                .level(3).totalCount(subCnt).totalAmount(subAmt)
                                .costCenterCount(l3.ccMap.size()).supplierCount(l3.supMap.size())
                                .costCenterBreakdown(toBreakdownList(l3.ccMap))
                                .supplierBreakdown(toBreakdownList(l3.supMap))
                                .createdAt(now).build());
                    }
                }
            }
        }

        // Level 1: 세션 전체
        stats.add(ClusterStatistics.builder()
                .projectId(projectId).sessionId(config.sessionId)
                .clusterNumber(null).parentClusterNumber(null)
                .clusterName(null).accountName(accountName)
                .level(1).totalCount(totalCountAll).totalAmount(totalAmountAll)
                .costCenterCount(sessionCcMap.size()).supplierCount(sessionSupMap.size())
                .costCenterBreakdown(toBreakdownList(sessionCcMap))
                .supplierBreakdown(toBreakdownList(sessionSupMap))
                .createdAt(now).build());

        // 6. 저장
        clusteringResultRepository.saveAll(results);
        clusterStatisticsRepository.saveAll(stats);

        // 7. 세션 업데이트 (완료 처리)
        session.setIsCompleted(true);
        session.setCompletedAt(now);
        session.setAccountNames(List.of(accountName));
        session.setTotalRowCount((long) rows.size());
        fileSessionRepository.save(session);

        log.info("세션 처리 완료: sessionId={}, clusters={}, stats={}",
                config.sessionId, clusterGroups.size(), stats.size());
    }

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

    private double sumAmount(List<Map<String, Object>> rows, String amountColumn) {
        double total = 0.0;
        for (Map<String, Object> row : rows) {
            Object val = row.get(amountColumn);
            if (val instanceof Number) {
                total += ((Number) val).doubleValue();
            } else if (val != null) {
                try { total += Double.parseDouble(val.toString().replaceAll("[^\\d.\\-]", "")); }
                catch (NumberFormatException ignored) {}
            }
        }
        return total;
    }

    private Map<String, Object> filterInternalKeys(Map<String, Object> data) {
        Map<String, Object> filtered = new LinkedHashMap<>();
        for (var e : data.entrySet()) {
            if (!e.getKey().startsWith("__")) filtered.put(e.getKey(), e.getValue());
        }
        return filtered;
    }

    private AggResult aggregate(List<Map<String, Object>> rows, String supplierCol, String ccCol, String amountCol) {
        Map<String, long[]> ccMap = new LinkedHashMap<>();
        Map<String, long[]> supMap = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            double money = 0.0;
            Object av = row.get(amountCol);
            if (av instanceof Number) money = ((Number) av).doubleValue();
            else if (av != null) { try { money = Double.parseDouble(av.toString().replaceAll("[^\\d.\\-]", "")); } catch (NumberFormatException ignored) {} }

            if (ccCol != null && !ccCol.isBlank()) {
                String cc = getStringValue(row, ccCol); cc = (cc == null || cc.isBlank()) ? "(미지정)" : cc;
                ccMap.computeIfAbsent(cc, k -> new long[2]); ccMap.get(cc)[0]++; ccMap.get(cc)[1] += Math.round(money);
            }
            if (supplierCol != null && !supplierCol.isBlank()) {
                String s = getStringValue(row, supplierCol); s = (s == null || s.isBlank()) ? "(미지정)" : s;
                supMap.computeIfAbsent(s, k -> new long[2]); supMap.get(s)[0]++; supMap.get(s)[1] += Math.round(money);
            }
        }
        AggResult r = new AggResult(); r.ccMap = ccMap; r.supMap = supMap; return r;
    }

    private void mergeMaps(Map<String, long[]> target, Map<String, long[]> source) {
        for (var e : source.entrySet()) {
            target.computeIfAbsent(e.getKey(), k -> new long[2]);
            target.get(e.getKey())[0] += e.getValue()[0];
            target.get(e.getKey())[1] += e.getValue()[1];
        }
    }

    private List<BreakdownItem> toBreakdownList(Map<String, long[]> map) {
        return map.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue()[1], a.getValue()[1]))
                .map(e -> BreakdownItem.builder().name(e.getKey())
                        .count((int) e.getValue()[0]).totalAmount((double) e.getValue()[1]).build())
                .collect(Collectors.toList());
    }

    private void invalidateCache(String projectId) {
        try {
            redisService.delete("longlist:tree:" + projectId);
            redisService.delete("shortlist:tree:" + projectId);
        } catch (Exception e) { log.warn("캐시 무효화 실패: {}", e.getMessage()); }
    }

    private static class AggResult {
        Map<String, long[]> ccMap = new LinkedHashMap<>();
        Map<String, long[]> supMap = new LinkedHashMap<>();
    }
}
