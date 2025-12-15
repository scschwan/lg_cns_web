# Dockerfile 내용:
FROM eclipse-temurin:21-jre-alpine


# AWS RDS CA 인증서 다운로드 (DocumentDB TLS용)
WORKDIR /app

# AWS RDS CA 인증서 다운로드 및 Java Truststore에 등록
RUN apk add --no-cache wget && \
    wget -O /tmp/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem && \
    # PEM을 개별 인증서로 분리
    csplit -s -z -f /tmp/cert- /tmp/global-bundle.pem '/-----BEGIN CERTIFICATE-----/' '{*}' && \
    # 각 인증서를 Java Truststore에 추가
    for cert in /tmp/cert-*; do \
        keytool -import -trustcacerts -cacerts -storepass changeit -noprompt \
            -alias rds-ca-$(basename $cert) -file $cert || true; \
    done && \
    # 정리
    rm -rf /tmp/cert-* /tmp/global-bundle.pem && \
    apk del wget


# JAR 파일 복사
COPY build/libs/*.jar app.jar

# 포트 노출
EXPOSE 8080

# Health Check
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/actuator/health || exit 1

# 실행
ENTRYPOINT ["java", "-jar", "app.jar"]