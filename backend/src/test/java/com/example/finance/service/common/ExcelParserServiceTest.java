package com.example.finance.service.common;

import com.example.finance.model.data.RawDataDocument;
import com.example.finance.model.upload.UploadSession;
import com.example.finance.repository.data.RawDataRepository;
import com.example.finance.repository.upload.UploadSessionRepository;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * ExcelParserService 단위 테스트
 * - parseExcel 플로우: UploadSession 조회 → 파일 다운로드 → 파싱 → 저장 → 상태 업데이트
 * - Mockito를 사용해 S3, Redis, MongoDB 의존성 Mocking
 */
@DisplayName("ExcelParserService 단위 테스트")
@ExtendWith(MockitoExtension.class)
class ExcelParserServiceTest {

    @Mock
    private software.amazon.awssdk.services.s3.S3Client s3Client;

    @Mock
    private RawDataRepository rawDataRepository;

    @Mock
    private UploadSessionRepository uploadSessionRepository;

    @Mock
    private RedisService redisService;

    @Mock
    private S3Service s3Service;

    @InjectMocks
    private ExcelParserService excelParserService;

    private static final String TEST_UPLOAD_ID = "test-upload-id-001";
    private static final String TEST_PROJECT_ID = "test-project-id-001";
    private static final String TEST_SESSION_ID = "test-session-id-001";

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(excelParserService, "excelBucket", "test-bucket");
    }

    /**
     * 테스트용 임시 엑셀 파일 생성 (헤더 + 3개 데이터 행)
     */
    private File createTempExcelFile() throws IOException {
        File tempFile = Files.createTempFile("test_excel_", ".xlsx").toFile();
        tempFile.deleteOnExit();

        try (Workbook workbook = new XSSFWorkbook();
             FileOutputStream fos = new FileOutputStream(tempFile)) {

            Sheet sheet = workbook.createSheet("Sheet1");

            // 헤더 행
            Row headerRow = sheet.createRow(0);
            headerRow.createCell(0).setCellValue("계정코드");
            headerRow.createCell(1).setCellValue("계정명");
            headerRow.createCell(2).setCellValue("금액");

            // 데이터 행 1
            Row row1 = sheet.createRow(1);
            row1.createCell(0).setCellValue("1001");
            row1.createCell(1).setCellValue("현금");
            row1.createCell(2).setCellValue(100000.0);

            // 데이터 행 2
            Row row2 = sheet.createRow(2);
            row2.createCell(0).setCellValue("1002");
            row2.createCell(1).setCellValue("예금");
            row2.createCell(2).setCellValue(200000.0);

            // 데이터 행 3
            Row row3 = sheet.createRow(3);
            row3.createCell(0).setCellValue("1003");
            row3.createCell(1).setCellValue("현금");
            row3.createCell(2).setCellValue(50000.0);

            workbook.write(fos);
        }

        return tempFile;
    }

    /**
     * 테스트용 UploadSession 생성
     */
    private UploadSession createTestUploadSession() {
        return UploadSession.builder()
                .id("mongo-id-001")
                .uploadId(TEST_UPLOAD_ID)
                .projectId(TEST_PROJECT_ID)
                .sessionId(TEST_SESSION_ID)
                .s3Key("uploads/" + TEST_PROJECT_ID + "/" + TEST_UPLOAD_ID + "/test.xlsx")
                .fileName("test.xlsx")
                .fileSize(1024L)
                .status(UploadSession.UploadStatus.PENDING)
                .progress(0)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
    }

    @Test
    @DisplayName("parseExcel: 정상 플로우 - 파싱 완료 및 상태 COMPLETED 업데이트")
    void parseExcel_success_completesWithCorrectStatus() throws IOException {
        // given
        UploadSession session = createTestUploadSession();
        File tempExcelFile = createTempExcelFile();

        when(uploadSessionRepository.findByUploadId(TEST_UPLOAD_ID))
                .thenReturn(Optional.of(session));
        when(s3Service.downloadFileToTemp(anyString()))
                .thenReturn(tempExcelFile);
        when(uploadSessionRepository.save(any(UploadSession.class)))
                .thenReturn(session);
        when(rawDataRepository.saveAll(anyList()))
                .thenReturn(List.of());
        doNothing().when(redisService).hSet(anyString(), anyString(), any());

        // when
        excelParserService.parseExcel(TEST_UPLOAD_ID);

        // then
        assertEquals(UploadSession.UploadStatus.COMPLETED, session.getStatus(),
                "파싱 완료 후 상태는 COMPLETED여야 합니다");
        assertEquals(100, session.getProgress(),
                "파싱 완료 후 진행률은 100%여야 합니다");
        assertEquals(3, session.getTotalRows(),
                "총 행 수는 3(헤더 제외)이어야 합니다");
        assertNotNull(session.getCompletedAt(),
                "completedAt이 설정되어야 합니다");

        // 검증: rawDataRepository.saveAll 호출됨
        verify(rawDataRepository, atLeastOnce()).saveAll(anyList());
        // 검증: Redis 상태 업데이트 호출됨
        verify(redisService, atLeastOnce()).hSet(contains("upload:status:"), eq("status"), any());
    }

    @Test
    @DisplayName("parseExcel: UploadSession 미존재 시 RuntimeException 발생")
    void parseExcel_sessionNotFound_throwsRuntimeException() {
        // given
        when(uploadSessionRepository.findByUploadId(TEST_UPLOAD_ID))
                .thenReturn(Optional.empty());

        // when & then
        RuntimeException exception = assertThrows(RuntimeException.class,
                () -> excelParserService.parseExcel(TEST_UPLOAD_ID));

        assertTrue(exception.getMessage().contains("Upload session not found"),
                "세션 미존재 시 'Upload session not found' 메시지를 포함해야 합니다");
        verify(s3Service, never()).downloadFileToTemp(anyString());
    }

    @Test
    @DisplayName("parseExcel: S3 다운로드 실패 시 상태 FAILED 업데이트 및 예외 발생")
    void parseExcel_s3DownloadFails_setsFailedStatusAndThrows() {
        // given
        UploadSession session = createTestUploadSession();

        when(uploadSessionRepository.findByUploadId(TEST_UPLOAD_ID))
                .thenReturn(Optional.of(session));
        when(s3Service.downloadFileToTemp(anyString()))
                .thenThrow(new RuntimeException("S3 연결 오류"));
        when(uploadSessionRepository.save(any(UploadSession.class)))
                .thenReturn(session);
        doNothing().when(redisService).hSet(anyString(), anyString(), any());

        // when & then
        RuntimeException exception = assertThrows(RuntimeException.class,
                () -> excelParserService.parseExcel(TEST_UPLOAD_ID));

        assertEquals(UploadSession.UploadStatus.FAILED, session.getStatus(),
                "S3 오류 시 상태는 FAILED여야 합니다");
        assertNotNull(session.getErrorMessage(),
                "에러 메시지가 설정되어야 합니다");

        // Redis에 FAILED 상태 업데이트 호출 확인
        verify(redisService).hSet(contains("upload:status:"), eq("status"), eq("FAILED"));
    }

    @Test
    @DisplayName("parseExcel: Redis 키 형식이 'upload:status:{uploadId}'로 통일")
    void parseExcel_redisKeyFormat_isCorrect() throws IOException {
        // given
        UploadSession session = createTestUploadSession();
        File tempExcelFile = createTempExcelFile();

        when(uploadSessionRepository.findByUploadId(TEST_UPLOAD_ID))
                .thenReturn(Optional.of(session));
        when(s3Service.downloadFileToTemp(anyString()))
                .thenReturn(tempExcelFile);
        when(uploadSessionRepository.save(any(UploadSession.class)))
                .thenReturn(session);
        when(rawDataRepository.saveAll(anyList()))
                .thenReturn(List.of());
        doNothing().when(redisService).hSet(anyString(), anyString(), any());

        // when
        excelParserService.parseExcel(TEST_UPLOAD_ID);

        // then: Redis 키가 "upload:status:{uploadId}" 형식인지 확인
        String expectedRedisKey = "upload:status:" + TEST_UPLOAD_ID;
        verify(redisService, atLeastOnce()).hSet(eq(expectedRedisKey), anyString(), any());
    }

    @Test
    @DisplayName("parseExcel: BATCH_SIZE(5000) 단위 배치 처리 - saveAll 호출 횟수 검증")
    void parseExcel_batchProcessing_smallData_oneBatch() throws IOException {
        // given: 3개 행은 배치 1번으로 처리됨
        UploadSession session = createTestUploadSession();
        File tempExcelFile = createTempExcelFile();

        when(uploadSessionRepository.findByUploadId(TEST_UPLOAD_ID))
                .thenReturn(Optional.of(session));
        when(s3Service.downloadFileToTemp(anyString()))
                .thenReturn(tempExcelFile);
        when(uploadSessionRepository.save(any(UploadSession.class)))
                .thenReturn(session);
        when(rawDataRepository.saveAll(anyList()))
                .thenReturn(List.of());
        doNothing().when(redisService).hSet(anyString(), anyString(), any());

        // when
        excelParserService.parseExcel(TEST_UPLOAD_ID);

        // then: 3개 데이터는 배치 임계값(5000)보다 작으므로 마지막 flush에서 1번만 saveAll 호출
        verify(rawDataRepository, times(1)).saveAll(anyList());
    }
}
