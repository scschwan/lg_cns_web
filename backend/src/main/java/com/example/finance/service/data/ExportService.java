package com.example.finance.service.data;

import com.example.finance.model.data.ClusteringResult;
import com.example.finance.model.data.ProcessDataDocument;
import com.example.finance.model.session.FileSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Export 서비스 (Step 6)
 *
 * C# 원본: uc_Classification.cs
 * - Excel 내보내기 (Apache POI)
 * - S3 업로드
 * - 세션 완료 처리
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ExportService {

    private final MongoTemplate mongoTemplate;
    private final S3Client s3Client;
    private final S3Presigner s3Presigner;

    // ⭐ 병렬 처리용 스레드 풀 (CPU 코어 * 4)
    private final ExecutorService executorService = Executors.newFixedThreadPool(
            Runtime.getRuntime().availableProcessors() * 4
    );

    private static final String S3_BUCKET = System.getenv().getOrDefault(
            "S3_BUCKET_NAME",
            "finance-excel-uploads"
    );

    private static final int MAX_ROWS_PER_SHEET = 1000000; // Excel 최대 행 수

    /**
     * Excel 내보내기 (Apache POI)
     *
     * C# 원본: ExportToExcelAsync()
     *
     * 작업:
     * 1. clustering_results 조회
     * 2. Apache POI로 Excel 생성
     * 3. S3 업로드
     * 4. Presigned URL 생성
     */
    public ExportResult exportToExcel(
            String sessionId,
            String projectId,
            List<String> columns
    ) throws IOException {
        log.info("Starting Excel export: sessionId={}", sessionId);

        // 1. clustering_results 조회
        List<ClusteringResult> clusteringResults = getClusteringResults(sessionId);

        if (clusteringResults.isEmpty()) {
            throw new IllegalStateException("No clustering results found for session: " + sessionId);
        }

        // 2. Excel Workbook 생성
        Workbook workbook = new XSSFWorkbook();

        // 3. 클러스터별 시트 생성
        for (ClusteringResult cluster : clusteringResults) {
            createClusterSheet(workbook, sessionId, cluster, columns);
        }

        // 4. 요약 시트 생성
        createSummarySheet(workbook, clusteringResults);

        // 5. Excel → byte[]
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        workbook.write(outputStream);
        workbook.close();

        byte[] excelBytes = outputStream.toByteArray();
        log.info("Excel generated: {} bytes", excelBytes.length);

        // 6. S3 업로드
        String s3Key = generateS3Key(sessionId);
        uploadToS3(s3Key, excelBytes);

        // 7. Presigned URL 생성 (24시간 유효)
        String downloadUrl = generatePresignedUrl(s3Key);

        log.info("Excel exported successfully: {}", s3Key);

        return ExportResult.builder()
                .s3Key(s3Key)
                .downloadUrl(downloadUrl)
                .fileSize(excelBytes.length)
                .exportedAt(LocalDateTime.now())
                .build();
    }

    /**
     * 클러스터별 시트 생성
     */
    private void createClusterSheet(
            Workbook workbook,
            String sessionId,
            ClusteringResult cluster,
            List<String> columns
    ) {
        // 시트명 (클러스터명, 최대 31자)
        String sheetName = sanitizeSheetName(
                cluster.getClusterName() != null
                        ? cluster.getClusterName()
                        : "Cluster_" + cluster.getClusterId()
        );

        Sheet sheet = workbook.createSheet(sheetName);

        // 헤더 스타일
        CellStyle headerStyle = createHeaderStyle(workbook);

        // 헤더 행 생성
        Row headerRow = sheet.createRow(0);
        for (int i = 0; i < columns.size(); i++) {
            Cell cell = headerRow.createCell(i);
            cell.setCellValue(columns.get(i));
            cell.setCellStyle(headerStyle);
        }

        // 데이터 행 생성
        Query query = new Query(
                Criteria.where("session_id").is(sessionId)
                        .and("cluster_id").is(cluster.getClusterId())
        );

        List<ProcessDataDocument> dataList = mongoTemplate.find(query, ProcessDataDocument.class);

        int rowNum = 1;
        for (ProcessDataDocument data : dataList) {
            if (rowNum > MAX_ROWS_PER_SHEET) {
                log.warn("Max rows exceeded for cluster: {}", cluster.getClusterId());
                break;
            }

            Row row = sheet.createRow(rowNum++);
            Map<String, Object> dataMap = data.getData();

            for (int i = 0; i < columns.size(); i++) {
                Cell cell = row.createCell(i);
                Object value = dataMap.get(columns.get(i));
                setCellValue(cell, value);
            }
        }

        // 컬럼 너비 자동 조정 (최대 20자)
        for (int i = 0; i < columns.size(); i++) {
            sheet.autoSizeColumn(i);
            int width = sheet.getColumnWidth(i);
            sheet.setColumnWidth(i, Math.min(width, 20 * 256));
        }

        log.info("Sheet created: {}, rows={}", sheetName, rowNum - 1);
    }

    /**
     * 요약 시트 생성
     */
    private void createSummarySheet(Workbook workbook, List<ClusteringResult> clusteringResults) {
        Sheet sheet = workbook.createSheet("Summary");

        CellStyle headerStyle = createHeaderStyle(workbook);

        // 헤더
        Row headerRow = sheet.createRow(0);
        String[] headers = {"Cluster ID", "Cluster Name", "Record Count"};
        for (int i = 0; i < headers.length; i++) {
            Cell cell = headerRow.createCell(i);
            cell.setCellValue(headers[i]);
            cell.setCellStyle(headerStyle);
        }

        // 데이터
        int rowNum = 1;
        for (ClusteringResult cluster : clusteringResults) {
            Row row = sheet.createRow(rowNum++);
            row.createCell(0).setCellValue(cluster.getClusterId());
            row.createCell(1).setCellValue(cluster.getClusterName());
            row.createCell(2).setCellValue(cluster.getCount());
        }

        // 컬럼 너비 자동 조정
        for (int i = 0; i < headers.length; i++) {
            sheet.autoSizeColumn(i);
        }
    }

    /**
     * 헤더 스타일 생성
     */
    private CellStyle createHeaderStyle(Workbook workbook) {
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

    /**
     * 셀 값 설정 (타입 자동 판별)
     */
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

    /**
     * 시트명 정제 (Excel 규칙 준수)
     */
    private String sanitizeSheetName(String name) {
        // Excel 시트명 제약: 최대 31자, 특수문자 제거
        String sanitized = name.replaceAll("[\\[\\]\\*\\/\\\\:?]", "_");
        return sanitized.length() > 31 ? sanitized.substring(0, 31) : sanitized;
    }

    /**
     * S3 Key 생성
     */
    private String generateS3Key(String sessionId) {
        String timestamp = LocalDateTime.now().format(
                DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss")
        );
        return String.format("exports/%s/result_%s.xlsx", sessionId, timestamp);
    }

    /**
     * S3 업로드
     */
    private void uploadToS3(String s3Key, byte[] data) {
        PutObjectRequest putRequest = PutObjectRequest.builder()
                .bucket(S3_BUCKET)
                .key(s3Key)
                .contentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                .build();

        s3Client.putObject(putRequest, RequestBody.fromBytes(data));
        log.info("Uploaded to S3: s3://{}/{}", S3_BUCKET, s3Key);
    }

    /**
     * Presigned URL 생성 (24시간 유효)
     */
    private String generatePresignedUrl(String s3Key) {
        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofHours(24))
                .getObjectRequest(req -> req.bucket(S3_BUCKET).key(s3Key))
                .build();

        PresignedGetObjectRequest presignedRequest = s3Presigner.presignGetObject(presignRequest);
        return presignedRequest.url().toString();
    }

    /**
     * clustering_results 조회
     */
    private List<ClusteringResult> getClusteringResults(String sessionId) {
        Query query = new Query(Criteria.where("session_id").is(sessionId));
        query.with(org.springframework.data.domain.Sort.by(
                org.springframework.data.domain.Sort.Direction.ASC,
                "cluster_id"
        ));

        return mongoTemplate.find(query, ClusteringResult.class);
    }

    /**
     * 세션 완료 처리
     *
     * C# 원본: UpdateSessionCompletionAsync()
     */
    public void completeSession(String sessionId, String exportPath) {
        Query query = new Query(Criteria.where("session_id").is(sessionId));

        Update update = new Update()
                .set("is_completed", true)
                .set("export_path", exportPath)
                .set("completed_at", LocalDateTime.now())
                .set("updated_at", LocalDateTime.now());

        mongoTemplate.updateFirst(query, update, FileSession.class);

        log.info("Session completed: sessionId={}, exportPath={}", sessionId, exportPath);
    }

    // ========== DTO 클래스 ==========

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