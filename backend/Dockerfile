# ===========================================================
# Finance Backend Docker 이미지 빌드 설정
# 베이스 이미지: Eclipse Temurin JRE 21 (Alpine Linux 기반, 경량)
# ===========================================================
FROM eclipse-temurin:21-jre-alpine

# curl 설치 (헬스체크용)
RUN apk add --no-cache curl

WORKDIR /app

# Gradle 빌드 결과물(JAR) 복사
COPY build/libs/*.jar app.jar

# Spring Boot 기본 포트 노출
EXPOSE 8080

# 애플리케이션 실행
# -Djava.security.egd: 난수 생성 성능 최적화 (컨테이너 환경에서 /dev/random 블로킹 방지)
# -XX:+UseContainerSupport: 컨테이너 메모리 제한을 인식하도록 설정
# -XX:MaxRAMPercentage=75.0: 컨테이너 메모리의 75%를 JVM 힙으로 사용
ENTRYPOINT ["java", \
    "-Djava.security.egd=file:/dev/./urandom", \
    "-XX:+UseContainerSupport", \
    "-XX:MaxRAMPercentage=75.0", \
    "-jar", "app.jar"]