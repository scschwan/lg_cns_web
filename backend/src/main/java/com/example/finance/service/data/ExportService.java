package com.example.finance.service.data;

import com.example.finance.model.data.ClusteringResult;
import com.example.finance.model.data.ColumnMappingDocument;
import com.example.finance.model.session.FileSession;
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

            // 1. 요약 시트 생성
            createSummarySheet(workbook, clusters);

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
    private void createSummarySheet(SXSSFWorkbook workbook, List<ClusteringResult> clusters) {
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

        // 데이터
        int rowNum = 1;
        for (ClusteringResult cluster : clusters) {
            Row row = sheet.createRow(rowNum++);
            row.createCell(0).setCellValue(cluster.getClusterNumber());
            row.createCell(1).setCellValue(cluster.getClusterName() != null ? cluster.getClusterName() : "");
            row.createCell(2).setCellValue("-"); // 세부클러스터명
            row.createCell(3).setCellValue(String.join(", ", cluster.getKeywords() != null ? cluster.getKeywords() : Collections.emptyList()));
            row.createCell(4).setCellValue(cluster.getCount() != null ? cluster.getCount() : 0);
            row.createCell(5).setCellValue(cluster.getTotalAmount() != null ? cluster.getTotalAmount() : 0.0);
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

        // 클러스터별로 raw_data 수집 및 작성
        int rowNum = 1;
        for (ClusteringResult cluster : clusters) {
            List<String> rawDataIds = cluster.getDataIndices();
            if (rawDataIds == null || rawDataIds.isEmpty()) continue;

            // session_data에서 데이터 조회
            Query query = new Query(Criteria.where("session_id").is(sessionId)
                    .and("raw_data_id").in(rawDataIds));
            List<Document> dataList = mongoTemplate.find(query, Document.class, "session_data");

            for (Document doc : dataList) {
                if (rowNum > MAX_ROWS_PER_SHEET) {
                    log.warn("Max rows exceeded");
                    break;
                }

                Row row = sheet.createRow(rowNum++);

                // 클러스터명
                row.createCell(0).setCellValue(cluster.getClusterName() != null ? cluster.getClusterName() : "");
                // 세부클러스터명
                row.createCell(1).setCellValue("-");

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

        log.info("raw_data 시트 생성 완료: {} rows", rowNum - 1);
    }

    // ============================================================
    // 7. 세션 완료 처리
    // ============================================================

    /**
     * 세션 완료 처리 (Export 포함)
     */
    public Map<String, Object> completeSessionWithExport(String sessionId, String projectId, boolean forceExport) throws IOException {
        // 기존 Export 경로 확인
        Query query = new Query(Criteria.where("session_id").is(sessionId));
        FileSession session = mongoTemplate.findOne(query, FileSession.class);

        String exportPath = session != null ? session.getExportPath() : null;
        boolean needsExport = forceExport || exportPath == null || exportPath.isBlank();

        Map<String, Object> result = new HashMap<>();

        if (needsExport) {
            // 전체 Export 실행
            ExportResult exportResult = exportAllClusters(sessionId, projectId);
            exportPath = exportResult.getS3Key();
            result.put("exported", true);
            result.put("exportResult", exportResult);
        } else {
            result.put("exported", false);
            result.put("existingExportPath", exportPath);
        }

        // 클러스터 통계 생성
        clusterStatisticsService.generateStatistics(sessionId);

        // 세션 완료 처리
        completeSession(sessionId, exportPath);

        result.put("completed", true);
        result.put("sessionId", sessionId);
        return result;
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

    private void setCellValue(Cell cell, Object value) {
        if (value == null) {
            cell.setCellValue("");
        } else if (value instanceof Number) {
            cell.setCellValue(((Number) value).doubleValue());
        } else if (value instanceof Boolean) {
            cell.setCellValue((Boolean) value);
        } else {
            cell.setCellValue(value.toString());
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
        s3Client.putObject(putRequest, RequestBody.fromBytes(data));
        log.info("S3 업로드 완료: s3://{}/{}", S3_BUCKET, s3Key);
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
