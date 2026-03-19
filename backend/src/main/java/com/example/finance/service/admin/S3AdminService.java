package com.example.finance.service.admin;

import com.example.finance.model.session.FileSession;
import com.example.finance.model.session.UploadedFileInfo;
import com.example.finance.repository.session.FileSessionRepository;
import com.example.finance.service.common.S3Service;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

import java.util.*;
import java.util.stream.Collectors;

/**
 * S3 관리자 서비스
 *
 * 관리자용 S3 파일 관리 기능을 제공한다.
 * 전체 파일 목록 조회, 고아 파일(세션 미연결 파일) 탐색,
 * 파일 삭제 및 고아 파일 일괄 정리 기능을 포함한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class S3AdminService {

    private final S3Client s3Client;
    private final S3Service s3Service;
    private final FileSessionRepository fileSessionRepository;

    @Value("${aws.s3.excel-bucket}")
    private String excelBucket;

    /**
     * S3 버킷 내 전체 파일 목록 조회
     *
     * @return 파일 키, 크기, 마지막 수정 시간이 포함된 파일 목록
     */
    public List<Map<String, Object>> listAllFiles() {
        List<Map<String, Object>> files = new ArrayList<>();

        try {
            ListObjectsV2Request request = ListObjectsV2Request.builder()
                    .bucket(excelBucket)
                    .build();

            ListObjectsV2Response response;
            do {
                response = s3Client.listObjectsV2(request);
                for (S3Object obj : response.contents()) {
                    Map<String, Object> file = new LinkedHashMap<>();
                    file.put("key", obj.key());
                    file.put("size", obj.size());
                    file.put("lastModified", obj.lastModified() != null ? obj.lastModified().toString() : null);
                    files.add(file);
                }
                request = request.toBuilder()
                        .continuationToken(response.nextContinuationToken())
                        .build();
            } while (Boolean.TRUE.equals(response.isTruncated()));
        } catch (Exception e) {
            log.error("S3 파일 목록 조회 실패", e);
        }

        return files;
    }

    /**
     * 고아 파일 탐색 (세션에 연결되지 않은 S3 파일)
     *
     * @return 고아 파일 목록
     */
    public List<Map<String, Object>> findOrphanedFiles() {
        List<Map<String, Object>> allFiles = listAllFiles();

        // 모든 세션에서 등록된 S3 키 수집 (uploadedFiles + exportPath)
        List<FileSession> allSessions = fileSessionRepository.findAll();
        Set<String> registeredKeys = allSessions.stream()
                .filter(s -> s.getUploadedFiles() != null)
                .flatMap(s -> s.getUploadedFiles().stream())
                .map(UploadedFileInfo::getS3Key)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        // export_path에 등록된 파일도 등록됨으로 처리
        allSessions.stream()
                .map(FileSession::getExportPath)
                .filter(Objects::nonNull)
                .filter(p -> !p.isBlank())
                .forEach(registeredKeys::add);

        return allFiles.stream()
                .filter(f -> !registeredKeys.contains(f.get("key")))
                .collect(Collectors.toList());
    }

    /**
     * S3 파일 일괄 삭제
     *
     * @param s3Keys 삭제할 S3 키 목록
     * @return 삭제 성공한 파일 수
     */
    public int deleteFiles(List<String> s3Keys) {
        int deleted = 0;
        for (String key : s3Keys) {
            try {
                s3Service.deleteFile(key);
                deleted++;
            } catch (Exception e) {
                log.warn("S3 파일 삭제 실패: key={}", key, e);
            }
        }
        return deleted;
    }

    /**
     * 고아 파일 일괄 정리 (세션 미연결 파일 자동 탐색 후 삭제)
     *
     * @return 삭제된 고아 파일 수
     */
    public int cleanupOrphaned() {
        List<Map<String, Object>> orphaned = findOrphanedFiles();
        List<String> keys = orphaned.stream()
                .map(f -> (String) f.get("key"))
                .collect(Collectors.toList());
        return deleteFiles(keys);
    }
}
