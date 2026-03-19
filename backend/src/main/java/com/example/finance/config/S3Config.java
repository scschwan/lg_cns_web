package com.example.finance.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.sqs.SqsClient;

/**
 * AWS SDK 클라이언트 설정 클래스
 *
 * <p>S3(파일 업로드/다운로드), S3 Presigner(사전 서명 URL 생성),
 * SQS(메시지 큐) 클라이언트를 빈으로 등록한다.</p>
 *
 * <p>모든 클라이언트는 @Lazy로 설정되어 실제 사용 시점에 초기화되며,
 * AWS 기본 자격 증명 체인(환경 변수, IAM 역할 등)을 사용한다.</p>
 */
@Configuration
public class S3Config {

    /** AWS 리전 (기본: ap-northeast-2, 서울 리전) */
    @Value("${aws.region}")
    private String region;

    /**
     * S3 클라이언트 빈 생성
     *
     * <p>Excel 파일 업로드/다운로드 등 S3 버킷 작업에 사용된다.</p>
     *
     * @return S3Client 인스턴스
     */
    @Bean
    @Lazy  // ← Lazy 추가: 실제 사용할 때만 초기화
    public S3Client s3Client() {
        return S3Client.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }

    /**
     * S3 사전 서명(Presigned) URL 생성기 빈
     *
     * <p>프론트엔드에서 직접 S3에 파일을 업로드/다운로드할 수 있도록
     * 임시 인증이 포함된 사전 서명 URL을 생성하는 데 사용된다.</p>
     *
     * @return S3Presigner 인스턴스
     */
    @Bean
    @Lazy  // ← Lazy 추가: 실제 사용할 때만 초기화
    public S3Presigner s3Presigner() {
        return S3Presigner.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }

    /**
     * SQS 클라이언트 빈 생성
     *
     * <p>Excel 처리, 계정 분석 등 비동기 작업을 위한 메시지 큐 클라이언트.
     * Lambda 함수와의 비동기 통신에 사용된다.</p>
     *
     * @return SqsClient 인스턴스
     */
    @Bean
    @Lazy
    public SqsClient sqsClient() {
        return SqsClient.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }
}