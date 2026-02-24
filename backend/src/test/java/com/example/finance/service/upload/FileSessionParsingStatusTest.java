package com.example.finance.service.upload;

import com.example.finance.model.session.FileSession;
import com.example.finance.model.session.UploadedFileInfo;
import com.example.finance.repository.data.*;
import com.example.finance.repository.project.ProjectRepository;
import com.example.finance.repository.session.FileSessionRepository;
import com.example.finance.repository.upload.UploadSessionRepository;
import com.example.finance.service.common.S3Service;
import com.example.finance.service.data.SessionDataService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.sqs.SqsClient;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * FileSessionService.getSessionParsingStatus() 단위 테스트
 *
 * 신규 추가된 세션 파싱 진행 상태 집계 로직 검증:
 * - 세션 미존재 → NOT_STARTED 반환
 * - 전체 파일 완료 → COMPLETED, progress=100
 * - 일부 파일 실패 → FAILED
 * - 처리 중 → PROCESSING + 정확한 진행률 계산 (최대 99%)
 * - Redis 키 형식: upload:status:{uploadId}
 */
@DisplayName("FileSessionService - getSessionParsingStatus 단위 테스트")
@ExtendWith(MockitoExtension.class)
class FileSessionParsingStatusTest {

    @Mock private FileSessionRepository fileSessionRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private UploadSessionRepository uploadSessionRepository;
    @Mock private RawDataRepository rawDataRepository;
    @Mock private ProcessDataRepository processDataRepository;
    @Mock private ClusteringResultRepository clusteringResultRepository;
    @Mock private PreprocessingConfigRepository preprocessingConfigRepository;
    @Mock private ProcessViewDataRepository processViewDataRepository;
    @Mock private SessionDataRepository sessionDataRepository;
    @Mock private SessionDataService sessionDataService;
    @Mock private SearchKeywordHierarchyRepository searchKeywordHierarchyRepository;
    @Mock private S3Service s3Service;
    @Mock private MongoTemplate mongoTemplate;
    @Mock private ObjectMapper objectMapper;
    @Mock private SqsClient sqsClient;
    @Mock private StringRedisTemplate redisTemplate;
    @Mock private S3Presigner s3Presigner;
    @Mock private HashOperations<String, Object, Object> hashOps;

    @InjectMocks
    private FileSessionService fileSessionService;

    private static final String TEST_SESSION_ID = "session-test-001";

    @BeforeEach
    void setUp() {
        lenient().when(redisTemplate.opsForHash()).thenReturn(hashOps);
    }

    // ========== 세션 미존재 케이스 ==========

    @Test
    @DisplayName("세션이 존재하지 않으면 NOT_STARTED 상태를 반환한다")
    void getSessionParsingStatus_sessionNotFound_returnsNotStarted() {
        when(fileSessionRepository.findBySessionId(TEST_SESSION_ID))
                .thenReturn(Optional.empty());

        Map<String, Object> result = fileSessionService.getSessionParsingStatus(TEST_SESSION_ID);

        assertEquals(TEST_SESSION_ID, result.get("sessionId"));
        assertEquals("NOT_STARTED", result.get("status"));
        assertEquals(0, result.get("progress"));
        assertEquals(0L, result.get("totalRows"));
        assertEquals(0L, result.get("processedRows"));
        assertTrue(((List<?>) result.get("fileStatuses")).isEmpty());
    }

    @Test
    @DisplayName("세션에 업로드 파일이 없으면 NOT_STARTED 상태를 반환한다")
    void getSessionParsingStatus_noFiles_returnsNotStarted() {
        FileSession session = createSession(new ArrayList<>());
        when(fileSessionRepository.findBySessionId(TEST_SESSION_ID))
                .thenReturn(Optional.of(session));

        Map<String, Object> result = fileSessionService.getSessionParsingStatus(TEST_SESSION_ID);

        assertEquals("NOT_STARTED", result.get("status"));
    }

    // ========== 전체 완료 케이스 ==========

    @Test
    @DisplayName("모든 파일이 COMPLETED이면 overallStatus=COMPLETED, progress=100")
    void getSessionParsingStatus_allCompleted_returnsCompleted() {
        List<UploadedFileInfo> files = List.of(
                createFileInfo("file-001", "uploads/proj/session/upload-a1b2/file1.xlsx"),
                createFileInfo("file-002", "uploads/proj/session/upload-c3d4/file2.xlsx")
        );
        FileSession session = createSession(files);
        when(fileSessionRepository.findBySessionId(TEST_SESSION_ID))
                .thenReturn(Optional.of(session));

        mockRedisStatus("upload:status:upload-a1b2", "COMPLETED", 1000L, 1000L, 100);
        mockRedisStatus("upload:status:upload-c3d4", "COMPLETED", 2000L, 2000L, 100);

        Map<String, Object> result = fileSessionService.getSessionParsingStatus(TEST_SESSION_ID);

        assertEquals("COMPLETED", result.get("status"));
        assertEquals(100, result.get("progress"));
        assertEquals(3000L, result.get("totalRows"));
        assertEquals(3000L, result.get("processedRows"));
        assertEquals(2, result.get("totalFiles"));
        assertEquals(2, result.get("completedFiles"));
        assertEquals(0, result.get("failedFiles"));
    }

    // ========== FAILED 케이스 ==========

    @Test
    @DisplayName("일부 파일이 FAILED이고 나머지도 완료된 경우 overallStatus=FAILED")
    void getSessionParsingStatus_someFilesFailed_returnsFailed() {
        List<UploadedFileInfo> files = List.of(
                createFileInfo("file-001", "uploads/proj/session/upload-a1b2/file1.xlsx"),
                createFileInfo("file-002", "uploads/proj/session/upload-c3d4/file2.xlsx")
        );
        FileSession session = createSession(files);
        when(fileSessionRepository.findBySessionId(TEST_SESSION_ID))
                .thenReturn(Optional.of(session));

        mockRedisStatus("upload:status:upload-a1b2", "COMPLETED", 1000L, 1000L, 100);
        mockRedisStatus("upload:status:upload-c3d4", "FAILED", 2000L, 500L, 25);

        Map<String, Object> result = fileSessionService.getSessionParsingStatus(TEST_SESSION_ID);

        assertEquals("FAILED", result.get("status"));
        assertEquals(1, result.get("failedFiles"));
        assertEquals(1, result.get("completedFiles"));
    }

    // ========== PROCESSING 케이스 ==========

    @Test
    @DisplayName("처리 중인 파일이 있으면 PROCESSING 상태와 진행률을 반환한다")
    void getSessionParsingStatus_processing_returnsCorrectProgress() {
        List<UploadedFileInfo> files = List.of(
                createFileInfo("file-001", "uploads/proj/session/upload-a1b2/file1.xlsx"),
                createFileInfo("file-002", "uploads/proj/session/upload-c3d4/file2.xlsx")
        );
        FileSession session = createSession(files);
        when(fileSessionRepository.findBySessionId(TEST_SESSION_ID))
                .thenReturn(Optional.of(session));

        // file1: COMPLETED (1000/1000), file2: PROCESSING (3000/10000)
        mockRedisStatus("upload:status:upload-a1b2", "COMPLETED", 1000L, 1000L, 100);
        mockRedisStatus("upload:status:upload-c3d4", "PROCESSING", 10000L, 3000L, 30);

        Map<String, Object> result = fileSessionService.getSessionParsingStatus(TEST_SESSION_ID);

        assertEquals("PROCESSING", result.get("status"));

        // 전체 진행률: min((1000+3000)/(1000+10000)*100, 99) ≈ min(36, 99) = 36
        int progress = (int) result.get("progress");
        assertTrue(progress >= 30 && progress <= 99,
                "진행률은 30~99 사이여야 합니다. 실제: " + progress);

        assertEquals(11000L, result.get("totalRows"));
        assertEquals(4000L, result.get("processedRows"));
        assertEquals(1, result.get("completedFiles"));
        assertEquals(0, result.get("failedFiles"));
    }

    @Test
    @DisplayName("처리 중 진행률은 99를 초과하지 않는다")
    void getSessionParsingStatus_processing_progressNeverExceeds99() {
        List<UploadedFileInfo> files = List.of(
                createFileInfo("file-001", "uploads/proj/session/upload-a1b2/file1.xlsx")
        );
        FileSession session = createSession(files);
        when(fileSessionRepository.findBySessionId(TEST_SESSION_ID))
                .thenReturn(Optional.of(session));

        // processedRows가 totalRows와 거의 같지만 아직 PROCESSING
        mockRedisStatus("upload:status:upload-a1b2", "PROCESSING", 1000L, 999L, 99);

        Map<String, Object> result = fileSessionService.getSessionParsingStatus(TEST_SESSION_ID);

        assertEquals("PROCESSING", result.get("status"));
        int progress = (int) result.get("progress");
        assertTrue(progress <= 99,
                "PROCESSING 상태에서 진행률은 99를 초과하면 안 됩니다. 실제: " + progress);
    }

    // ========== fileStatuses 세부 정보 검증 ==========

    @Test
    @DisplayName("fileStatuses에 각 파일의 상세 정보가 포함된다")
    void getSessionParsingStatus_fileStatuses_containsCorrectInfo() {
        List<UploadedFileInfo> files = List.of(
                createFileInfo("file-001", "uploads/proj/session/upload-a1b2/file1.xlsx")
        );
        FileSession session = createSession(files);
        when(fileSessionRepository.findBySessionId(TEST_SESSION_ID))
                .thenReturn(Optional.of(session));

        mockRedisStatus("upload:status:upload-a1b2", "PROCESSING", 5000L, 2500L, 50);

        Map<String, Object> result = fileSessionService.getSessionParsingStatus(TEST_SESSION_ID);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> fileStatuses = (List<Map<String, Object>>) result.get("fileStatuses");
        assertNotNull(fileStatuses);
        assertEquals(1, fileStatuses.size());

        Map<String, Object> fileStatus = fileStatuses.get(0);
        assertEquals("file-001", fileStatus.get("fileId"));
        assertEquals("PROCESSING", fileStatus.get("status"));
        assertEquals(5000L, fileStatus.get("totalRows"));
        assertEquals(2500L, fileStatus.get("processedRows"));
        assertEquals(50, fileStatus.get("progress"));
    }

    @Test
    @DisplayName("Redis에 데이터가 없는 파일은 UNKNOWN 상태로 표시된다")
    void getSessionParsingStatus_noRedisData_fileStatusIsUnknown() {
        List<UploadedFileInfo> files = List.of(
                createFileInfo("file-001", "uploads/proj/session/upload-a1b2/file1.xlsx")
        );
        FileSession session = createSession(files);
        when(fileSessionRepository.findBySessionId(TEST_SESSION_ID))
                .thenReturn(Optional.of(session));

        when(hashOps.entries("upload:status:upload-a1b2"))
                .thenReturn(new HashMap<>());

        Map<String, Object> result = fileSessionService.getSessionParsingStatus(TEST_SESSION_ID);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> fileStatuses = (List<Map<String, Object>>) result.get("fileStatuses");
        assertEquals("UNKNOWN", fileStatuses.get(0).get("status"));
    }

    // ========== Redis 키 형식 검증 ==========

    @Test
    @DisplayName("Redis 조회 시 'upload:status:{uploadId}' 키 형식을 사용한다")
    void getSessionParsingStatus_usesCorrectRedisKeyFormat() {
        List<UploadedFileInfo> files = List.of(
                createFileInfo("file-001", "uploads/proj/session/upload-abc123/finance.xlsx")
        );
        FileSession session = createSession(files);
        when(fileSessionRepository.findBySessionId(TEST_SESSION_ID))
                .thenReturn(Optional.of(session));

        mockRedisStatus("upload:status:upload-abc123", "COMPLETED", 100L, 100L, 100);

        fileSessionService.getSessionParsingStatus(TEST_SESSION_ID);

        // Lambda Worker와 동일한 키 형식으로 조회되어야 함
        verify(hashOps).entries("upload:status:upload-abc123");
    }

    // ========== 헬퍼 메서드 ==========

    private FileSession createSession(List<UploadedFileInfo> files) {
        FileSession session = new FileSession();
        ReflectionTestUtils.setField(session, "sessionId", TEST_SESSION_ID);
        ReflectionTestUtils.setField(session, "uploadedFiles", files);
        return session;
    }

    private UploadedFileInfo createFileInfo(String fileId, String s3Key) {
        UploadedFileInfo info = new UploadedFileInfo();
        ReflectionTestUtils.setField(info, "fileId", fileId);
        ReflectionTestUtils.setField(info, "fileName", fileId + ".xlsx");
        ReflectionTestUtils.setField(info, "s3Key", s3Key);
        return info;
    }

    private void mockRedisStatus(String key, String status, long totalRows, long processedRows, int progress) {
        Map<Object, Object> redisData = new HashMap<>();
        redisData.put("status", status);
        redisData.put("totalRows", String.valueOf(totalRows));
        redisData.put("processedRows", String.valueOf(processedRows));
        redisData.put("progress", String.valueOf(progress));
        when(hashOps.entries(key)).thenReturn(redisData);
    }
}
