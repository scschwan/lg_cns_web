package com.example.finance.util;

import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 세션 완료 프로세스의 구간별 성능을 추적하는 경량 유틸리티.
 *
 * 사용법:
 *   PerformanceTracker tracker = PerformanceTracker.start("sessionId", "세션완료");
 *   tracker.beginStep("1.세션조회");
 *   // ... 작업 ...
 *   tracker.endStep("1.세션조회");
 *   tracker.logSummary();
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

    public static PerformanceTracker start(String sessionId, String operation) {
        return new PerformanceTracker(sessionId, operation);
    }

    // ── Step 시작/종료 ──

    public void beginStep(String stepName) {
        steps.put(stepName, new StepRecord(stepName, System.currentTimeMillis()));
    }

    public void endStep(String stepName) {
        StepRecord record = steps.get(stepName);
        if (record != null) {
            record.endTime = System.currentTimeMillis();
            record.elapsed = record.endTime - record.startTime;
        }
    }

    public void endStep(String stepName, String details) {
        endStep(stepName);
        StepRecord record = steps.get(stepName);
        if (record != null) {
            record.details = details;
        }
    }

    // ── Sub-step (단계 내부의 세부 구간) ──

    public void addSubStep(String parentStep, String subStepName, long elapsedMs, String details) {
        StepRecord parent = steps.get(parentStep);
        if (parent != null) {
            parent.subSteps.add(new SubStepRecord(subStepName, elapsedMs, details));
        }
    }

    // ── 쿼리 메트릭 ──

    public void trackQuery(String stepName, String queryName, int documentCount, long elapsedMs) {
        StepRecord record = steps.get(stepName);
        if (record != null) {
            record.queryMetrics.add(new QueryMetric(queryName, documentCount, elapsedMs));
        }
    }

    // ── 배치 메트릭 ──

    public void trackBatch(String stepName, int batchNumber, int batchSize, long elapsedMs) {
        StepRecord record = steps.get(stepName);
        if (record != null) {
            record.batchMetrics.add(new BatchMetric(batchNumber, batchSize, elapsedMs));
        }
    }

    // ── 메모리 스냅샷 ──

    public void snapshotMemory(String label) {
        Runtime rt = Runtime.getRuntime();
        long total = rt.totalMemory();
        long free = rt.freeMemory();
        long used = total - free;
        memorySnapshots.add(new MemorySnapshot(label, used, total, System.currentTimeMillis()));
    }

    // ── 전체 요약 로그 ──

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

    // ── 내부 레코드 ──

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
