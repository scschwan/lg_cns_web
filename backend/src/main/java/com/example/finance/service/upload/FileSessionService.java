package com.example.finance.service;

import com.example.finance.dto.request.CreateFileSessionRequest;
import com.example.finance.dto.request.MergeSessionsRequest;
import com.example.finance.dto.request.SetFileColumnsRequest;
import com.example.finance.dto.request.UpdateFileSessionRequest;
import com.example.finance.dto.response.FileMetadataResponse;
import com.example.finance.dto.response.FileSessionResponse;
import com.example.finance.enums.ProcessStep;
import com.example.finance.exception.ProjectNotFoundException;
import com.example.finance.model.*;
import com.example.finance.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 파일 세션 서비스
 *
 * Phase 2.1: Multi File Upload & Session Management
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FileSessionService {

    private final FileSessionRepository fileSessionRepository;
    private final ProjectRepository projectRepository;
    private final UploadSessionRepository uploadSessionRepository;
    private final RawDataRepository rawDataRepository;
    private final ProcessDataRepository processDataRepository;
    private final ClusteringResultRepository clusteringResultRepository;

    /**
     * 파일 세션 생성
     *
     * @param userId 사용자 ID
     * @param request 세션 생성 요청
     * @return 생성된 세션
     */
    @Transactional
    public FileSession createFileSession(String userId, CreateFileSessionRequest request) {
        log.info("파일 세션 생성: userId={}, projectId={}, sessionName={}",
                userId, request.getProjectId(), request.getSessionName());

        // 1. 프로젝트 존재 확인
        Project project = projectRepository.findByProjectId(request.getProjectId())
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        // 2. 프로젝트 멤버 확인
        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("프로젝트에 접근할 권한이 없습니다");
        }

        // 3. 세션명 중복 확인
        if (fileSessionRepository.existsByProjectIdAndSessionNameAndIsDeletedFalse(
                request.getProjectId(), request.getSessionName())) {
            throw new RuntimeException("이미 존재하는 세션명입니다");
        }

        // 4. 선택한 파일들의 메타데이터 조회
        List<UploadSession> uploadSessions = uploadSessionRepository
                .findAllById(request.getFileIds());

        if (uploadSessions.size() != request.getFileIds().size()) {
            throw new RuntimeException("일부 파일을 찾을 수 없습니다");
        }

        // 5. UploadedFileInfo 생성
        List<UploadedFileInfo> uploadedFiles = uploadSessions.stream()
                .map(us -> UploadedFileInfo.builder()
                        .fileId(us.getId())
                        .fileName(us.getFileName())
                        .fileSize(us.getFileSize())
                        .s3Key(us.getS3Key())
                        .rowCount(us.getTotalRows() != null ? us.getTotalRows().longValue() : 0L)
                        .uploadedAt(us.getCreatedAt())
                        .detectedColumns(new ArrayList<>())  // Lambda에서 추출된 컬럼 정보
                        .accountContents(new ArrayList<>())
                        .build())
                .collect(Collectors.toList());

        // 6. 통계 계산
        long totalRowCount = uploadedFiles.stream()
                .mapToLong(UploadedFileInfo::getRowCount)
                .sum();

        // 7. FileSession 생성
        FileSession fileSession = FileSession.builder()
                .sessionId(UUID.randomUUID().toString())
                .projectId(request.getProjectId())
                .sessionName(request.getSessionName())
                .workerName(request.getWorkerName() != null ? request.getWorkerName() : "")
                .createdBy(userId)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .lastAccessedAt(LocalDateTime.now())
                .uploadedFiles(uploadedFiles)
                .totalFiles(uploadedFiles.size())
                .totalRowCount(totalRowCount)
                .totalAmount(0L)
                .currentStep(null)
                .progressPercentage(0)
                .stepHistory(new ArrayList<>())
                .isCompleted(false)
                .accountNames(new ArrayList<>())
                .accountColumnNames(new ArrayList<>())
                .isDeleted(false)
                .build();

        fileSession = fileSessionRepository.save(fileSession);

        // 8. 프로젝트 세션 수 업데이트
        project.setTotalSessions(project.getTotalSessions() + 1);
        project.setTotalFiles(project.getTotalFiles() + uploadedFiles.size());
        project.setUpdatedAt(LocalDateTime.now());
        projectRepository.save(project);

        log.info("파일 세션 생성 완료: sessionId={}", fileSession.getSessionId());

        return fileSession;
    }

    /**
     * 세션 정보 수정 (세션명, 작업자명)
     *
     * @param sessionId 세션 ID
     * @param userId 사용자 ID
     * @param request 수정 요청
     * @return 업데이트된 세션
     */
    @Transactional
    public FileSession updateFileSession(String sessionId, String userId,
                                         UpdateFileSessionRequest request) {
        log.info("세션 정보 수정: sessionId={}", sessionId);

        FileSession fileSession = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다"));

        // 권한 확인 (프로젝트 멤버인지)
        Project project = projectRepository.findByProjectId(fileSession.getProjectId())
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("세션을 수정할 권한이 없습니다");
        }

        // 수정
        if (request.getSessionName() != null) {
            fileSession.setSessionName(request.getSessionName());
        }
        if (request.getWorkerName() != null) {
            fileSession.setWorkerName(request.getWorkerName());
        }

        fileSession.setUpdatedAt(LocalDateTime.now());

        return fileSessionRepository.save(fileSession);
    }

    /**
     * 파일 컬럼 설정 (계정명, 금액 컬럼)
     *
     * @param sessionId 세션 ID
     * @param userId 사용자 ID
     * @param request 컬럼 설정 요청
     * @return 업데이트된 세션
     */
    @Transactional
    public FileSession setFileColumns(String sessionId, String userId,
                                      SetFileColumnsRequest request) {
        log.info("파일 컬럼 설정: sessionId={}, fileId={}", sessionId, request.getFileId());

        FileSession fileSession = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다"));

        // 권한 확인
        Project project = projectRepository.findByProjectId(fileSession.getProjectId())
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("세션을 수정할 권한이 없습니다");
        }

        // 파일 찾아서 컬럼 설정
        UploadedFileInfo targetFile = fileSession.getUploadedFiles().stream()
                .filter(f -> f.getFileId().equals(request.getFileId()))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("파일을 찾을 수 없습니다"));

        targetFile.setAccountColumnName(request.getAccountColumnName());
        targetFile.setAmountColumnName(request.getAmountColumnName());

        // 계정명 컬럼 목록에 추가 (중복 제거)
        if (!fileSession.getAccountColumnNames().contains(request.getAccountColumnName())) {
            fileSession.getAccountColumnNames().add(request.getAccountColumnName());
        }

        fileSession.setUpdatedAt(LocalDateTime.now());

        return fileSessionRepository.save(fileSession);
    }

    /**
     * 프로젝트 세션 목록 조회
     *
     * @param projectId 프로젝트 ID
     * @param userId 사용자 ID
     * @return 세션 목록
     */
    public List<FileSessionResponse> getProjectSessions(String projectId, String userId) {
        log.info("프로젝트 세션 목록 조회: projectId={}", projectId);

        // 권한 확인
        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("프로젝트에 접근할 권한이 없습니다");
        }

        // 세션 조회
        List<FileSession> sessions = fileSessionRepository
                .findByProjectIdAndIsDeletedFalseOrderByCreatedAtDesc(projectId);

        return sessions.stream()
                .map(this::toFileSessionResponse)
                .collect(Collectors.toList());
    }

    /**
     * 세션 상세 조회
     *
     * @param sessionId 세션 ID
     * @param userId 사용자 ID
     * @return 세션 상세
     */
    public FileSessionResponse getFileSession(String sessionId, String userId) {
        log.info("세션 상세 조회: sessionId={}", sessionId);

        FileSession fileSession = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다"));

        // 권한 확인
        Project project = projectRepository.findByProjectId(fileSession.getProjectId())
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("세션에 접근할 권한이 없습니다");
        }

        // 마지막 접근 시간 업데이트
        fileSession.setLastAccessedAt(LocalDateTime.now());
        fileSessionRepository.save(fileSession);

        return toFileSessionResponseWithDetails(fileSession);
    }

    /**
     * 세션 시작 (Step 2 진입)
     *
     * @param sessionId 세션 ID
     * @param userId 사용자 ID
     * @return 업데이트된 세션
     */
    @Transactional
    public FileSession startSession(String sessionId, String userId) {
        log.info("세션 시작: sessionId={}", sessionId);

        FileSession fileSession = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다"));

        // 권한 확인
        Project project = projectRepository.findByProjectId(fileSession.getProjectId())
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("세션을 시작할 권한이 없습니다");
        }

        // Step 2 (FileLoad) 진입
        fileSession.setCurrentStep(ProcessStep.FILE_LOAD);
        fileSession.setProgressPercentage(0);

        StepHistory stepHistory = StepHistory.builder()
                .step(ProcessStep.FILE_LOAD)
                .startedAt(LocalDateTime.now())
                .status("in_progress")
                .build();

        fileSession.getStepHistory().add(stepHistory);
        fileSession.setUpdatedAt(LocalDateTime.now());

        return fileSessionRepository.save(fileSession);
    }

    /**
     * 세션 초기화 (모든 데이터 삭제)
     *
     * @param sessionId 세션 ID
     * @param userId 사용자 ID
     */
    @Transactional
    public void resetSession(String sessionId, String userId) {
        log.info("세션 초기화: sessionId={}", sessionId);

        FileSession fileSession = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다"));

        // 권한 확인
        Project project = projectRepository.findByProjectId(fileSession.getProjectId())
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("세션을 초기화할 권한이 없습니다");
        }

        String projectId = fileSession.getProjectId();

        // 1. raw_data 삭제
        rawDataRepository.deleteByProjectIdAndSessionId(projectId, sessionId);
        log.info("raw_data 삭제 완료");

        // 2. process_data 삭제
        processDataRepository.deleteByProjectIdAndSessionId(projectId, sessionId);
        log.info("process_data 삭제 완료");

        // 3. clustering_results 삭제
        clusteringResultRepository.deleteByProjectIdAndSessionId(projectId, sessionId);
        log.info("clustering_results 삭제 완료");

        // 4. 세션 상태 초기화
        fileSession.setCurrentStep(null);
        fileSession.setProgressPercentage(0);
        fileSession.setIsCompleted(false);
        fileSession.setCompletedAt(null);
        fileSession.setExportPath(null);
        fileSession.getStepHistory().clear();
        fileSession.setUpdatedAt(LocalDateTime.now());

        fileSessionRepository.save(fileSession);

        log.info("세션 초기화 완료");
    }

    /**
     * 세션 삭제 (소프트 삭제)
     *
     * @param sessionId 세션 ID
     * @param userId 사용자 ID
     */
    @Transactional
    public void deleteSession(String sessionId, String userId) {
        log.info("세션 삭제: sessionId={}", sessionId);

        FileSession fileSession = fileSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다"));

        // 권한 확인
        Project project = projectRepository.findByProjectId(fileSession.getProjectId())
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("세션을 삭제할 권한이 없습니다");
        }

        // 소프트 삭제
        fileSession.setIsDeleted(true);
        fileSession.setUpdatedAt(LocalDateTime.now());
        fileSessionRepository.save(fileSession);

        // 프로젝트 세션 수 업데이트
        project.setTotalSessions(project.getTotalSessions() - 1);
        if (fileSession.getIsCompleted()) {
            project.setCompletedSessions(project.getCompletedSessions() - 1);
        }
        project.setUpdatedAt(LocalDateTime.now());
        projectRepository.save(project);

        log.info("세션 삭제 완료");
    }

    /**
     * 세션 병합
     *
     * @param userId 사용자 ID
     * @param request 병합 요청
     * @return 새로 생성된 병합 세션
     */
    @Transactional
    public FileSession mergeSessions(String userId, MergeSessionsRequest request) {
        log.info("세션 병합: sessionIds={}", request.getSessionIds());

        // 1. 모든 세션 조회
        List<FileSession> sessions = request.getSessionIds().stream()
                .map(sessionId -> fileSessionRepository.findBySessionId(sessionId)
                        .orElseThrow(() -> new RuntimeException("세션을 찾을 수 없습니다: " + sessionId)))
                .collect(Collectors.toList());

        // 2. 같은 프로젝트인지 확인
        String projectId = sessions.get(0).getProjectId();
        boolean sameProject = sessions.stream()
                .allMatch(s -> s.getProjectId().equals(projectId));

        if (!sameProject) {
            throw new RuntimeException("다른 프로젝트의 세션은 병합할 수 없습니다");
        }

        // 3. 권한 확인
        Project project = projectRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ProjectNotFoundException("프로젝트를 찾을 수 없습니다"));

        boolean isMember = project.getMembers().stream()
                .anyMatch(m -> m.getUserId().equals(userId));

        if (!isMember) {
            throw new RuntimeException("세션을 병합할 권한이 없습니다");
        }

        // 4. 모든 파일 정보 병합
        List<UploadedFileInfo> allFiles = sessions.stream()
                .flatMap(s -> s.getUploadedFiles().stream())
                .collect(Collectors.toList());

        // 5. 통계 계산
        long totalRowCount = allFiles.stream()
                .mapToLong(UploadedFileInfo::getRowCount)
                .sum();

        // 6. 계정명 컬럼 병합
        List<String> accountColumnNames = sessions.stream()
                .flatMap(s -> s.getAccountColumnNames().stream())
                .distinct()
                .collect(Collectors.toList());

        // 7. 새 세션 생성
        FileSession mergedSession = FileSession.builder()
                .sessionId(UUID.randomUUID().toString())
                .projectId(projectId)
                .sessionName(request.getNewSessionName())
                .workerName(request.getWorkerName() != null ? request.getWorkerName() : "")
                .createdBy(userId)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .lastAccessedAt(LocalDateTime.now())
                .uploadedFiles(allFiles)
                .totalFiles(allFiles.size())
                .totalRowCount(totalRowCount)
                .totalAmount(0L)
                .currentStep(null)
                .progressPercentage(0)
                .stepHistory(new ArrayList<>())
                .isCompleted(false)
                .accountNames(new ArrayList<>())
                .accountColumnNames(accountColumnNames)
                .isDeleted(false)
                .build();

        mergedSession = fileSessionRepository.save(mergedSession);

        log.info("세션 병합 완료: newSessionId={}", mergedSession.getSessionId());

        return mergedSession;
    }

    /**
     * FileSession → FileSessionResponse 변환 (기본)
     */
    private FileSessionResponse toFileSessionResponse(FileSession session) {
        return FileSessionResponse.builder()
                .sessionId(session.getSessionId())
                .projectId(session.getProjectId())
                .sessionName(session.getSessionName())
                .workerName(session.getWorkerName())
                .totalFiles(session.getTotalFiles())
                .totalRowCount(session.getTotalRowCount())
                .totalAmount(session.getTotalAmount())
                .currentStep(session.getCurrentStep())
                .progressPercentage(session.getProgressPercentage())
                .isCompleted(session.getIsCompleted())
                .createdAt(session.getCreatedAt())
                .updatedAt(session.getUpdatedAt())
                .lastAccessedAt(session.getLastAccessedAt())
                .completedAt(session.getCompletedAt())
                .build();
    }

    /**
     * FileSession → FileSessionResponse 변환 (상세)
     */
    private FileSessionResponse toFileSessionResponseWithDetails(FileSession session) {
        return FileSessionResponse.builder()
                .sessionId(session.getSessionId())
                .projectId(session.getProjectId())
                .sessionName(session.getSessionName())
                .workerName(session.getWorkerName())
                .totalFiles(session.getTotalFiles())
                .totalRowCount(session.getTotalRowCount())
                .totalAmount(session.getTotalAmount())
                .currentStep(session.getCurrentStep())
                .progressPercentage(session.getProgressPercentage())
                .isCompleted(session.getIsCompleted())
                .createdAt(session.getCreatedAt())
                .updatedAt(session.getUpdatedAt())
                .lastAccessedAt(session.getLastAccessedAt())
                .completedAt(session.getCompletedAt())
                .uploadedFiles(session.getUploadedFiles())
                .stepHistory(session.getStepHistory())
                .build();
    }
}