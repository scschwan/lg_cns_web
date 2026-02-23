package com.example.finance.service.costreduction;

import com.example.finance.model.data.ClusterStatistics;
import com.example.finance.model.data.ClusterStatistics.BreakdownItem;
import com.example.finance.model.data.ClusteringResult;
import com.example.finance.model.data.SessionDataDocument;
import com.example.finance.model.session.FileSession;
import com.example.finance.repository.data.ClusterStatisticsRepository;
import com.example.finance.repository.data.ClusteringResultRepository;
import com.example.finance.repository.data.SessionDataRepository;
import com.example.finance.repository.session.FileSessionRepository;
import com.example.finance.service.common.RedisService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 클러스터링 엑셀 직접 Import 서비스
 *
 * 이미 클러스터링이 완료된 엑셀 파일을 업로드하여
 * 7단계 파이프라인을 거치지 않고 대시보드(Long List / Short List)에
 * 직접 데이터를 반영한다.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ClusteringImportService {

    private final FileSessionRepository fileSessionRepository;
    private final SessionDataRepository sessionDataRepository;
    private final ClusteringResultRepository clusteringResultRepository;
    private final ClusterStatisticsRepository clusterStatisticsRepository;
    private final RedisService redisService;

    /**
     * 클러스터링 엑셀 Import 메인 로직
     */
    public Map<String, Object> importClusteringExcel(
            String projectId,
            String userId,
            MultipartFile file,
            String accountName,
            String clusterColumn,
            String subClusterColumn,
            String supplierColumn,
            String costCenterColumn,
            String amountColumn) {

        log.info("클러스터링 엑셀 Import 시작: projectId={}, fileName={}", projectId, file.getOriginalFilename());

        // 1. 엑셀 파싱
        List<Map<String, Object>> rows = parseExcel(file);
        if (rows.isEmpty()) {
            throw new RuntimeException("엑셀 파일에 데이터가 없습니다.");
        }
        log.info("엑셀 파싱 완료: {} rows", rows.size());

        // 2. 가상 세션 생성
        String sessionId = UUID.randomUUID().toString();
        FileSession session = FileSession.builder()
                .sessionId(sessionId)
                .projectId(projectId)
                .sessionName(accountName + " (Import)")
                .createdBy(userId)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .accountNames(List.of(accountName))
                .totalFiles(1)
                .totalRowCount((long) rows.size())
                .isCompleted(true)
                .completedAt(LocalDateTime.now())
                .isDeleted(false)
                .build();
        fileSessionRepository.save(session);
        log.info("가상 세션 생성: sessionId={}", sessionId);

        // 3. session_data 생성 (행 데이터 저장)
        List<SessionDataDocument> sessionDocs = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> rowData = rows.get(i);
            String rawDataId = UUID.randomUUID().toString();
            rowData.put("__rawDataId", rawDataId);

            SessionDataDocument doc = SessionDataDocument.builder()
                    .projectId(projectId)
                    .sessionId(sessionId)
                    .rawDataId(rawDataId)
                    .rowNumber(i + 1)
                    .data(filterInternalKeys(rowData))
                    .isHidden(false)
                    .createdAt(LocalDateTime.now())
                    .build();
            sessionDocs.add(doc);
        }
        sessionDataRepository.saveAll(sessionDocs);
        log.info("session_data 저장 완료: {} docs", sessionDocs.size());

        // 4. 클러스터 그룹핑
        // key: clusterName, value: list of rows
        Map<String, List<Map<String, Object>>> clusterGroups = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String clusterName = getStringValue(row, clusterColumn);
            if (clusterName == null || clusterName.isBlank()) {
                clusterName = "(미분류)";
            }
            clusterGroups.computeIfAbsent(clusterName, k -> new ArrayList<>()).add(row);
        }

        // 5. 세부클러스터 그룹핑
        // key: clusterName -> subClusterName -> list of rows
        Map<String, Map<String, List<Map<String, Object>>>> subClusterGroups = new LinkedHashMap<>();
        boolean hasSubClusters = subClusterColumn != null && !subClusterColumn.isBlank();

        if (hasSubClusters) {
            for (Map.Entry<String, List<Map<String, Object>>> entry : clusterGroups.entrySet()) {
                String clusterName = entry.getKey();
                Map<String, List<Map<String, Object>>> subGroups = new LinkedHashMap<>();
                for (Map<String, Object> row : entry.getValue()) {
                    String subClusterName = getStringValue(row, subClusterColumn);
                    if (subClusterName == null || subClusterName.isBlank() || "-".equals(subClusterName)) {
                        subClusterName = "(미분류)";
                    }
                    subGroups.computeIfAbsent(subClusterName, k -> new ArrayList<>()).add(row);
                }
                subClusterGroups.put(clusterName, subGroups);
            }
        }

        // 6. ClusteringResult + ClusterStatistics 생성
        List<ClusteringResult> clusteringResults = new ArrayList<>();
        List<ClusterStatistics> statisticsList = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        int clusterNumberSeq = 1;

        List<String> allDataIndices = new ArrayList<>();
        int totalCountAll = 0;
        double totalAmountAll = 0.0;
        Map<String, long[]> sessionCcMap = new LinkedHashMap<>();
        Map<String, long[]> sessionSupMap = new LinkedHashMap<>();

        for (Map.Entry<String, List<Map<String, Object>>> entry : clusterGroups.entrySet()) {
            String clusterName = entry.getKey();
            List<Map<String, Object>> clusterRows = entry.getValue();

            // 이 클러스터의 raw_data_ids
            List<String> dataIndices = clusterRows.stream()
                    .map(r -> (String) r.get("__rawDataId"))
                    .collect(Collectors.toList());
            allDataIndices.addAll(dataIndices);

            int clusterCount = clusterRows.size();
            double clusterAmount = sumAmount(clusterRows, amountColumn);
            totalCountAll += clusterCount;
            totalAmountAll += clusterAmount;

            // 상위 클러스터 번호
            int parentClusterNumber = clusterNumberSeq;

            // ClusteringResult (상위 클러스터 - 병합 부모)
            ClusteringResult cr = ClusteringResult.builder()
                    .sessionId(sessionId)
                    .clusterNumber(parentClusterNumber)
                    .clusterId(parentClusterNumber) // 병합 부모 = 자기 자신
                    .clusterSubId(-1)
                    .clusterName(clusterName)
                    .keywords(List.of(clusterName))
                    .count(clusterCount)
                    .totalAmount(clusterAmount)
                    .dataIndices(dataIndices)
                    .createdAt(now)
                    .build();
            clusteringResults.add(cr);
            clusterNumberSeq++;

            // ClusterStatistics Level 2
            AggResult l2Agg = aggregate(clusterRows, supplierColumn, costCenterColumn, amountColumn);
            mergeMaps(sessionCcMap, l2Agg.ccMap);
            mergeMaps(sessionSupMap, l2Agg.supMap);

            statisticsList.add(ClusterStatistics.builder()
                    .projectId(projectId)
                    .sessionId(sessionId)
                    .clusterNumber(parentClusterNumber)
                    .parentClusterNumber(null)
                    .clusterName(clusterName)
                    .accountName(accountName)
                    .level(2)
                    .totalCount(clusterCount)
                    .totalAmount(clusterAmount)
                    .costCenterCount(l2Agg.ccMap.size())
                    .supplierCount(l2Agg.supMap.size())
                    .costCenterBreakdown(toBreakdownList(l2Agg.ccMap))
                    .supplierBreakdown(toBreakdownList(l2Agg.supMap))
                    .createdAt(now)
                    .build());

            // Level 3: 세부클러스터
            if (hasSubClusters && subClusterGroups.containsKey(clusterName)) {
                Map<String, List<Map<String, Object>>> subGroups = subClusterGroups.get(clusterName);
                // 세부클러스터가 1개이고 이름이 "(미분류)"뿐이면 세부클러스터 없는 것으로 처리
                if (subGroups.size() > 1 || !subGroups.containsKey("(미분류)")) {
                    for (Map.Entry<String, List<Map<String, Object>>> subEntry : subGroups.entrySet()) {
                        String subClusterName = subEntry.getKey();
                        List<Map<String, Object>> subRows = subEntry.getValue();

                        List<String> subDataIndices = subRows.stream()
                                .map(r -> (String) r.get("__rawDataId"))
                                .collect(Collectors.toList());

                        int subCount = subRows.size();
                        double subAmount = sumAmount(subRows, amountColumn);

                        int subClusterNumber = clusterNumberSeq;

                        // ClusteringResult (세부 클러스터 - 세부병합 부모)
                        ClusteringResult subCr = ClusteringResult.builder()
                                .sessionId(sessionId)
                                .clusterNumber(subClusterNumber)
                                .clusterId(parentClusterNumber)
                                .clusterSubId(subClusterNumber) // 세부병합 부모 = 자기 자신
                                .clusterName(subClusterName)
                                .keywords(List.of(subClusterName))
                                .count(subCount)
                                .totalAmount(subAmount)
                                .dataIndices(subDataIndices)
                                .createdAt(now)
                                .build();
                        clusteringResults.add(subCr);
                        clusterNumberSeq++;

                        // ClusterStatistics Level 3
                        AggResult l3Agg = aggregate(subRows, supplierColumn, costCenterColumn, amountColumn);

                        statisticsList.add(ClusterStatistics.builder()
                                .projectId(projectId)
                                .sessionId(sessionId)
                                .clusterNumber(subClusterNumber)
                                .parentClusterNumber(parentClusterNumber)
                                .clusterName(subClusterName)
                                .accountName(accountName)
                                .level(3)
                                .totalCount(subCount)
                                .totalAmount(subAmount)
                                .costCenterCount(l3Agg.ccMap.size())
                                .supplierCount(l3Agg.supMap.size())
                                .costCenterBreakdown(toBreakdownList(l3Agg.ccMap))
                                .supplierBreakdown(toBreakdownList(l3Agg.supMap))
                                .createdAt(now)
                                .build());
                    }
                }
            }
        }

        // Level 1: 세션 전체
        statisticsList.add(ClusterStatistics.builder()
                .projectId(projectId)
                .sessionId(sessionId)
                .clusterNumber(null)
                .parentClusterNumber(null)
                .clusterName(null)
                .accountName(accountName)
                .level(1)
                .totalCount(totalCountAll)
                .totalAmount(totalAmountAll)
                .costCenterCount(sessionCcMap.size())
                .supplierCount(sessionSupMap.size())
                .costCenterBreakdown(toBreakdownList(sessionCcMap))
                .supplierBreakdown(toBreakdownList(sessionSupMap))
                .createdAt(now)
                .build());

        // 7. 일괄 저장
        clusteringResultRepository.saveAll(clusteringResults);
        clusterStatisticsRepository.saveAll(statisticsList);

        log.info("클러스터링 Import 완료: sessionId={}, clusters={}, subClusters={}, stats={}",
                sessionId,
                clusterGroups.size(),
                statisticsList.stream().filter(s -> s.getLevel() == 3).count(),
                statisticsList.size());

        // 8. Redis 캐시 무효화
        invalidateCache(projectId);

        Map<String, Object> result = new HashMap<>();
        result.put("sessionId", sessionId);
        result.put("totalRows", rows.size());
        result.put("clusterCount", clusterGroups.size());
        result.put("statisticsCount", statisticsList.size());
        return result;
    }

    /**
     * 엑셀 파일 파싱 (Apache POI)
     */
    private List<Map<String, Object>> parseExcel(MultipartFile file) {
        List<Map<String, Object>> rows = new ArrayList<>();

        try (InputStream is = file.getInputStream();
             Workbook workbook = new XSSFWorkbook(is)) {

            Sheet sheet = workbook.getSheetAt(0);
            if (sheet == null) {
                throw new RuntimeException("엑셀 파일에 시트가 없습니다.");
            }

            // 헤더 행
            Row headerRow = sheet.getRow(0);
            if (headerRow == null) {
                throw new RuntimeException("헤더 행이 없습니다.");
            }

            List<String> headers = new ArrayList<>();
            for (int i = 0; i < headerRow.getLastCellNum(); i++) {
                Cell cell = headerRow.getCell(i);
                String headerName = getCellStringValue(cell);
                headers.add(headerName != null ? headerName.trim() : "Column_" + i);
            }

            // 데이터 행
            DataFormatter formatter = new DataFormatter();
            for (int rowIdx = 1; rowIdx <= sheet.getLastRowNum(); rowIdx++) {
                Row row = sheet.getRow(rowIdx);
                if (row == null) continue;

                // 빈 행 스킵
                boolean hasData = false;
                Map<String, Object> rowData = new LinkedHashMap<>();
                for (int colIdx = 0; colIdx < headers.size(); colIdx++) {
                    Cell cell = row.getCell(colIdx);
                    Object value = getCellValue(cell, formatter);
                    rowData.put(headers.get(colIdx), value);
                    if (value != null && !value.toString().isBlank()) {
                        hasData = true;
                    }
                }
                if (hasData) {
                    rows.add(rowData);
                }
            }

        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("엑셀 파일 파싱 실패: " + e.getMessage(), e);
        }

        return rows;
    }

    private Object getCellValue(Cell cell, DataFormatter formatter) {
        if (cell == null) return null;
        switch (cell.getCellType()) {
            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) {
                    return formatter.formatCellValue(cell);
                }
                double numVal = cell.getNumericCellValue();
                if (numVal == Math.floor(numVal) && !Double.isInfinite(numVal)) {
                    return (long) numVal;
                }
                return numVal;
            case STRING:
                return cell.getStringCellValue();
            case BOOLEAN:
                return cell.getBooleanCellValue();
            case FORMULA:
                try {
                    return cell.getNumericCellValue();
                } catch (Exception e) {
                    try {
                        return cell.getStringCellValue();
                    } catch (Exception e2) {
                        return formatter.formatCellValue(cell);
                    }
                }
            case BLANK:
                return null;
            default:
                return formatter.formatCellValue(cell);
        }
    }

    private String getCellStringValue(Cell cell) {
        if (cell == null) return null;
        switch (cell.getCellType()) {
            case STRING:
                return cell.getStringCellValue();
            case NUMERIC:
                return String.valueOf((long) cell.getNumericCellValue());
            default:
                return new DataFormatter().formatCellValue(cell);
        }
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
                try {
                    total += Double.parseDouble(val.toString().replaceAll("[^\\d.\\-]", ""));
                } catch (NumberFormatException ignored) {}
            }
        }
        return total;
    }

    private Map<String, Object> filterInternalKeys(Map<String, Object> data) {
        Map<String, Object> filtered = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : data.entrySet()) {
            if (!entry.getKey().startsWith("__")) {
                filtered.put(entry.getKey(), entry.getValue());
            }
        }
        return filtered;
    }

    /**
     * 공급업체/코스트센터 집계
     */
    private AggResult aggregate(List<Map<String, Object>> rows,
                                String supplierColumn, String costCenterColumn, String amountColumn) {
        Map<String, long[]> ccMap = new LinkedHashMap<>();
        Map<String, long[]> supMap = new LinkedHashMap<>();

        for (Map<String, Object> row : rows) {
            double money = 0.0;
            Object amountVal = row.get(amountColumn);
            if (amountVal instanceof Number) {
                money = ((Number) amountVal).doubleValue();
            } else if (amountVal != null) {
                try {
                    money = Double.parseDouble(amountVal.toString().replaceAll("[^\\d.\\-]", ""));
                } catch (NumberFormatException ignored) {}
            }

            // 코스트센터
            if (costCenterColumn != null && !costCenterColumn.isBlank()) {
                String cc = getStringValue(row, costCenterColumn);
                cc = (cc == null || cc.isBlank()) ? "(미지정)" : cc;
                ccMap.computeIfAbsent(cc, k -> new long[2]);
                ccMap.get(cc)[0]++;
                ccMap.get(cc)[1] += Math.round(money);
            }

            // 공급업체
            if (supplierColumn != null && !supplierColumn.isBlank()) {
                String sup = getStringValue(row, supplierColumn);
                sup = (sup == null || sup.isBlank()) ? "(미지정)" : sup;
                supMap.computeIfAbsent(sup, k -> new long[2]);
                supMap.get(sup)[0]++;
                supMap.get(sup)[1] += Math.round(money);
            }
        }

        AggResult result = new AggResult();
        result.ccMap = ccMap;
        result.supMap = supMap;
        return result;
    }

    private void mergeMaps(Map<String, long[]> target, Map<String, long[]> source) {
        for (Map.Entry<String, long[]> entry : source.entrySet()) {
            target.computeIfAbsent(entry.getKey(), k -> new long[2]);
            target.get(entry.getKey())[0] += entry.getValue()[0];
            target.get(entry.getKey())[1] += entry.getValue()[1];
        }
    }

    private List<BreakdownItem> toBreakdownList(Map<String, long[]> map) {
        return map.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue()[1], a.getValue()[1]))
                .map(e -> BreakdownItem.builder()
                        .name(e.getKey())
                        .count((int) e.getValue()[0])
                        .totalAmount((double) e.getValue()[1])
                        .build())
                .collect(Collectors.toList());
    }

    private void invalidateCache(String projectId) {
        try {
            redisService.delete("longlist:tree:" + projectId);
            redisService.delete("shortlist:tree:" + projectId);
            log.info("캐시 무효화 완료: projectId={}", projectId);
        } catch (Exception e) {
            log.warn("캐시 무효화 실패: {}", e.getMessage());
        }
    }

    private static class AggResult {
        Map<String, long[]> ccMap = new LinkedHashMap<>();
        Map<String, long[]> supMap = new LinkedHashMap<>();
    }
}
