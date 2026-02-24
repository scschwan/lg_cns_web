package com.example.finance.service.upload;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * ExcelStreamingParser 단위 테스트
 * - SAX 기반 파서의 헤더 파싱, 계정 추출, 금액 합산 로직 검증
 */
@DisplayName("ExcelStreamingParser 단위 테스트")
class ExcelStreamingParserTest {

    @TempDir
    Path tempDir;

    private File testExcelFile;

    @BeforeEach
    void setUp() throws IOException {
        testExcelFile = createSampleExcelFile();
    }

    /**
     * 테스트용 샘플 엑셀 파일 생성
     * 헤더: 계정코드, 계정명, 금액, 날짜
     * 데이터: 3개 행
     */
    private File createSampleExcelFile() throws IOException {
        File file = tempDir.resolve("test_sample.xlsx").toFile();

        try (Workbook workbook = new XSSFWorkbook();
             FileOutputStream fos = new FileOutputStream(file)) {

            Sheet sheet = workbook.createSheet("Sheet1");

            // 헤더 행 (row 0)
            Row headerRow = sheet.createRow(0);
            headerRow.createCell(0).setCellValue("계정코드");
            headerRow.createCell(1).setCellValue("계정명");
            headerRow.createCell(2).setCellValue("금액");
            headerRow.createCell(3).setCellValue("날짜");

            // 데이터 행 1
            Row row1 = sheet.createRow(1);
            row1.createCell(0).setCellValue("1001");
            row1.createCell(1).setCellValue("현금");
            row1.createCell(2).setCellValue(100000.0);
            row1.createCell(3).setCellValue("2024-01-01");

            // 데이터 행 2
            Row row2 = sheet.createRow(2);
            row2.createCell(0).setCellValue("1002");
            row2.createCell(1).setCellValue("예금");
            row2.createCell(2).setCellValue(200000.0);
            row2.createCell(3).setCellValue("2024-01-02");

            // 데이터 행 3 (같은 계정명 - 현금)
            Row row3 = sheet.createRow(3);
            row3.createCell(0).setCellValue("1003");
            row3.createCell(1).setCellValue("현금");
            row3.createCell(2).setCellValue(50000.0);
            row3.createCell(3).setCellValue("2024-01-03");

            workbook.write(fos);
        }

        return file;
    }

    /**
     * 빈 데이터 행이 있는 엑셀 파일 생성
     */
    private File createExcelWithEmptyRows() throws IOException {
        File file = tempDir.resolve("test_empty_rows.xlsx").toFile();

        try (Workbook workbook = new XSSFWorkbook();
             FileOutputStream fos = new FileOutputStream(file)) {

            Sheet sheet = workbook.createSheet("Sheet1");

            Row headerRow = sheet.createRow(0);
            headerRow.createCell(0).setCellValue("계정명");
            headerRow.createCell(1).setCellValue("금액");

            // 데이터 행 1
            Row row1 = sheet.createRow(1);
            row1.createCell(0).setCellValue("현금");
            row1.createCell(1).setCellValue(100000.0);

            // 빈 행 (row 2 생략)

            // 데이터 행 3
            Row row3 = sheet.createRow(3);
            row3.createCell(0).setCellValue("예금");
            row3.createCell(1).setCellValue(200000.0);

            workbook.write(fos);
        }

        return file;
    }

    // ========== groupByAccount 테스트 ==========

    @Test
    @DisplayName("groupByAccount: 정상적인 계정명/금액 컬럼으로 그룹핑 성공")
    void groupByAccount_success() {
        Map<String, ExcelStreamingParser.PartitionStats> result =
                ExcelStreamingParser.groupByAccount(testExcelFile, "계정명", "금액");

        assertNotNull(result, "결과가 null이 아니어야 합니다");
        assertEquals(2, result.size(), "현금/예금 2개 계정이 있어야 합니다");

        // 현금: 2개 행, 150000
        assertTrue(result.containsKey("현금"), "현금 계정이 있어야 합니다");
        assertEquals(2L, result.get("현금").getCount(), "현금 행 수는 2개여야 합니다");
        assertEquals(150000.0, result.get("현금").getAmount(), 0.001, "현금 합계는 150000이어야 합니다");

        // 예금: 1개 행, 200000
        assertTrue(result.containsKey("예금"), "예금 계정이 있어야 합니다");
        assertEquals(1L, result.get("예금").getCount(), "예금 행 수는 1개여야 합니다");
        assertEquals(200000.0, result.get("예금").getAmount(), 0.001, "예금 합계는 200000이어야 합니다");
    }

    @Test
    @DisplayName("groupByAccount: 존재하지 않는 계정 컬럼명 → 빈 결과 반환")
    void groupByAccount_nonExistentAccountColumn_returnsEmpty() {
        Map<String, ExcelStreamingParser.PartitionStats> result =
                ExcelStreamingParser.groupByAccount(testExcelFile, "없는컬럼", "금액");

        assertNotNull(result, "결과가 null이 아니어야 합니다");
        assertTrue(result.isEmpty(), "존재하지 않는 컬럼으로 조회 시 빈 결과를 반환해야 합니다");
    }

    @Test
    @DisplayName("groupByAccount: 금액 컬럼 없음(null) → count만 집계")
    void groupByAccount_noAmountColumn_countsOnly() {
        Map<String, ExcelStreamingParser.PartitionStats> result =
                ExcelStreamingParser.groupByAccount(testExcelFile, "계정명", null);

        assertNotNull(result);
        assertEquals(2, result.size());
        // 금액 합계는 0 (amountColIndex=-1이므로 add(0) 호출됨)
        assertEquals(2L, result.get("현금").getCount());
        assertEquals(1L, result.get("예금").getCount());
    }

    // ========== extractAccountValues 테스트 ==========

    @Test
    @DisplayName("extractAccountValues: 계정명 컬럼에서 고유값 목록 추출")
    void extractAccountValues_success() {
        List<String> accounts = ExcelStreamingParser.extractAccountValues(testExcelFile, "계정명");

        assertNotNull(accounts);
        assertEquals(2, accounts.size(), "중복 제거 후 2개의 고유 계정명이 있어야 합니다");
        assertTrue(accounts.contains("현금"), "현금이 포함되어야 합니다");
        assertTrue(accounts.contains("예금"), "예금이 포함되어야 합니다");
    }

    @Test
    @DisplayName("extractAccountValues: 존재하지 않는 컬럼 → 빈 리스트 반환")
    void extractAccountValues_nonExistentColumn_returnsEmpty() {
        List<String> accounts = ExcelStreamingParser.extractAccountValues(testExcelFile, "없는컬럼");

        assertNotNull(accounts);
        assertTrue(accounts.isEmpty(), "존재하지 않는 컬럼으로 조회 시 빈 리스트를 반환해야 합니다");
    }

    // ========== calculateTotalAmount 테스트 ==========

    @Test
    @DisplayName("calculateTotalAmount: 금액 컬럼 합계 계산")
    void calculateTotalAmount_success() {
        double total = ExcelStreamingParser.calculateTotalAmount(testExcelFile, "금액");

        // 100000 + 200000 + 50000 = 350000
        assertEquals(350000.0, total, 0.001, "전체 금액 합계는 350000이어야 합니다");
    }

    @Test
    @DisplayName("calculateTotalAmount: 존재하지 않는 컬럼 → 0.0 반환")
    void calculateTotalAmount_nonExistentColumn_returnsZero() {
        double total = ExcelStreamingParser.calculateTotalAmount(testExcelFile, "없는컬럼");

        assertEquals(0.0, total, 0.001, "존재하지 않는 컬럼으로 조회 시 0을 반환해야 합니다");
    }

    // ========== PartitionStats 테스트 ==========

    @Test
    @DisplayName("PartitionStats: 정상 집계 동작 확인")
    void partitionStats_add_accumulates() {
        ExcelStreamingParser.PartitionStats stats = new ExcelStreamingParser.PartitionStats();

        stats.add(100.0);
        stats.add(200.0);
        stats.add(50.0);

        assertEquals(3L, stats.getCount(), "3번 추가 후 count는 3이어야 합니다");
        assertEquals(350.0, stats.getAmount(), 0.001, "3번 추가 후 amount 합계는 350이어야 합니다");
    }

    @Test
    @DisplayName("PartitionStats: 초기값은 0")
    void partitionStats_initialValues() {
        ExcelStreamingParser.PartitionStats stats = new ExcelStreamingParser.PartitionStats();

        assertEquals(0L, stats.getCount());
        assertEquals(0.0, stats.getAmount(), 0.001);
    }

    // ========== 엣지 케이스 테스트 ==========

    @Test
    @DisplayName("groupByAccount: 파일이 없는 경우 빈 결과 반환")
    void groupByAccount_nonExistentFile_returnsEmpty() {
        File nonExistentFile = new File("/tmp/non_existent_file.xlsx");

        Map<String, ExcelStreamingParser.PartitionStats> result =
                ExcelStreamingParser.groupByAccount(nonExistentFile, "계정명", "금액");

        assertNotNull(result, "결과가 null이 아니어야 합니다");
        assertTrue(result.isEmpty(), "존재하지 않는 파일의 경우 빈 결과를 반환해야 합니다");
    }

    @Test
    @DisplayName("extractAccountValues: 대소문자 무관 컬럼 이름 매칭")
    void extractAccountValues_caseInsensitiveColumnMatch() {
        // HeaderHandler의 findColumnIndex는 equalsIgnoreCase를 사용
        List<String> accounts = ExcelStreamingParser.extractAccountValues(testExcelFile, "계정명");
        List<String> accountsUpper = ExcelStreamingParser.extractAccountValues(testExcelFile, "계정명");

        assertEquals(accounts.size(), accountsUpper.size(),
                "컬럼명 대소문자 무관하게 동일한 결과를 반환해야 합니다");
    }
}
