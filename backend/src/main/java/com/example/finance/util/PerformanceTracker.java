package com.example.finance.util;

import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 구간별 성능 추적 유틸리티 클래스
 *
 * <p>대량 데이터 처리, 세션 완료 프로세스 등에서 각 단계(Step)의 소요 시간,
 * 쿼리 성능, 배치 처리량, 메모리 사용량을 추적하고 요약 로그를 출력한다.</p>
 *
 * <p>주요 기능:</p>
 * <ul>
 *   <li>단계(Step) 시작/종료 시간 측정 및 비율 계산</li>
 *   <li>세부 구간(Sub-step) 추적</li>
 *   <li>쿼리 메트릭 (실행 횟수, 문서 수, 평균/최대 소요 시간)</li>
 *   <li>배치 메트릭 (배치 수, 처리량, 초당 처리 건수)</li>
 *   <li>JVM 메모리 스냅샷 (시작/종료 시점 사용량, 피크 메모리)</li>
 *   <li>병목 구간 자동 표시 (30% 이상: 병목, 15% 이상: 주의)</li>
 * </ul>
 *
 * <p>사용 예시:</p>
 * <pre>
 *   PerformanceTracker tracker = PerformanceTracker.start("sessionId", "세션완료");
 *   tracker.beginStep("1.세션조회");
 *   // ... 작업 ...
 *   tracker.endStep("1.세션조회");
 *   tracker.logSummary();
 * </pre>
 *
 * <p>스레드 안전성: ConcurrentHashMap과 synchronizedList를 사용하여
 * 멀티스레드 환경에서도 안전하게 사용 가능하다.</p>
 */
@Slf4j
public class PerformanceTracker {

    private final String sessionId;
    private final String operation;
    private final long startTime;
    private final Map<String, StepRecord> steps = new ConcurrentHashMap<>();
    private final List<MemorySnapshot> memorySnapshots = Collections.synchronizedList(new ArrayList<>());

    private PerformanceTracker(String sessionId, String operation) {
        this.sessionId = sessionId;
        this.operation = operation;
        this.startTime = System.currentTimeMillis();
        snapshotMemory("시작");
    }

    /**
     * 성능 추적을 시작하고 PerformanceTracker 인스턴스를 반환한다
     *
     * @param sessionId 추적 대상 세션 ID
     * @param operation 작업명 (로그 출력에 사용)
     * @return 새로운 PerformanceTracker 인스턴스
     */
    public static PerformanceTracker start(String sessionId, String operation) {
        return new PerformanceTracker(sessionId, operation);
    }

    // ── Step 시작/종료 ──

    /**
     * 지정된 이름의 단계 측정을 시작한다
     *
     * @param stepName 단계 이름 (예: "1.세션조회", "2.데이터복사")
     */
    public void beginStep(String stepName) {
        steps.put(stepName, new StepRecord(stepName, System.currentTimeMillis()));
    }

    /**
     * 지정된 이름의 단계 측정을 종료한다
     *
     * @param stepName 종료할 단계 이름
     */
    public void endStep(String stepName) {
        StepRecord record = steps.get(stepName);
        if (record != null) {
            record.endTime = System.currentTimeMillis();
            record.elapsed = record.endTime - record.startTime;
        }
    }

    /**
     * 지정된 이름의 단계 측정을 종료하고 상세 정보를 기록한다
     *
     * @param stepName 종료할 단계 이름
     * @param details  추가 상세 정보 (예: "1000건 처리 완료")
     */
    public void endStep(String stepName, String details) {
        endStep(stepName);
        StepRecord record = steps.get(stepName);
        if (record != null) {
            record.details = details;
        }
    }

    // ── Sub-step (단계 내부의 세부 구간) ──

    /**
     * 부모 단계에 세부 구간(Sub-step) 기록을 추가한다
     *
     * @param parentStep  부모 단계 이름
     * @param subStepName 세부 구간 이름
     * @param elapsedMs   소요 시간 (밀리초)
     * @param details     추가 상세 정보
     */
    public void addSubStep(String parentStep, String subStepName, long elapsedMs, String details) {
        StepRecord parent = steps.get(parentStep);
        if (parent != null) {
            parent.subSteps.add(new SubStepRecord(subStepName, elapsedMs, details));
        }
    }

    // ── 쿼리 메트릭 ──

    /**
     * 쿼리 실행 메트릭을 기록한다
     *
     * @param stepName      쿼리가 속한 단계 이름
     * @param queryName     쿼리 이름 (예: "findBySessionId")
     * @param documentCount 반환된 문서 수
     * @param elapsedMs     쿼리 소요 시간 (밀리초)
     */
    public void trackQuery(String stepName, String queryName, int documentCount, long elapsedMs) {
        StepRecord record = steps.get(stepName);
        if (record != null) {
            record.queryMetrics.add(new QueryMetric(queryName, documentCount, elapsedMs));
        }
    }

    // ── 배치 메트릭 ──

    /**
     * 배치 처리 메트릭을 기록한다
     *
     * @param stepName    배치가 속한 단계 이름
     * @param batchNumber 배치 번호
     * @param batchSize   배치 크기 (처리 건수)
     * @param elapsedMs   배치 소요 시간 (밀리초)
     */
    public void trackBatch(String stepName, int batchNumber, int batchSize, long elapsedMs) {
        StepRecord record = steps.get(stepName);
        if (record != null) {
            record.batchMetrics.add(new BatchMetric(batchNumber, batchSize, elapsedMs));
        }
    }

    // ── 메모리 스냅샷 ──

    /**
     * 현재 JVM 메모리 사용량 스냅샷을 기록한다
     *
     * @param label 스냅샷 레이블 (예: "시작", "종료", "배치완료후")
     */
    public void snapshotMemory(String label) {
        Runtime rt = Runtime.getRuntime();
        long total = rt.totalMemory();
        long free = rt.freeMemory();
        long used = total - free;
        memorySnapshots.add(new MemorySnapshot(label, used, total, System.currentTimeMillis()));
    }

    // ── 전체 요약 로그 ──

    /**
     * 전체 성능 추적 결과를 요약 로그로 출력한다
     *
     * <p>각 단계의 소요 시간, 비율, 병목 여부와 함께
     * 쿼리/배치 메트릭, 메모리 사용량을 정리하여 INFO 레벨로 출력한다.</p>
     */
    public void logSummary() {
        long totalElapsed = System.currentTimeMillis() - startTime;
        snapshotMemory("종료");

        StringBuilder sb = new StringBuilder();
        sb.append(String.format("\n[PERF-SUMMARY] sessionId=%s | %s | 전체=%dms (%.1f초)\n",
                sessionId, operation, totalElapsed, totalElapsed / 1000.0));
        sb.append("─".repeat(80)).append("\n");

        for (StepRecord step : steps.values()) {
            long elapsed = step.elapsed > 0 ? step.elapsed : 0;
            double pct = totalElapsed > 0 ? (elapsed * 100.0 / totalElapsed) : 0;
            String marker = pct >= 30 ? " ◀◀ 병목" : (pct >= 15 ? " ◀ 주의" : "");

            sb.append(String.format("  %-25s %8dms  (%5.1f%%)%s",
                    step.stepName, elapsed, pct, marker));
            if (step.details != null) {
                sb.append("  | ").append(step.details);
            }
            sb.append("\n");

            // Sub-steps
            for (SubStepRecord sub : step.subSteps) {
                sb.append(String.format("    └─ %-21s %8dms", sub.name, sub.elapsedMs));
                if (sub.details != null) {
                    sb.append("  | ").append(sub.details);
                }
                sb.append("\n");
            }

            // Query metrics summary
            if (!step.queryMetrics.isEmpty()) {
                long totalQueryMs = step.queryMetrics.stream().mapToLong(q -> q.elapsedMs).sum();
                int totalDocs = step.queryMetrics.stream().mapToInt(q -> q.documentCount).sum();
                long maxQueryMs = step.queryMetrics.stream().mapToLong(q -> q.elapsedMs).max().orElse(0);
                long minQueryMs = step.queryMetrics.stream().mapToLong(q -> q.elapsedMs).min().orElse(0);
                long avgQueryMs = step.queryMetrics.isEmpty() ? 0 : totalQueryMs / step.queryMetrics.size();
                sb.append(String.format("    [쿼리] %d회, 총 %dms, avg=%dms, min=%dms, max=%dms, docs=%d\n",
                        step.queryMetrics.size(), totalQueryMs, avgQueryMs, minQueryMs, maxQueryMs, totalDocs));
            }

            // Batch metrics summary
            if (!step.batchMetrics.isEmpty()) {
                long totalBatchMs = step.batchMetrics.stream().mapToLong(b -> b.elapsedMs).sum();
                int totalItems = step.batchMetrics.stream().mapToInt(b -> b.batchSize).sum();
                long maxBatchMs = step.batchMetrics.stream().mapToLong(b -> b.elapsedMs).max().orElse(0);
                long avgBatchMs = step.batchMetrics.isEmpty() ? 0 : totalBatchMs / step.batchMetrics.size();
                double throughput = totalBatchMs > 0 ? (totalItems * 1000.0 / totalBatchMs) : 0;
                sb.append(String.format("    [배치] %d회, 총 %d건, 총 %dms, avg=%dms, max=%dms, throughput=%.0f건/초\n",
                        step.batchMetrics.size(), totalItems, totalBatchMs, avgBatchMs, maxBatchMs, throughput));
            }
        }

        // Memory summary
        sb.append("─".repeat(80)).append("\n");
        sb.append("  [메모리]\n");
        long peakUsed = 0;
        for (MemorySnapshot snap : memorySnapshots) {
            peakUsed = Math.max(peakUsed, snap.usedBytes);
            sb.append(String.format("    %-10s used=%dMB, total=%dMB\n",
                    snap.label, snap.usedBytes / (1024 * 1024), snap.totalBytes / (1024 * 1024)));
        }
        sb.append(String.format("    피크: %dMB\n", peakUsed / (1024 * 1024)));
        sb.append("─".repeat(80));

        log.info(sb.toString());
    }

    // ── 내부 레코드 (성능 측정 데이터 저장용) ──

    /** 하나의 단계(Step)에 대한 측정 기록 */
    private static class StepRecord {
        final String stepName;
        final long startTime;
        long endTime;
        long elapsed;
        String details;
        final List<SubStepRecord> subSteps = Collections.synchronizedList(new ArrayList<>());
        final List<QueryMetric> queryMetrics = Collections.synchronizedList(new ArrayList<>());
        final List<BatchMetric> batchMetrics = Collections.synchronizedList(new ArrayList<>());

        StepRecord(String stepName, long startTime) {
            this.stepName = stepName;
            this.startTime = startTime;
        }
    }

    /** 단계 내부의 세부 구간 기록 */
    private static class SubStepRecord {
        final String name;
        final long elapsedMs;
        final String details;

        SubStepRecord(String name, long elapsedMs, String details) {
            this.name = name;
            this.elapsedMs = elapsedMs;
            this.details = details;
        }
    }

    /** 쿼리 실행 성능 메트릭 */
    private static class QueryMetric {
        final String name;
        final int documentCount;
        final long elapsedMs;

        QueryMetric(String name, int documentCount, long elapsedMs) {
            this.name = name;
            this.documentCount = documentCount;
            this.elapsedMs = elapsedMs;
        }
    }

    /** 배치 처리 성능 메트릭 */
    private static class BatchMetric {
        final int batchNumber;
        final int batchSize;
        final long elapsedMs;

        BatchMetric(int batchNumber, int batchSize, long elapsedMs) {
            this.batchNumber = batchNumber;
            this.batchSize = batchSize;
            this.elapsedMs = elapsedMs;
        }
    }

    /** JVM 메모리 사용량 스냅샷 */
    private static class MemorySnapshot {
        final String label;
        final long usedBytes;
        final long totalBytes;
        final long timestamp;

        MemorySnapshot(String label, long usedBytes, long totalBytes, long timestamp) {
            this.label = label;
            this.usedBytes = usedBytes;
            this.totalBytes = totalBytes;
            this.timestamp = timestamp;
        }
    }
}
