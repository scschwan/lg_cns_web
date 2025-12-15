# Dockerfile 내용:
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# JAR 파일 복사
COPY build/libs/*.jar app.jar

# 포트 노출
EXPOSE 8080

# Health Check
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/actuator/health || exit 1

# 실행
ENTRYPOINT ["java", "-jar", "app.jar"]