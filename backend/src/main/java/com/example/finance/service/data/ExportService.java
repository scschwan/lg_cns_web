package com.example.finance.service.data;

import com.example.finance.model.data.ClusteringResult;
import com.example.finance.model.data.ColumnMappingDocument;
import com.example.finance.model.session.FileSession;
import com.example.finance.service.common.RedisService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.bson.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Collectors;

/**
 * Export 서비스 (Step 6)
 *
 * - 전체 데이터 조회 (클러스터명 포함)
 * - 병합된 클러스터 목록 조회
 * - Excel 내보내기 (개별/전체)
 * - 세션 완료 처리
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ExportService {

    private final MongoTemplate mongoTemplate;
    private final S3Client s3Client;
    private final S3Presigner s3Presigner;
    private final ClusterStatisticsService clusterStatisticsService;
    private final RedisService redisService;

    // 병렬 처리용 스레드 풀
    private static final ExecutorService EXECUTOR = Executors.newFixedThreadPool(
            Math.max(4, Runtime.getRuntime().availableProcessors() * 2)
    );

    private static final String S3_BUCKET = System.getenv().getOrDefault(
            "S3_BUCKET_NAME", "finance-excel-uploads"
    );

    private static final int MAX_ROWS_PER_SHEET = 1000000;

    // ============================================================
    // 1. 전체 데이터 조회 (클러스터명 + 세부클러스터명 포함)
    // ============================================================

    /**
     * 전체 데이터 조회 - 모든 session_data에 클러스터 정보 매핑
     */
    public Map<String, Object> getAllDataWithClusterInfo(String sessionId, int page, int size) {
        // 1. raw_data_id → cluster 매핑 생성
        Map<String, ClusterInfo> rawIdToCluster = buildRawIdToClusterMap(sessionId);

        // 2. 가시성 컬럼 목록 조회
        List<String> visibleColumns = getVisibleColumnNames(sessionId);

        // 3. session_data 페이징 조회 (raw_data 기반)
        Query countQuery = new Query(Criteria.where("session_id").is(sessionId));
        long totalCount = mongoTemplate.count(countQuery, "session_data");

        Query query = new Query(Criteria.where("session_id").is(sessionId))
                .with(Sort.by("row_number"))
                .skip((long) page * size)
                .limit(size);
        List<Document> sessionDataList = mongoTemplate.find(query, Document.class, "session_data");

        // 4. 데이터에 클러스터 정보 추가
        List<Map<String, Object>> dataWithCluster = new ArrayList<>();
        for (Document doc : sessionDataList) {
            Map<String, Object> row = new LinkedHashMap<>();
            String rawDataId = doc.getString("raw_data_id");
            ClusterInfo clusterInfo = rawIdToCluster.getOrDefault(rawDataId, ClusterInfo.NONE);

            // 클러스터명, 세부클러스터명 먼저 추가
            row.put("클러스터명", clusterInfo.clusterName != null ? clusterInfo.clusterName : "-");
            row.put("세부클러스터명", clusterInfo.subClusterName != null ? clusterInfo.subClusterName : "-");

            // 가시성 컬럼 데이터 추가
            @SuppressWarnings("unchecked")
            Map<String, Object> data = (Map<String, Object>) doc.get("data");
            if (data != null) {
                for (String col : visibleColumns) {
                    row.put(col, data.get(col));
                }
            }

            row.put("_rawDataId", rawDataId);
            dataWithCluster.add(row);
        }

        // 5. 컬럼 목록 구성 (클러스터명, 세부클러스터명 + 가시성 컬럼)
        List<String> columns = new ArrayList<>();
        columns.add("클러스터명");
        columns.add("세부클러스터명");
        columns.addAll(visibleColumns);

        Map<String, Object> result = new HashMap<>();
        result.put("data", dataWithCluster);
        result.put("columns", columns);
        result.put("totalCount", totalCount);
        result.put("page", page);
        result.put("size", size);
        result.put("totalPages", (int) Math.ceil((double) totalCount / size));
        return result;
    }

    /**
     * raw_data_id → ClusterInfo 매핑 생성
     *
     * 병합 부모: cluster_number == cluster_id (자기 자신)
     * 세부병합 부모: cluster_number == cluster_sub_id (자기 자신)
     * 독립 클러스터: cluster_id == -1
     */
    private Map<String, ClusterInfo> buildRawIdToClusterMap(String sessionId) {
        Map<String, ClusterInfo> map = new HashMap<>();

        // 전체 클러스터 로드
        List<ClusteringResult> allClusters = mongoTemplate.find(
                new Query(Criteria.where("session_id").is(sessionId)), ClusteringResult.class);

        // 1) 독립(cluster_id=-1) + 병합부모(cluster_id==cluster_number) → 클러스터명 매핑 (★ null-safety)
        Map<Integer, ClusteringResult> topLevelByNumber = new HashMap<>();
        for (ClusteringResult c : allClusters) {
            boolean isIndependent = c.getClusterId() == null || c.getClusterId() == -1;
            boolean isMergeParent = c.getClusterId() != null && c.getClusterId() > 0 && c.getClusterId().equals(c.getClusterNumber());
            if (isIndependent || isMergeParent) {
                topLevelByNumber.put(c.getClusterNumber(), c);
                for (String rawDataId : c.getDataIndices()) {
                    map.put(rawDataId, new ClusterInfo(c.getClusterName(), null, c.getClusterNumber()));
                }
            }
        }

        // 2) 세부병합 부모(cluster_sub_id==cluster_number) → 세부클러스터명 매핑 (★ null-safety)
        for (ClusteringResult c : allClusters) {
            boolean isSubMergeParent = c.getClusterSubId() != null && c.getClusterSubId() > 0 && c.getClusterSubId().equals(c.getClusterNumber());
            if (isSubMergeParent) {
                ClusteringResult parent = topLevelByNumber.get(c.getClusterId());
                String parentName = parent != null ? parent.getClusterName() : "Unknown";
                for (String rawDataId : c.getDataIndices()) {
                    map.put(rawDataId, new ClusterInfo(parentName, c.getClusterName(), c.getClusterNumber()));
                }
            }
        }

        return map;
    }

    // ============================================================
    // 2. 병합된 클러스터 목록 조회 (Clustering 결과 탭용)
    // ============================================================

    /**
     * 병합된 클러스터 목록 조회 - 세부 클러스터 정보 포함
     *
     * 병합 부모: cluster_number == cluster_id (자기 자신)
     * 세부병합 부모: cluster_number == cluster_sub_id (자기 자신)
     * 독립 클러스터: cluster_id == -1
     */
    public List<Map<String, Object>> getMergedClustersWithSubClusters(String sessionId) {
        // 전체 클러스터 로드
        List<ClusteringResult> allClusters = mongoTemplate.find(
                new Query(Criteria.where("session_id").is(sessionId))
                        .with(Sort.by("cluster_number")),
                ClusteringResult.class);

        // 최상위 클러스터: 독립(cluster_id=-1) + 병합부모(cluster_id==cluster_number) (★ null-safety)
        List<ClusteringResult> mergedClusters = allClusters.stream()
                .filter(c -> c.getClusterId() == null || c.getClusterId() == -1 ||
                        (c.getClusterId() > 0 && c.getClusterId().equals(c.getClusterNumber())))
                .collect(Collectors.toList());

        // 세부병합 부모: cluster_sub_id == cluster_number (자기 자신) (★ null-safety)
        List<ClusteringResult> subMergeParents = allClusters.stream()
                .filter(c -> c.getClusterSubId() != null && c.getClusterSubId() > 0 && c.getClusterSubId().equals(c.getClusterNumber()))
                .collect(Collectors.toList());

        // 병합부모 cluster_id 기준으로 세부병합 부모 그룹핑
        Map<Integer, List<ClusteringResult>> subClustersByParent = subMergeParents.stream()
                .collect(Collectors.groupingBy(ClusteringResult::getClusterId));

        // 결과 구성
        List<Map<String, Object>> result = new ArrayList<>();

        for (ClusteringResult merged : mergedClusters) {
            List<ClusteringResult> subs = subClustersByParent.getOrDefault(merged.getClusterNumber(), Collections.emptyList());

            // 세부 클러스터가 있는지 확인
            boolean hasSubClusters = !subs.isEmpty();

            if (!hasSubClusters) {
                // 세부 클러스터링 없음 - 단일 행으로 표시
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("clusterNumber", merged.getClusterNumber());
                row.put("clusterName", merged.getClusterName());
                row.put("subClusterName", "-");
                row.put("keywords", merged.getKeywords());
                row.put("count", merged.getCount());
                row.put("totalAmount", merged.getTotalAmount());
                row.put("hasSubClusters", false);
                row.put("isParentRow", true);
                result.add(row);
            } else {
                // 세부 클러스터링 있음 - 부모 행 + 세부 클러스터 행들
                // 1) 부모 클러스터 전체 통계 행
                int totalCount = merged.getCount();
                double totalAmount = merged.getTotalAmount();

                Map<String, Object> parentRow = new LinkedHashMap<>();
                parentRow.put("clusterNumber", merged.getClusterNumber());
                parentRow.put("clusterName", merged.getClusterName());
                parentRow.put("subClusterName", "-");
                parentRow.put("keywords", merged.getKeywords());
                parentRow.put("count", totalCount);
                parentRow.put("totalAmount", totalAmount);
                parentRow.put("hasSubClusters", true);
                parentRow.put("isParentRow", true);
                parentRow.put("childCount", subs.size());
                result.add(parentRow);

                // 2) 세부 클러스터에 소속되지 않은 잔여 데이터 ("기타")
                int subsCount = subs.stream().mapToInt(ClusteringResult::getCount).sum();
                double subsAmount = subs.stream().mapToDouble(ClusteringResult::getTotalAmount).sum();
                int etcCount = totalCount - subsCount;
                double etcAmount = totalAmount - subsAmount;

                if (etcCount > 0) {
                    Map<String, Object> etcRow = new LinkedHashMap<>();
                    etcRow.put("clusterNumber", merged.getClusterNumber());
                    etcRow.put("clusterName", merged.getClusterName());
                    etcRow.put("subClusterName", "기타");
                    etcRow.put("keywords", List.of("기타"));
                    etcRow.put("count", etcCount);
                    etcRow.put("totalAmount", etcAmount);
                    etcRow.put("hasSubClusters", false);
                    etcRow.put("isParentRow", false);
                    etcRow.put("isUndefined", true);
                    result.add(etcRow);
                }

                // 3) 각 세부 클러스터 행
                for (ClusteringResult sub : subs) {
                    Map<String, Object> subRow = new LinkedHashMap<>();
                    subRow.put("clusterNumber", sub.getClusterNumber());
                    subRow.put("parentClusterNumber", merged.getClusterNumber());
                    subRow.put("clusterName", merged.getClusterName());
                    subRow.put("subClusterName", sub.getClusterName());
                    subRow.put("keywords", sub.getKeywords());
                    subRow.put("count", sub.getCount());
                    subRow.put("totalAmount", sub.getTotalAmount());
                    subRow.put("hasSubClusters", false);
                    subRow.put("isParentRow", false);
                    subRow.put("isSubCluster", true);
                    result.add(subRow);
                }
            }
        }

        return result;
    }

    // ============================================================
    // 3. 클러스터별 상세 데이터 조회
    // ============================================================

    /**
     * 클러스터별 상세 데이터 조회 (자세히 버튼 클릭 시)
     */
    public Map<String, Object> getClusterDetailData(String sessionId, Integer clusterNumber, int page, int size) {
        // 클러스터 정보 조회
        Query clusterQuery = new Query(Criteria.where("session_id").is(sessionId)
                .and("cluster_number").is(clusterNumber));
        ClusteringResult cluster = mongoTemplate.findOne(clusterQuery, ClusteringResult.class);

        if (cluster == null) {
            return Map.of("error", "Cluster not found", "data", Collections.emptyList());
        }

        List<String> rawDataIds = cluster.getDataIndices();
        if (rawDataIds == null || rawDataIds.isEmpty()) {
            return Map.of("data", Collections.emptyList(), "totalCount", 0);
        }

        // 가시성 컬럼 조회
        List<String> visibleColumns = getVisibleColumnNames(sessionId);

        // raw_data_id로 session_data 조회 (페이징)
        int totalCount = rawDataIds.size();
        int fromIndex = page * size;
        int toIndex = Math.min(fromIndex + size, totalCount);

        if (fromIndex >= totalCount) {
            return Map.of("data", Collections.emptyList(), "totalCount", totalCount, "page", page);
        }

        List<String> pageIds = rawDataIds.subList(fromIndex, toIndex);

        Query dataQuery = new Query(Criteria.where("session_id").is(sessionId)
                .and("raw_data_id").in(pageIds));
        List<Document> sessionDataList = mongoTemplate.find(dataQuery, Document.class, "session_data");

        // 순서 보장을 위해 재정렬
        Map<String, Document> dataById = sessionDataList.stream()
                .collect(Collectors.toMap(d -> d.getString("raw_data_id"), d -> d, (a, b) -> a));

        List<Map<String, Object>> orderedData = new ArrayList<>();
        for (String rawId : pageIds) {
            Document doc = dataById.get(rawId);
            if (doc == null) continue;

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("클러스터명", cluster.getClusterName());
            row.put("세부클러스터명", "-"); // TODO: 세부클러스터링 시 업데이트

            @SuppressWarnings("unchecked")
            Map<String, Object> data = (Map<String, Object>) doc.get("data");
            if (data != null) {
                for (String col : visibleColumns) {
                    row.put(col, data.get(col));
                }
            }
            orderedData.add(row);
        }

        // 컬럼 목록
        List<String> columns = new ArrayList<>();
        columns.add("클러스터명");
        columns.add("세부클러스터명");
        columns.addAll(visibleColumns);

        Map<String, Object> result = new HashMap<>();
        result.put("data", orderedData);
        result.put("columns", columns);
        result.put("totalCount", totalCount);
        result.put("page", page);
        result.put("size", size);
        result.put("totalPages", (int) Math.ceil((double) totalCount / size));
        result.put("clusterName", cluster.getClusterName());
        result.put("clusterNumber", clusterNumber);
        return result;
    }

    // ============================================================
    // 4. 클러스터명 수정
    // ============================================================

    public void updateClusterName(String sessionId, Integer clusterNumber, String newName) {
        Query query = new Query(Criteria.where("session_id").is(sessionId)
                .and("cluster_number").is(clusterNumber));
        Update update = new Update().set("cluster_name", newName);
        mongoTemplate.updateFirst(query, update, ClusteringResult.class);
        log.info("클러스터명 수정: sessionId={}, clusterNumber={}, newName={}", sessionId, clusterNumber, newName);
    }

    // ============================================================
    // 5. 컬럼 설정 (제거열 설정)
    // ============================================================

    public List<Map<String, Object>> getColumnSettings(String sessionId) {
        Query query = new Query(Criteria.where("session_id").is(sessionId))
                .with(Sort.by("sequence"));
        List<ColumnMappingDocument> columns = mongoTemplate.find(query, ColumnMappingDocument.class);

        return columns.stream().map(col -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("originalName", col.getOriginalName());
            map.put("displayName", col.getDisplayName());
            map.put("isVisible", col.getIsVisible());
            map.put("sequence", col.getSequence());
            map.put("dataType", col.getDataType());
            return map;
        }).collect(Collectors.toList());
    }

    public void updateColumnSettings(String sessionId, List<Map<String, Object>> columns) {
        for (Map<String, Object> col : columns) {
            String originalName = (String) col.get("originalName");
            Boolean isVisible = (Boolean) col.get("isVisible");

            if (originalName != null && isVisible != null) {
                Query query = new Query(Criteria.where("session_id").is(sessionId)
                        .and("original_name").is(originalName));
                Update update = new Update().set("is_visible", isVisible);
                mongoTemplate.updateFirst(query, update, ColumnMappingDocument.class);
            }
        }
        log.info("컬럼 설정 업데이트: sessionId={}, count={}", sessionId, columns.size());
    }

    private List<String> getVisibleColumnNames(String sessionId) {
        Query query = new Query(Criteria.where("session_id").is(sessionId)
                .and("is_visible").is(true))
                .with(Sort.by("sequence"));
        List<ColumnMappingDocument> columns = mongoTemplate.find(query, ColumnMappingDocument.class);
        return columns.stream()
                .map(ColumnMappingDocument::getOriginalName)
                .collect(Collectors.toList());
    }

    // ============================================================
    // 6. Excel 내보내기 (개별/전체)
    // ============================================================

    /**
     * 선택된 클러스터만 Excel 내보내기
     */
    public ExportResult exportSelectedClusters(String sessionId, String projectId, List<Integer> clusterNumbers) throws IOException {
        log.info("개별 클러스터 Export 시작: sessionId={}, clusters={}", sessionId, clusterNumbers);

        // 선택된 클러스터 조회
        Query query = new Query(Criteria.where("session_id").is(sessionId)
                .and("cluster_number").in(clusterNumbers));
        List<ClusteringResult> selectedClusters = mongoTemplate.find(query, ClusteringResult.class);

        return generateExcel(sessionId, projectId, selectedClusters, false);
    }

    /**
     * 전체 클러스터 Excel 내보내기
     */
    public ExportResult exportAllClusters(String sessionId, String projectId) throws IOException {
        log.info("전체 클러스터 Export 시작: sessionId={}", sessionId);

        // 최상위 클러스터 조회: 독립(cluster_id=-1) + 병합부모(cluster_id==cluster_number)
        List<ClusteringResult> all = mongoTemplate.find(
                new Query(Criteria.where("session_id").is(sessionId))
                        .with(Sort.by("cluster_number")),
                ClusteringResult.class);
        List<ClusteringResult> allClusters = all.stream()
                .filter(c -> c.getClusterId() == null || c.getClusterId() == -1 ||
                        (c.getClusterId() > 0 && c.getClusterId().equals(c.getClusterNumber())))
                .collect(Collectors.toList());

        ExportResult result = generateExcel(sessionId, projectId, allClusters, true);

        // S3 경로를 file_sessions에 저장
        updateSessionExportPath(sessionId, result.getS3Key());

        return result;
    }

    /**
     * Excel 파일 생성 (병렬 처리)
     */
    private ExportResult generateExcel(String sessionId, String projectId,
                                        List<ClusteringResult> clusters, boolean saveToSession) throws IOException {
        log.info("Excel 생성 시작: sessionId={}, clusterCount={}", sessionId, clusters.size());

        // SXSSF 사용 (메모리 효율적인 스트리밍 모드)
        SXSSFWorkbook workbook = new SXSSFWorkbook(100); // 100 rows in memory

        try {
            // 가시성 컬럼 조회
            List<String> visibleColumns = getVisibleColumnNames(sessionId);
            List<String> allColumns = new ArrayList<>();
            allColumns.add("클러스터명");
            allColumns.add("세부클러스터명");
            allColumns.addAll(visibleColumns);

            // 세부클러스터 정보를 위해 전체 클러스터 로드
            List<ClusteringResult> allSessionClusters = mongoTemplate.find(
                    new Query(Criteria.where("session_id").is(sessionId)),
                    ClusteringResult.class);

            // 1. 요약 시트 생성 (세부클러스터 포함)
            createSummarySheet(workbook, clusters, allSessionClusters);

            // 2. raw_data 시트 생성 (병렬로 데이터 수집)
            createRawDataSheet(workbook, sessionId, clusters, allColumns);

            // 3. Excel → byte[]
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            workbook.write(outputStream);
            byte[] excelBytes = outputStream.toByteArray();
            log.info("Excel 생성 완료: {} bytes", excelBytes.length);

            // 4. S3 업로드
            String s3Key = generateS3Key(sessionId);
            uploadToS3(s3Key, excelBytes);

            // 5. Presigned URL 생성
            String downloadUrl = generatePresignedUrl(s3Key);

            return ExportResult.builder()
                    .s3Key(s3Key)
                    .downloadUrl(downloadUrl)
                    .fileSize(excelBytes.length)
                    .exportedAt(LocalDateTime.now())
                    .build();

        } finally {
            workbook.dispose(); // 임시 파일 정리
        }
    }

    /**
     * 요약 시트 생성
     */
    private void createSummarySheet(SXSSFWorkbook workbook, List<ClusteringResult> clusters,
                                      List<ClusteringResult> allSessionClusters) {
        Sheet sheet = workbook.createSheet("요약");
        CellStyle headerStyle = createHeaderStyle(workbook);

        // 헤더
        Row headerRow = sheet.createRow(0);
        String[] headers = {"클러스터번호", "클러스터명", "세부클러스터명", "키워드", "Count", "합산금액"};
        for (int i = 0; i < headers.length; i++) {
            Cell cell = headerRow.createCell(i);
            cell.setCellValue(headers[i]);
            cell.setCellStyle(headerStyle);
        }

        // 세부클러스터 매핑: 상위 클러스터 번호 → 세부클러스터 목록
        Map<Integer, List<ClusteringResult>> subClusterMap = new HashMap<>();
        for (ClusteringResult c : allSessionClusters) {
            if (c.getClusterSubId() != null && c.getClusterSubId() > 0
                    && c.getClusterSubId().equals(c.getClusterNumber())) {
                // 세부병합 부모 (cluster_sub_id == cluster_number)
                subClusterMap.computeIfAbsent(c.getClusterId(), k -> new ArrayList<>()).add(c);
            }
        }

        // 데이터: 상위 클러스터 + 세부클러스터 계층 표시
        int rowNum = 1;
        for (ClusteringResult cluster : clusters) {
            List<ClusteringResult> subClusters = subClusterMap.get(cluster.getClusterNumber());

            if (subClusters == null || subClusters.isEmpty()) {
                // 세부클러스터 없음 — 기존 방식
                Row row = sheet.createRow(rowNum++);
                row.createCell(0).setCellValue(cluster.getClusterNumber());
                row.createCell(1).setCellValue(truncateText(cluster.getClusterName()));
                row.createCell(2).setCellValue("-");
                row.createCell(3).setCellValue(truncateText(String.join(", ", cluster.getKeywords() != null ? cluster.getKeywords() : Collections.emptyList())));
                row.createCell(4).setCellValue(cluster.getCount() != null ? cluster.getCount() : 0);
                row.createCell(5).setCellValue(cluster.getTotalAmount() != null ? cluster.getTotalAmount() : 0.0);
            } else {
                // 세부클러스터 있음 — 상위 클러스터 행 + 세부클러스터 행들
                Row parentRow = sheet.createRow(rowNum++);
                parentRow.createCell(0).setCellValue(cluster.getClusterNumber());
                parentRow.createCell(1).setCellValue(truncateText(cluster.getClusterName()));
                parentRow.createCell(2).setCellValue("-");
                parentRow.createCell(3).setCellValue(truncateText(String.join(", ", cluster.getKeywords() != null ? cluster.getKeywords() : Collections.emptyList())));
                parentRow.createCell(4).setCellValue(cluster.getCount() != null ? cluster.getCount() : 0);
                parentRow.createCell(5).setCellValue(cluster.getTotalAmount() != null ? cluster.getTotalAmount() : 0.0);

                for (ClusteringResult sub : subClusters) {
                    Row subRow = sheet.createRow(rowNum++);
                    subRow.createCell(0).setCellValue(sub.getClusterNumber());
                    subRow.createCell(1).setCellValue(truncateText(cluster.getClusterName()));
                    subRow.createCell(2).setCellValue(truncateText(sub.getClusterName()));
                    subRow.createCell(3).setCellValue(truncateText(String.join(", ", sub.getKeywords() != null ? sub.getKeywords() : Collections.emptyList())));
                    subRow.createCell(4).setCellValue(sub.getCount() != null ? sub.getCount() : 0);
                    subRow.createCell(5).setCellValue(sub.getTotalAmount() != null ? sub.getTotalAmount() : 0.0);
                }
            }
        }
    }

    /**
     * raw_data 시트 생성 (병렬 데이터 수집)
     */
    private void createRawDataSheet(SXSSFWorkbook workbook, String sessionId,
                                     List<ClusteringResult> clusters, List<String> columns) {
        Sheet sheet = workbook.createSheet("raw_data");
        CellStyle headerStyle = createHeaderStyle(workbook);

        // 헤더
        Row headerRow = sheet.createRow(0);
        for (int i = 0; i < columns.size(); i++) {
            Cell cell = headerRow.createCell(i);
            cell.setCellValue(columns.get(i));
            cell.setCellStyle(headerStyle);
        }

        // ★ raw_data_id → ClusterInfo 매핑 (세부클러스터명 포함)
        Map<String, ClusterInfo> clusterInfoMap = buildRawIdToClusterMap(sessionId);

        // ★ 배치 쿼리: 전체 raw_data_id를 수집 → 10,000건씩 일괄 조회 → Map으로 O(1) 조회
        long t0 = System.currentTimeMillis();
        Set<String> allRawDataIds = new LinkedHashSet<>();
        for (ClusteringResult c : clusters) {
            if (c.getDataIndices() != null) allRawDataIds.addAll(c.getDataIndices());
        }
        log.info("[EXPORT-BATCH] 전체 raw_data_id 수집: {}건, 클러스터 수: {}", allRawDataIds.size(), clusters.size());

        Map<String, Document> dataMap = new HashMap<>(allRawDataIds.size());
        List<String> idList = new ArrayList<>(allRawDataIds);
        int BATCH_SIZE = 10_000;
        int batchCount = 0;
        for (int i = 0; i < idList.size(); i += BATCH_SIZE) {
            List<String> batch = idList.subList(i, Math.min(i + BATCH_SIZE, idList.size()));
            Query batchQuery = new Query(Criteria.where("session_id").is(sessionId)
                    .and("raw_data_id").in(batch));
            List<Document> batchResult = mongoTemplate.find(batchQuery, Document.class, "session_data");
            for (Document doc : batchResult) {
                dataMap.put(doc.getString("raw_data_id"), doc);
            }
            batchCount++;
        }
        log.info("[EXPORT-BATCH] 배치 쿼리 완료: {}회 쿼리, {}건 로드, {}ms",
                batchCount, dataMap.size(), System.currentTimeMillis() - t0);

        // 클러스터별로 Map에서 조회하여 Excel 행 작성
        int rowNum = 1;
        for (ClusteringResult cluster : clusters) {
            List<String> rawDataIds = cluster.getDataIndices();
            if (rawDataIds == null || rawDataIds.isEmpty()) continue;

            for (String rawDataId : rawDataIds) {
                Document doc = dataMap.get(rawDataId);
                if (doc == null) continue;

                if (rowNum > MAX_ROWS_PER_SHEET) {
                    log.warn("Max rows exceeded");
                    break;
                }

                Row row = sheet.createRow(rowNum++);

                // 클러스터명 + 세부클러스터명 (ClusterInfo 매핑 활용)
                ClusterInfo info = clusterInfoMap.getOrDefault(rawDataId, ClusterInfo.NONE);
                String clusterName = info.clusterName != null ? info.clusterName : cluster.getClusterName();
                String subClusterName = info.subClusterName != null ? info.subClusterName : "-";
                row.createCell(0).setCellValue(truncateText(clusterName));
                row.createCell(1).setCellValue(truncateText(subClusterName));

                // 나머지 컬럼 데이터
                @SuppressWarnings("unchecked")
                Map<String, Object> data = (Map<String, Object>) doc.get("data");
                if (data != null) {
                    for (int i = 2; i < columns.size(); i++) {
                        Cell cell = row.createCell(i);
                        Object value = data.get(columns.get(i));
                        setCellValue(cell, value);
                    }
                }
            }
        }

        log.info("[EXPORT-BATCH] raw_data 시트 생성 완료: {} rows, 총 {}ms", rowNum - 1, System.currentTimeMillis() - t0);
    }

    // ============================================================
    // 7. 세션 완료 처리 (Redis 기반 진행률 추적)
    // ============================================================

    /**
     * 비동기 세션 완료 시작 → taskId 반환
     * 진행률은 Redis Hash에 저장하여 서버 재시작에도 안전
     */
    public Map<String, Object> completeSessionAsync(String sessionId, String projectId, boolean forceExport) {
        // 중복 실행 방지 (Redis 기반)
        Object existingTaskId = redisService.getSessionCompleteTaskId(sessionId);
        if (existingTaskId != null) {
            String tid = existingTaskId.toString();
            Map<Object, Object> existing = redisService.getCompleteProgress(tid);
            if (!existing.isEmpty() && "RUNNING".equals(existing.get("status"))) {
                log.info("[COMPLETE-ASYNC] 이미 실행 중: sessionId={}, taskId={}", sessionId, tid);
                return Map.of("async", true, "taskId", tid, "alreadyRunning", true);
            }
        }

        String taskId = UUID.randomUUID().toString();

        // Redis에 세션→taskId 매핑 잠금 (10분 TTL)
        Boolean locked = redisService.lockSessionComplete(sessionId, taskId);
        if (!Boolean.TRUE.equals(locked)) {
            // 동시 요청으로 다른 스레드가 먼저 잠금 획득
            Object otherTaskId = redisService.getSessionCompleteTaskId(sessionId);
            if (otherTaskId != null) {
                return Map.of("async", true, "taskId", otherTaskId.toString(), "alreadyRunning", true);
            }
        }

        // Redis에 초기 진행률 저장
        redisService.saveCompleteProgress(taskId, "RUNNING", 0, "시작 중...", sessionId);

        log.info("[COMPLETE-ASYNC] 시작: sessionId={}, taskId={}, forceExport={}", sessionId, taskId, forceExport);

        EXECUTOR.submit(() -> {
            long startTime = System.currentTimeMillis();
            try {
                Map<String, Object> result = doCompleteSessionWithExport(sessionId, projectId, forceExport, taskId);

                // 결과를 JSON 문자열로 변환하여 Redis에 저장
                String resultJson = serializeResultToJson(result);
                redisService.saveCompleteResult(taskId, "COMPLETED", 100, "완료", resultJson);
                redisService.unlockSessionComplete(sessionId);

                log.info("[COMPLETE-ASYNC] 완료: taskId={}, sessionId={}, 소요시간={}ms",
                        taskId, sessionId, System.currentTimeMillis() - startTime);
            } catch (Throwable e) {
                log.error("[COMPLETE-ASYNC] 실패: taskId={}, sessionId={}, errorType={}, 소요시간={}ms",
                        taskId, sessionId, e.getClass().getName(), System.currentTimeMillis() - startTime, e);
                redisService.saveCompleteResult(taskId, "FAILED", 0, e.getMessage(), null);
                redisService.unlockSessionComplete(sessionId);
            }
        });

        return Map.of("async", true, "taskId", taskId);
    }

    /**
     * 세션 완료 진행률 조회 (Redis 기반)
     */
    public Map<String, Object> getCompleteProgress(String taskId, String sessionId) {
        Map<Object, Object> redisData = redisService.getCompleteProgress(taskId);

        if (redisData == null || redisData.isEmpty()) {
            // Redis에 없으면 DB에서 세션 완료 상태 확인 (fallback)
            if (sessionId != null) {
                Query q = new Query(Criteria.where("session_id").is(sessionId));
                q.fields().include("is_completed");
                FileSession session = mongoTemplate.findOne(q, FileSession.class);
                if (session != null && Boolean.TRUE.equals(session.getIsCompleted())) {
                    log.info("[COMPLETE-PROGRESS] Redis 미발견, DB 완료 확인: taskId={}, sessionId={}", taskId, sessionId);
                    return Map.of("status", "COMPLETED", "progress", 100, "message", "완료",
                            "result", Map.of("completed", true, "sessionId", sessionId));
                }
            }
            log.warn("[COMPLETE-PROGRESS] NOT_FOUND: taskId={}, sessionId={}", taskId, sessionId);
            return Map.of("status", "NOT_FOUND");
        }

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("status", String.valueOf(redisData.getOrDefault("status", "RUNNING")));
        r.put("progress", parseIntSafe(redisData.get("progress"), 0));
        r.put("message", String.valueOf(redisData.getOrDefault("message", "처리 중...")));

        // 완료 시 결과 역직렬화
        Object resultJson = redisData.get("result");
        if (resultJson != null) {
            try {
                r.put("result", deserializeJsonToResult(resultJson.toString()));
            } catch (Exception e) {
                log.warn("[COMPLETE-PROGRESS] result 역직렬화 실패: {}", e.getMessage());
                r.put("result", Map.of("completed", true, "sessionId", String.valueOf(redisData.getOrDefault("sessionId", ""))));
            }
        }

        return r;
    }

    /**
     * 세션 완료 활성 여부 확인 (Redis 기반)
     */
    public Map<String, Object> isCompleteActive(String sessionId) {
        Object taskIdObj = redisService.getSessionCompleteTaskId(sessionId);
        if (taskIdObj == null) return Map.of("active", false);

        String taskId = taskIdObj.toString();
        Map<Object, Object> cp = redisService.getCompleteProgress(taskId);
        if (cp.isEmpty()) {
            redisService.unlockSessionComplete(sessionId);
            return Map.of("active", false);
        }

        String status = String.valueOf(cp.getOrDefault("status", ""));
        if ("COMPLETED".equals(status) || "FAILED".equals(status)) {
            redisService.unlockSessionComplete(sessionId);
            return Map.of("active", false);
        }

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("active", true);
        r.put("taskId", taskId);
        r.put("progress", parseIntSafe(cp.get("progress"), 0));
        r.put("message", String.valueOf(cp.getOrDefault("message", "")));
        return r;
    }

    /**
     * 세션 완료 처리 (Export 포함) — 내부 실행 (Redis 진행률 업데이트)
     * ★ Phase 2: 엑셀 생성과 통계 데이터 로드를 병렬 실행
     */
    private Map<String, Object> doCompleteSessionWithExport(String sessionId, String projectId,
                                                             boolean forceExport, String taskId) throws IOException {
        long totalStart = System.currentTimeMillis();

        updateRedisProgress(taskId, sessionId, 5, "세션 정보 확인 중...");

        Query query = new Query(Criteria.where("session_id").is(sessionId));
        FileSession session = mongoTemplate.findOne(query, FileSession.class);

        String exportPath = session != null ? session.getExportPath() : null;
        boolean needsExport = forceExport || exportPath == null || exportPath.isBlank();

        Map<String, Object> result = new HashMap<>();

        // ★ Phase 2: 엑셀 생성과 통계 데이터(process_view_data) 로드를 병렬 실행
        // 통계 데이터 사전 로드 (병렬)
        CompletableFuture<Map<String, ClusterStatisticsService.DocData>> pvdFuture =
                CompletableFuture.supplyAsync(() -> {
                    long t = System.currentTimeMillis();
                    Map<String, ClusterStatisticsService.DocData> data =
                            clusterStatisticsService.loadProcessViewData(sessionId);
                    log.info("[COMPLETE-PARALLEL] loadProcessViewData 완료: {}건, {}ms",
                            data.size(), System.currentTimeMillis() - t);
                    return data;
                }, EXECUTOR);

        if (needsExport) {
            updateRedisProgress(taskId, sessionId, 10, "Excel 생성 중...");
            long t0 = System.currentTimeMillis();
            ExportResult exportResult = exportAllClusters(sessionId, projectId);
            log.info("[COMPLETE-TIMING] exportAllClusters: {}ms", System.currentTimeMillis() - t0);

            exportPath = exportResult.getS3Key();
            result.put("exported", true);
            result.put("exportResult", exportResult);
            updateRedisProgress(taskId, sessionId, 60, "Excel 생성 완료. 통계 생성 중...");
        } else {
            result.put("exported", false);
            result.put("existingExportPath", exportPath);
            updateRedisProgress(taskId, sessionId, 60, "통계 생성 중...");
        }

        // ★ 사전 로드된 통계 데이터로 통계 생성 (병렬 로드 결과 활용)
        long t1 = System.currentTimeMillis();
        try {
            Map<String, ClusterStatisticsService.DocData> pvdData = pvdFuture.get(120, TimeUnit.SECONDS);
            clusterStatisticsService.generateStatisticsWithData(sessionId, projectId, pvdData);
        } catch (TimeoutException e) {
            log.warn("[COMPLETE-PARALLEL] pvd 로드 타임아웃, 동기 방식으로 fallback");
            clusterStatisticsService.generateStatistics(sessionId, projectId);
        } catch (Exception e) {
            log.warn("[COMPLETE-PARALLEL] pvd 병렬 로드 실패, 동기 방식으로 fallback: {}", e.getMessage());
            clusterStatisticsService.generateStatistics(sessionId, projectId);
        }
        log.info("[COMPLETE-TIMING] generateStatistics: {}ms", System.currentTimeMillis() - t1);

        updateRedisProgress(taskId, sessionId, 90, "세션 완료 처리 중...");

        // 세션 완료 처리
        completeSession(sessionId, exportPath);
        updateRedisProgress(taskId, sessionId, 95, "마무리 중...");

        result.put("completed", true);
        result.put("sessionId", sessionId);

        log.info("[COMPLETE-TIMING] 전체 완료: {}ms", System.currentTimeMillis() - totalStart);
        return result;
    }

    /**
     * 세션 완료 처리 (동기 — 기존 호환)
     */
    public Map<String, Object> completeSessionWithExport(String sessionId, String projectId, boolean forceExport) throws IOException {
        String tempTaskId = "sync-" + UUID.randomUUID();
        redisService.saveCompleteProgress(tempTaskId, "RUNNING", 0, "동기 처리 시작...", sessionId);
        try {
            return doCompleteSessionWithExport(sessionId, projectId, forceExport, tempTaskId);
        } finally {
            redisService.delete("complete:progress:" + tempTaskId);
        }
    }

    // ============================================================
    // 8. Phase 3: 엑셀 우선 반환 + 통계/DB 비동기
    // ============================================================

    /**
     * ★ Phase 3: 엑셀을 먼저 생성하여 downloadUrl을 즉시 반환하고,
     * 통계 생성 + 세션 완료는 비동기로 처리한다.
     *
     * @return { downloadUrl, taskId, exported, async }
     */
    public Map<String, Object> completeSessionExcelFirst(String sessionId, String projectId, boolean forceExport) {
        log.info("[EXCEL-FIRST] 시작: sessionId={}, forceExport={}", sessionId, forceExport);
        long t0 = System.currentTimeMillis();

        Map<String, Object> response = new LinkedHashMap<>();
        String taskId = UUID.randomUUID().toString();

        // 세션 잠금 (중복 실행 방지)
        Boolean locked = redisService.lockSessionComplete(sessionId, taskId);
        if (!Boolean.TRUE.equals(locked)) {
            Object existingTaskId = redisService.getSessionCompleteTaskId(sessionId);
            if (existingTaskId != null) {
                return Map.of("async", true, "taskId", existingTaskId.toString(), "alreadyRunning", true);
            }
        }

        try {
            // 1. 세션 정보 확인
            Query query = new Query(Criteria.where("session_id").is(sessionId));
            FileSession session = mongoTemplate.findOne(query, FileSession.class);
            String exportPath = session != null ? session.getExportPath() : null;
            boolean needsExport = forceExport || exportPath == null || exportPath.isBlank();

            // 2. 엑셀 생성 (동기)
            String downloadUrl = null;
            if (needsExport) {
                long excelStart = System.currentTimeMillis();
                ExportResult exportResult = exportAllClusters(sessionId, projectId);
                exportPath = exportResult.getS3Key();
                downloadUrl = exportResult.getDownloadUrl();
                response.put("exported", true);
                response.put("downloadUrl", downloadUrl);
                response.put("fileSize", exportResult.getFileSize());
                log.info("[EXCEL-FIRST] 엑셀 생성 완료: {}ms, s3Key={}", System.currentTimeMillis() - excelStart, exportPath);
            } else {
                // 기존 Export가 있으면 URL 재생성
                response.put("exported", false);
                Map<String, Object> urlResult = getExportDownloadUrl(sessionId);
                if (urlResult.containsKey("downloadUrl")) {
                    downloadUrl = urlResult.get("downloadUrl").toString();
                    response.put("downloadUrl", downloadUrl);
                }
            }

            // 3. 통계 생성 + 세션 완료는 비동기로 실행
            final String finalExportPath = exportPath;
            redisService.saveCompleteProgress(taskId, "RUNNING", 60, "통계 생성 중...", sessionId);

            EXECUTOR.submit(() -> {
                long asyncStart = System.currentTimeMillis();
                try {
                    // 통계 생성
                    clusterStatisticsService.generateStatistics(sessionId, projectId);
                    redisService.saveCompleteProgress(taskId, "RUNNING", 90, "세션 완료 처리 중...", sessionId);

                    // 세션 완료 DB 업데이트
                    completeSession(sessionId, finalExportPath);

                    // 완료
                    String resultJson = "{\"completed\":true,\"sessionId\":\"" + escapeJson(sessionId) + "\"}";
                    redisService.saveCompleteResult(taskId, "COMPLETED", 100, "완료", resultJson);
                    redisService.unlockSessionComplete(sessionId);
                    log.info("[EXCEL-FIRST-ASYNC] 통계+완료 처리 완료: sessionId={}, {}ms",
                            sessionId, System.currentTimeMillis() - asyncStart);
                } catch (Throwable e) {
                    log.error("[EXCEL-FIRST-ASYNC] 통계+완료 처리 실패: sessionId={}", sessionId, e);
                    redisService.saveCompleteResult(taskId, "FAILED", 0, e.getMessage(), null);
                    redisService.unlockSessionComplete(sessionId);
                }
            });

            response.put("async", true);
            response.put("taskId", taskId);
            response.put("mode", "excel_first");

            log.info("[EXCEL-FIRST] 엑셀 반환 완료, 통계 비동기 시작: sessionId={}, 총 {}ms",
                    sessionId, System.currentTimeMillis() - t0);
            return response;

        } catch (Exception e) {
            log.error("[EXCEL-FIRST] 실패: sessionId={}", sessionId, e);
            redisService.unlockSessionComplete(sessionId);
            throw new RuntimeException("엑셀 우선 완료 실패: " + e.getMessage(), e);
        }
    }

    // ============================================================
    // 9. Fire-and-Forget 모드: 즉시 반환 + MongoDB 진행률 추적
    // ============================================================

    /**
     * ★ 완전 비동기 세션 완료 — 즉시 반환 (< 100ms)
     * 모든 무거운 작업(Excel 생성, 통계, S3 업로드)은 백그라운드에서 실행.
     * 진행률은 MongoDB FileSession의 exportStatus/exportMessage/progressPercentage에 저장.
     * MultiFileUploadPage에서 세션 목록 폴링으로 진행률을 확인.
     */
    public Map<String, Object> completeSessionFullyAsync(String sessionId, String projectId, boolean forceExport) {
        log.info("[FIRE-AND-FORGET] 시작: sessionId={}, forceExport={}", sessionId, forceExport);

        // 중복 실행 방지 (Redis 기반)
        Object existingTaskId = redisService.getSessionCompleteTaskId(sessionId);
        if (existingTaskId != null) {
            Map<Object, Object> existing = redisService.getCompleteProgress(existingTaskId.toString());
            if (!existing.isEmpty() && "RUNNING".equals(existing.get("status"))) {
                log.info("[FIRE-AND-FORGET] 이미 실행 중: sessionId={}", sessionId);
                return Map.of("async", true, "sessionId", sessionId, "alreadyRunning", true);
            }
        }

        String taskId = UUID.randomUUID().toString();

        // Redis 세션 잠금
        Boolean locked = redisService.lockSessionComplete(sessionId, taskId);
        if (!Boolean.TRUE.equals(locked)) {
            Object otherTaskId = redisService.getSessionCompleteTaskId(sessionId);
            if (otherTaskId != null) {
                return Map.of("async", true, "sessionId", sessionId, "alreadyRunning", true);
            }
        }

        // MongoDB에 즉시 export 상태 설정
        updateExportStatus(sessionId, "EXPORTING", 0, "시작 중...");

        // Redis 초기 진행률 (기존 호환)
        redisService.saveCompleteProgress(taskId, "RUNNING", 0, "시작 중...", sessionId);

        // 비동기 작업 제출
        EXECUTOR.submit(() -> {
            long startTime = System.currentTimeMillis();
            try {
                doCompleteSessionWithMongoProgress(sessionId, projectId, forceExport, taskId);

                // Redis 완료 (기존 호환)
                redisService.saveCompleteResult(taskId, "COMPLETED", 100, "완료", null);
                redisService.unlockSessionComplete(sessionId);

                log.info("[FIRE-AND-FORGET] 완료: sessionId={}, 소요시간={}ms",
                        sessionId, System.currentTimeMillis() - startTime);
            } catch (Throwable e) {
                log.error("[FIRE-AND-FORGET] 실패: sessionId={}, 소요시간={}ms",
                        sessionId, System.currentTimeMillis() - startTime, e);
                updateExportStatus(sessionId, "FAILED", 0, "완료 처리 실패: " + e.getMessage());
                redisService.saveCompleteResult(taskId, "FAILED", 0, e.getMessage(), null);
                redisService.unlockSessionComplete(sessionId);
            }
        });

        log.info("[FIRE-AND-FORGET] 비동기 작업 제출 완료, 즉시 반환: sessionId={}, taskId={}", sessionId, taskId);
        return Map.of("async", true, "sessionId", sessionId, "taskId", taskId);
    }

    /**
     * MongoDB FileSession의 export 상태를 업데이트
     */
    private void updateExportStatus(String sessionId, String status, int progress, String message) {
        try {
            Query query = new Query(Criteria.where("session_id").is(sessionId));
            Update update = new Update()
                    .set("export_status", status)
                    .set("progress_percentage", progress)
                    .set("export_message", message)
                    .set("updated_at", LocalDateTime.now());
            mongoTemplate.updateFirst(query, update, FileSession.class);
        } catch (Exception e) {
            log.warn("[EXPORT-STATUS] MongoDB 상태 업데이트 실패 (무시): sessionId={}, error={}", sessionId, e.getMessage());
        }
    }

    /**
     * 세션 완료 처리 — MongoDB 진행률 업데이트 포함
     * 기존 doCompleteSessionWithExport 로직을 재사용하되, 각 단계마다 MongoDB도 업데이트
     */
    private void doCompleteSessionWithMongoProgress(String sessionId, String projectId,
                                                      boolean forceExport, String taskId) throws IOException {
        long totalStart = System.currentTimeMillis();

        updateExportStatus(sessionId, "EXPORTING", 5, "세션 정보 확인 중...");
        updateRedisProgress(taskId, sessionId, 5, "세션 정보 확인 중...");

        Query query = new Query(Criteria.where("session_id").is(sessionId));
        FileSession session = mongoTemplate.findOne(query, FileSession.class);

        String exportPath = session != null ? session.getExportPath() : null;
        boolean needsExport = forceExport || exportPath == null || exportPath.isBlank();

        // 통계 데이터 사전 로드 (병렬)
        CompletableFuture<Map<String, ClusterStatisticsService.DocData>> pvdFuture =
                CompletableFuture.supplyAsync(() -> {
                    long t = System.currentTimeMillis();
                    Map<String, ClusterStatisticsService.DocData> data =
                            clusterStatisticsService.loadProcessViewData(sessionId);
                    log.info("[FIRE-AND-FORGET] loadProcessViewData 완료: {}건, {}ms",
                            data.size(), System.currentTimeMillis() - t);
                    return data;
                }, EXECUTOR);

        if (needsExport) {
            updateExportStatus(sessionId, "EXPORTING", 10, "Excel 파일 생성 중...");
            updateRedisProgress(taskId, sessionId, 10, "Excel 파일 생성 중...");

            long t0 = System.currentTimeMillis();
            ExportResult exportResult = exportAllClusters(sessionId, projectId);
            log.info("[FIRE-AND-FORGET] exportAllClusters: {}ms", System.currentTimeMillis() - t0);

            exportPath = exportResult.getS3Key();

            updateExportStatus(sessionId, "EXPORTING", 60, "Excel 생성 완료. 통계 생성 중...");
            updateRedisProgress(taskId, sessionId, 60, "Excel 생성 완료. 통계 생성 중...");
        } else {
            updateExportStatus(sessionId, "EXPORTING", 60, "통계 생성 중...");
            updateRedisProgress(taskId, sessionId, 60, "통계 생성 중...");
        }

        // 통계 생성 (병렬 로드 결과 활용)
        long t1 = System.currentTimeMillis();
        try {
            Map<String, ClusterStatisticsService.DocData> pvdData = pvdFuture.get(120, TimeUnit.SECONDS);
            clusterStatisticsService.generateStatisticsWithData(sessionId, projectId, pvdData);
        } catch (TimeoutException e) {
            log.warn("[FIRE-AND-FORGET] pvd 로드 타임아웃, 동기 방식으로 fallback");
            clusterStatisticsService.generateStatistics(sessionId, projectId);
        } catch (Exception e) {
            log.warn("[FIRE-AND-FORGET] pvd 병렬 로드 실패, 동기 방식으로 fallback: {}", e.getMessage());
            clusterStatisticsService.generateStatistics(sessionId, projectId);
        }
        log.info("[FIRE-AND-FORGET] generateStatistics: {}ms", System.currentTimeMillis() - t1);

        updateExportStatus(sessionId, "EXPORTING", 90, "세션 완료 처리 중...");
        updateRedisProgress(taskId, sessionId, 90, "세션 완료 처리 중...");

        // 세션 완료 처리 (isCompleted=true, exportPath 설정)
        completeSession(sessionId, exportPath);

        // export 상태 정리 (isCompleted=true이므로 analysisStatus는 "완료"로 표시됨)
        Query clearQuery = new Query(Criteria.where("session_id").is(sessionId));
        Update clearUpdate = new Update()
                .set("export_status", null)
                .set("export_message", null)
                .set("progress_percentage", 100);
        mongoTemplate.updateFirst(clearQuery, clearUpdate, FileSession.class);

        log.info("[FIRE-AND-FORGET] 전체 완료: sessionId={}, {}ms", sessionId, System.currentTimeMillis() - totalStart);
    }

    // ★ Redis 진행률 업데이트 헬퍼
    private void updateRedisProgress(String taskId, String sessionId, int progress, String message) {
        try {
            redisService.saveCompleteProgress(taskId, "RUNNING", progress, message, sessionId);
        } catch (Exception e) {
            log.warn("[COMPLETE-REDIS] 진행률 업데이트 실패 (무시): taskId={}, error={}", taskId, e.getMessage());
        }
    }

    // ★ 결과 직렬화/역직렬화 (간단한 JSON)
    private String serializeResultToJson(Map<String, Object> result) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Object> entry : result.entrySet()) {
            if (!first) sb.append(",");
            first = false;
            sb.append("\"").append(entry.getKey()).append("\":");
            Object val = entry.getValue();
            if (val == null) {
                sb.append("null");
            } else if (val instanceof Boolean || val instanceof Number) {
                sb.append(val);
            } else if (val instanceof ExportResult) {
                ExportResult er = (ExportResult) val;
                sb.append("{\"s3Key\":\"").append(escapeJson(er.getS3Key()))
                  .append("\",\"downloadUrl\":\"").append(escapeJson(er.getDownloadUrl()))
                  .append("\",\"fileSize\":").append(er.getFileSize())
                  .append("}");
            } else {
                sb.append("\"").append(escapeJson(String.valueOf(val))).append("\"");
            }
        }
        sb.append("}");
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> deserializeJsonToResult(String json) {
        // 간단한 파싱 — completed, sessionId, exported, exportResult 필드 추출
        Map<String, Object> result = new LinkedHashMap<>();
        if (json.contains("\"completed\":true")) result.put("completed", true);
        if (json.contains("\"exported\":true")) result.put("exported", true);
        if (json.contains("\"exported\":false")) result.put("exported", false);

        // sessionId 추출
        int sidIdx = json.indexOf("\"sessionId\":\"");
        if (sidIdx >= 0) {
            int start = sidIdx + 14;
            int end = json.indexOf("\"", start);
            if (end > start) result.put("sessionId", json.substring(start, end));
        }

        // downloadUrl 추출
        int dlIdx = json.indexOf("\"downloadUrl\":\"");
        if (dlIdx >= 0) {
            int start = dlIdx + 15;
            int end = json.indexOf("\"", start);
            if (end > start) {
                Map<String, Object> exportResult = new LinkedHashMap<>();
                exportResult.put("downloadUrl", json.substring(start, end));
                result.put("exportResult", exportResult);
            }
        }

        return result;
    }

    private String escapeJson(String str) {
        if (str == null) return "";
        return str.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }

    private int parseIntSafe(Object value, int defaultValue) {
        if (value == null) return defaultValue;
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    /**
     * 세션 완료 처리
     */
    public void completeSession(String sessionId, String exportPath) {
        Query query = new Query(Criteria.where("session_id").is(sessionId));
        Update update = new Update()
                .set("is_completed", true)
                .set("export_path", exportPath)
                .set("completed_at", LocalDateTime.now())
                .set("updated_at", LocalDateTime.now());
        mongoTemplate.updateFirst(query, update, FileSession.class);
        log.info("세션 완료: sessionId={}, exportPath={}", sessionId, exportPath);

        // 프로젝트 자동 완료 체크
        FileSession session = mongoTemplate.findOne(query, FileSession.class);
        if (session != null) {
            checkAndUpdateProjectCompletion(session.getProjectId());
        }
    }

    private void checkAndUpdateProjectCompletion(String projectId) {
        try {
            var sessions = mongoTemplate.find(
                    new Query(Criteria.where("project_id").is(projectId).and("is_deleted").ne(true)),
                    FileSession.class);
            if (sessions.isEmpty()) return;

            boolean allCompleted = sessions.stream()
                    .allMatch(s -> Boolean.TRUE.equals(s.getIsCompleted()));

            Query pq = new Query(Criteria.where("project_id").is(projectId));
            Update pu = new Update()
                    .set("is_completed", allCompleted)
                    .set("updated_at", LocalDateTime.now());
            mongoTemplate.updateFirst(pq, pu, "projects");
            log.info("프로젝트 자동 완료상태 갱신: projectId={}, isCompleted={}", projectId, allCompleted);
        } catch (Exception e) {
            log.warn("프로젝트 완료 상태 갱신 실패: {}", e.getMessage());
        }
    }

    private void updateSessionExportPath(String sessionId, String s3Key) {
        Query query = new Query(Criteria.where("session_id").is(sessionId));
        Update update = new Update()
                .set("export_path", s3Key)
                .set("updated_at", LocalDateTime.now());
        mongoTemplate.updateFirst(query, update, FileSession.class);
    }

    /**
     * Export 다운로드 URL 조회
     */
    public Map<String, Object> getExportDownloadUrl(String sessionId) {
        Query query = new Query(Criteria.where("session_id").is(sessionId));
        FileSession session = mongoTemplate.findOne(query, FileSession.class);

        Map<String, Object> result = new HashMap<>();
        if (session != null && session.getExportPath() != null && !session.getExportPath().isBlank()) {
            String downloadUrl = generatePresignedUrl(session.getExportPath());
            result.put("hasExport", true);
            result.put("exportPath", session.getExportPath());
            result.put("downloadUrl", downloadUrl);
        } else {
            result.put("hasExport", false);
        }
        return result;
    }

    // ============================================================
    // 유틸리티 메서드
    // ============================================================

    private CellStyle createHeaderStyle(SXSSFWorkbook workbook) {
        CellStyle style = workbook.createCellStyle();
        style.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);

        Font font = workbook.createFont();
        font.setBold(true);
        style.setFont(font);

        return style;
    }

    private static final int MAX_CELL_TEXT_LENGTH = 100;

    private String truncateText(String text) {
        if (text == null) return "";
        if (text.length() > MAX_CELL_TEXT_LENGTH) return text.substring(0, MAX_CELL_TEXT_LENGTH) + "...";
        return text;
    }

    private void setCellValue(Cell cell, Object value) {
        if (value == null) {
            cell.setCellValue("");
        } else if (value instanceof Number) {
            cell.setCellValue(((Number) value).doubleValue());
        } else if (value instanceof Boolean) {
            cell.setCellValue((Boolean) value);
        } else {
            String text = value.toString();
            if (text.length() > MAX_CELL_TEXT_LENGTH) {
                text = text.substring(0, MAX_CELL_TEXT_LENGTH) + "...";
            }
            cell.setCellValue(text);
        }
    }

    private String generateS3Key(String sessionId) {
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
        return String.format("exports/%s/result_%s.xlsx", sessionId, timestamp);
    }

    private void uploadToS3(String s3Key, byte[] data) {
        PutObjectRequest putRequest = PutObjectRequest.builder()
                .bucket(S3_BUCKET)
                .key(s3Key)
                .contentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                .build();

        int maxRetries = 3;
        for (int attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                long t0 = System.currentTimeMillis();
                s3Client.putObject(putRequest, RequestBody.fromBytes(data));
                log.info("[S3-UPLOAD] 완료: s3://{}/{}, size={}bytes, {}ms (시도 {}/{})",
                        S3_BUCKET, s3Key, data.length, System.currentTimeMillis() - t0, attempt, maxRetries);
                return;
            } catch (Exception e) {
                log.error("[S3-UPLOAD] 실패 (시도 {}/{}): s3Key={}, error={}",
                        attempt, maxRetries, s3Key, e.getMessage());
                if (attempt == maxRetries) {
                    throw new RuntimeException("S3 업로드 최종 실패: " + s3Key, e);
                }
                try {
                    Thread.sleep(2000L * attempt);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("S3 업로드 중단됨", ie);
                }
            }
        }
    }

    private String generatePresignedUrl(String s3Key) {
        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofHours(24))
                .getObjectRequest(req -> req.bucket(S3_BUCKET).key(s3Key))
                .build();
        PresignedGetObjectRequest presignedRequest = s3Presigner.presignGetObject(presignRequest);
        return presignedRequest.url().toString();
    }

    // ========== 내부 클래스 ==========

    private static class ClusterInfo {
        static final ClusterInfo NONE = new ClusterInfo(null, null, null);

        final String clusterName;
        final String subClusterName;
        final Integer clusterNumber;

        ClusterInfo(String clusterName, String subClusterName, Integer clusterNumber) {
            this.clusterName = clusterName;
            this.subClusterName = subClusterName;
            this.clusterNumber = clusterNumber;
        }
    }

    @lombok.Data
    @lombok.Builder
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    public static class ExportResult {
        private String s3Key;
        private String downloadUrl;
        private Integer fileSize;
        private LocalDateTime exportedAt;
    }
}
