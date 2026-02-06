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

@Slf4j
@Service
@RequiredArgsConstructor
public class S3AdminService {

    private final S3Client s3Client;
    private final S3Service s3Service;
    private final FileSessionRepository fileSessionRepository;

    @Value("${aws.s3.excel-bucket}")
    private String excelBucket;

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

    public List<Map<String, Object>> findOrphanedFiles() {
        List<Map<String, Object>> allFiles = listAllFiles();

        // 모든 세션에서 등록된 S3 키 수집
        Set<String> registeredKeys = fileSessionRepository.findAll().stream()
                .filter(s -> s.getUploadedFiles() != null)
                .flatMap(s -> s.getUploadedFiles().stream())
                .map(UploadedFileInfo::getS3Key)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        return allFiles.stream()
                .filter(f -> !registeredKeys.contains(f.get("key")))
                .collect(Collectors.toList());
    }

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

    public int cleanupOrphaned() {
        List<Map<String, Object>> orphaned = findOrphanedFiles();
        List<String> keys = orphaned.stream()
                .map(f -> (String) f.get("key"))
                .collect(Collectors.toList());
        return deleteFiles(keys);
    }
}
