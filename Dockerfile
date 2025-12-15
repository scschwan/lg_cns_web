FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# RDS CA 인증서 다운로드
RUN apk add --no-cache wget ca-certificates && \
    wget -O /app/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem && \
    chmod 644 /app/global-bundle.pem && \
    apk del wget

# JAR 파일 복사
COPY build/libs/*.jar app.jar

EXPOSE 8080

# 애플리케이션 실행
ENTRYPOINT ["java", \
    "-Djava.security.egd=file:/dev/./urandom", \
    "-XX:+UseContainerSupport", \
    "-XX:MaxRAMPercentage=75.0", \
    "-jar", "app.jar"]