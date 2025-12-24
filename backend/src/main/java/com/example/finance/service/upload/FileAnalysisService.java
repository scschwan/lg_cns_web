package com.example.finance.service.upload;

import com.example.finance.dto.response.upload.AccountPartitionResponse;
import com.example.finance.exception.BusinessException;
import com.example.finance.model.session.FileSession;
import com.example.finance.model.session.UploadedFileInfo;
import com.example.finance.repository.session.FileSessionRepository;
import com.example.finance.service.common.S3Service;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 파일 분석 서비스
 *
 * Step 1: Multi File Upload - 파일 분석 및 계정 파티션 생성
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FileAnalysisService {

    private final S3Service s3Service;
    private final FileSessionRepository fileSessionRepository;

    /**
     * 파일 분석 및 계정 파티션 생성
     *
     * @param projectId 프로젝트 ID
     * @param fileIds 파일 ID 리스트
     * @return 계정 파티션 리스트
     */
    public List<AccountPartitionResponse> analyzeFilesAndCreatePartitions(
            String projectId, List<String> fileIds) {

        log.info("파일 분석 시작: projectId={}, fileIds={}", projectId, fileIds);

        // 1. 파일 정보 조회
        List<UploadedFileInfo> files = getUploadedFiles(projectId, fileIds);

        // 2. 각 파일의 계정명 추출
        Map<String, FileAccountInfo> fileAccountMap = new HashMap<>();

        for (UploadedFileInfo file : files) {
            FileAccountInfo accountInfo = extractAccountNames(file);
            fileAccountMap.put(file.getFileId(), accountInfo);
        }

        // 3. 계정명 기준으로 그룹핑
        Map<String, List<String>> accountToFilesMap = groupFilesByAccount(fileAccountMap);

        // 4. 파티션 생성
        List<AccountPartitionResponse> partitions = createPartitions(
                accountToFilesMap, fileAccountMap, files);

        log.info("파일 분석 완료: 총 {} 개 파티션 생성", partitions.size());

        return partitions;
    }

    /**
     * 업로드된 파일 정보 조회
     */
    private List<UploadedFileInfo> getUploadedFiles(String projectId, List<String> fileIds) {
        List<UploadedFileInfo> result = new ArrayList<>();

        for (String fileId : fileIds) {
            // FileSession에서 파일 정보 조회
            FileSession session = fileSessionRepository.findByUploadedFilesFileId(fileId)
                    .orElseThrow(() -> new BusinessException(
                            "FILE_NOT_FOUND", "파일을 찾을 수 없습니다: " + fileId));

            UploadedFileInfo file = session.getUploadedFiles().stream()
                    .filter(f -> f.getFileId().equals(fileId))
                    .findFirst()
                    .orElseThrow(() -> new BusinessException(
                            "FILE_NOT_FOUND", "파일을 찾을 수 없습니다: " + fileId));

            result.add(file);
        }

        return result;
    }

    /**
     * 파일에서 계정명 추출
     */
    private FileAccountInfo extractAccountNames(UploadedFileInfo file) {
        log.debug("계정명 추출 시작: fileId={}, fileName={}", file.getFileId(), file.getFileName());

        try {
            // S3에서 파일 다운로드
            byte[] fileBytes = s3Service.downloadFile(file.getS3Key());

            // Excel 파싱
            try (ByteArrayInputStream bis = new ByteArrayInputStream(fileBytes);
                 Workbook workbook = new XSSFWorkbook(bis)) {

                Sheet sheet = workbook.getSheetAt(0);

                // 헤더 행 (첫 번째 행)
                Row headerRow = sheet.getRow(0);
                if (headerRow == null) {
                    throw new BusinessException("INVALID_FILE", "헤더 행이 없습니다: " + file.getFileName());
                }

                // 계정명 컬럼 찾기 (미리 설정되었거나 자동 감지)
                String accountColumnName = file.getAccountColumnName();
                int accountColumnIndex = findColumnIndex(headerRow, accountColumnName);

                if (accountColumnIndex == -1) {
                    throw new BusinessException("COLUMN_NOT_FOUND",
                            "계정명 컬럼을 찾을 수 없습니다: " + accountColumnName);
                }

                // 계정명 고유값 추출 (최대 1000개만 샘플링)
                Set<String> accountNames = new HashSet<>();
                int maxRows = Math.min(sheet.getLastRowNum(), 1000);

                for (int i = 1; i <= maxRows; i++) {
                    Row row = sheet.getRow(i);
                    if (row == null) continue;

                    Cell cell = row.getCell(accountColumnIndex);
                    if (cell == null) continue;

                    String accountName = getCellValueAsString(cell);
                    if (accountName != null && !accountName.trim().isEmpty()) {
                        accountNames.add(accountName.trim());
                    }
                }

                log.debug("계정명 추출 완료: fileId={}, 고유 계정 수={}",
                        file.getFileId(), accountNames.size());

                return FileAccountInfo.builder()
                        .fileId(file.getFileId())
                        .fileName(file.getFileName())
                        .accountNames(new ArrayList<>(accountNames))
                        .accountColumnName(accountColumnName)
                        .build();
            }

        } catch (IOException e) {
            log.error("파일 파싱 실패: fileId={}, error={}", file.getFileId(), e.getMessage(), e);
            throw new BusinessException("FILE_PARSE_ERROR", "파일 파싱 실패: " + e.getMessage());
        }
    }

    /**
     * 컬럼 인덱스 찾기
     */
    private int findColumnIndex(Row headerRow, String columnName) {
        if (columnName == null) {
            return -1;
        }

        for (int i = 0; i < headerRow.getLastCellNum(); i++) {
            Cell cell = headerRow.getCell(i);
            if (cell != null) {
                String cellValue = getCellValueAsString(cell);
                if (columnName.equals(cellValue)) {
                    return i;
                }
            }
        }

        return -1;
    }

    /**
     * Cell 값을 String으로 변환
     */
    private String getCellValueAsString(Cell cell) {
        if (cell == null) {
            return null;
        }

        switch (cell.getCellType()) {
            case STRING:
                return cell.getStringCellValue();
            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) {
                    return cell.getLocalDateTimeCellValue().toString();
                } else {
                    return String.valueOf((long) cell.getNumericCellValue());
                }
            case BOOLEAN:
                return String.valueOf(cell.getBooleanCellValue());
            case FORMULA:
                return cell.getCellFormula();
            default:
                return null;
        }
    }

    /**
     * 계정명 기준으로 파일 그룹핑
     */
    private Map<String, List<String>> groupFilesByAccount(
            Map<String, FileAccountInfo> fileAccountMap) {

        Map<String, List<String>> result = new HashMap<>();

        for (FileAccountInfo info : fileAccountMap.values()) {
            for (String accountName : info.getAccountNames()) {
                result.computeIfAbsent(accountName, k -> new ArrayList<>())
                        .add(info.getFileId());
            }
        }

        return result;
    }

    /**
     * 파티션 생성
     */
    private List<AccountPartitionResponse> createPartitions(
            Map<String, List<String>> accountToFilesMap,
            Map<String, FileAccountInfo> fileAccountMap,
            List<UploadedFileInfo> allFiles) {

        List<AccountPartitionResponse> partitions = new ArrayList<>();

        for (Map.Entry<String, List<String>> entry : accountToFilesMap.entrySet()) {
            String accountName = entry.getKey();
            List<String> fileIds = entry.getValue();

            // 파일 개수
            int fileCount = fileIds.size();

            // 총 행 개수 (파일 정보에서 합산)
            long totalRows = fileIds.stream()
                    .map(fileId -> allFiles.stream()
                            .filter(f -> f.getFileId().equals(fileId))
                            .findFirst()
                            .orElse(null))
                    .filter(Objects::nonNull)
                    .mapToLong(f -> f.getRowCount() != null ? f.getRowCount() : 0L)
                    .sum();

            // 세션명 생성 (계정명 기반)
            String sessionName = String.format("%s (%d개 파일)", accountName, fileCount);

            AccountPartitionResponse partition = AccountPartitionResponse.builder()
                    .accountName(accountName)
                    .sessionName(sessionName)
                    .workerName(null) // 사용자가 입력
                    .fileIds(fileIds)
                    .fileCount(fileCount)
                    .totalRows(totalRows)
                    .totalAmount(0.0) // 나중에 계산
                    .build();

            partitions.add(partition);
        }

        // 파일 개수 내림차순 정렬
        partitions.sort((a, b) -> Integer.compare(b.getFileCount(), a.getFileCount()));

        return partitions;
    }

    /**
     * 파일별 계정 정보
     */
    @lombok.Data
    @lombok.Builder
    private static class FileAccountInfo {
        private String fileId;
        private String fileName;
        private List<String> accountNames;
        private String accountColumnName;
    }
}