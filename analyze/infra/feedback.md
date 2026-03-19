# Infra Agent 피드백 - 백엔드/프론트엔드 아키텍처 리뷰

> **작성일**: 2026-03-19
> **작성자**: Infra Agent
> **리뷰 대상**: Backend architecture.md, api_endpoints.md, Frontend architecture.md, page_routing.md

---

## 1. 인프라 <-> 백엔드 정합성

### 1.1 ECS Task Definition 환경 변수와 백엔드 설정

**[정합성 확인]** 🟢 Info
- ECS Task Definition의 `SPRING_PROFILES_ACTIVE=prod`와 백엔드 `application.yml`의 프로파일 구조(`local`/`prod`)가 일치한다.
- `AWS_REGION=ap-northeast-2`와 백엔드 `aws.region` 설정(ap-northeast-2)이 일치한다.

**[정합성 확인]** 🟢 Info
- ECS 환경 변수 `S3_BUCKET=finance-excel-uploads`와 백엔드 `aws.s3.excel-bucket=finance-excel-uploads`가 일치한다.
- Lambda 환경 변수의 `S3_BUCKET`, `SQS_QUEUE_URL`, `MONGODB_URI`, `REDIS_HOST/PORT` 모두 ECS Task Definition과 동일한 엔드포인트를 참조하고 있어 정합성이 확보되어 있다.

**[정합성 확인]** 🟢 Info
- ECS 환경 변수 `REDIS_HOST=finance-redis-cluster.1kdayr.0001.apn2.cache.amazonaws.com`, `REDIS_PORT=6379`와 백엔드 prod 프로파일의 Redis 설정이 일치한다.
- 백엔드에서 Redis SSL을 사용하지 않는 설정과 ElastiCache의 전송 중 암호화 비활성화 상태가 일치한다.

**[정합성 확인]** 🟢 Info
- ECS 환경 변수 `MONGODB_URI`의 DocumentDB 엔드포인트(`finance-docdb-cluster.cluster-c1ue6aayyxjn...docdb.amazonaws.com:27017`)가 실제 DocumentDB Writer Endpoint와 일치한다.
- DocumentDB TLS 비활성화(`finance-docdb-no-tls` Parameter Group)와 백엔드 MongoDB URI에 TLS 관련 파라미터가 없는 점이 일치한다.

### 1.2 SQS 큐 URL 정합성

**[정합성 확인]** 🟢 Info
- 백엔드 아키텍처에서 명시한 SQS 큐명 `finance-excel-processing-queue`와 실제 AWS SQS 자원명이 일치한다.
- Lambda 환경 변수의 `SQS_QUEUE_URL=https://sqs.ap-northeast-2.amazonaws.com/659002796326/finance-excel-processing-queue`가 실제 큐 ARN과 일치한다.

### 1.3 Lambda 트리거와 백엔드 비동기 처리 흐름

**[개선 제안]** 🟡 Warning
- 백엔드 아키텍처 문서(7.1절)에서는 ExcelCoordinator가 "S3 이벤트 (파일 업로드)"로 트리거된다고 기술하고 있으나, 인프라 아키텍처(6.3절)에서는 "SQS Trigger"로 기술하고 있다. 실제 트리거 방식이 S3 Event Notification인지 SQS Trigger인지 백엔드 팀과 명확히 확인이 필요하다. 트리거 방식에 따라 IAM 정책과 이벤트 소스 매핑 설정이 달라진다.

### 1.4 백엔드에서 언급하는 ANALYSIS_QUEUE_URL 누락

**[누락 사항]** 🟡 Warning
- 백엔드 아키텍처(6.2절)에서 `ANALYSIS_QUEUE_URL` (계정 분석 메시지용 큐)을 언급하고 있으나, 인프라 자원(SQS)에는 `finance-excel-processing-queue`와 DLQ만 존재한다. `AccountAnalysisHandler`가 별도의 SQS 큐를 사용하는지, 동일 큐를 공유하는지 확인이 필요하다. 별도 큐가 필요한 경우 SQS 자원 추가 프로비저닝이 필요하다.

### 1.5 AccountAnalysisHandler Lambda 누락

**[누락 사항]** 🔴 Critical
- 백엔드 아키텍처에서 `AccountAnalysisHandler` Lambda 함수를 명시하고 있으나(6.3절, 7.2절), 인프라 자원에는 `ExcelCoordinator`와 `ExcelWorker`만 존재한다. `AccountAnalysisHandler`에 대한 Lambda 함수가 AWS에 배포되어 있는지 확인이 필요하다. 미배포 상태라면 계정 분석 기능이 동작하지 않는다.

### 1.6 MongoDB 커넥션 풀 설정

**[개선 제안]** 🟡 Warning
- 백엔드 설정에서 MongoDB maxSize가 30으로 설정되어 있다. ECS 2 Task 구성에서 Task당 30개 커넥션이면 총 60개 커넥션이 DocumentDB에 연결된다. 여기에 Lambda 함수(ExcelCoordinator, ExcelWorker)의 동시 실행까지 고려하면 `db.r8g.large`(16GB RAM) 인스턴스의 커넥션 한도 내이지만, Lambda 동시 실행 수가 증가할 경우 커넥션 고갈 가능성이 있다. Lambda의 MongoDB 커넥션 관리 방식(커넥션 재사용 여부)을 확인하고, DocumentDB의 `max_connections` 파라미터를 모니터링할 것을 권장한다.

---

## 2. 인프라 <-> 프론트엔드 정합성

### 2.1 CloudFront Origin 설정과 API 호출 경로

**[정합성 확인]** 🟢 Info
- CloudFront Cache Behavior에서 `/api/*` 패턴이 ALB Origin(`finance-alb-1506892035.ap-northeast-2.elb.amazonaws.com`)으로 프록시되도록 설정되어 있으며, 백엔드의 모든 REST API 엔드포인트가 `/api/` 접두사를 사용하고 있어 정합성이 확보된다.
- CloudFront `/api/*` Behavior에서 모든 HTTP Method(GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE)를 허용하고 있어 백엔드 API 엔드포인트(218개)의 다양한 HTTP Method 요청을 정상 처리할 수 있다.

### 2.2 .env.production API URL 설정

**[정합성 확인]** 🟢 Info
- 프론트엔드 `.env.production`에서 `VITE_API_BASE_URL=` (빈 값)으로 설정되어 있고, 코드에서 빈 값일 때 상대 경로로 동작하여 CloudFront 동일 도메인(`d3ipfpkjg02npk.cloudfront.net`)으로 API 요청이 전달된다. CloudFront의 `/api/*` Behavior가 ALB로 프록시하므로 정상 동작한다.

**[위험 사항]** 🟡 Warning
- 프론트엔드 코드에서 `VITE_API_BASE_URL`이 빈 값일 때 `http://localhost:8080`으로 폴백하는 로직(`import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'`)이 있다. 프로덕션 빌드에서 `??` 연산자는 `null`/`undefined`에만 반응하고 빈 문자열(`""`)에는 반응하지 않으므로 실제로는 빈 문자열이 사용된다. 현재는 정상 동작하지만, 이 폴백 로직의 의도를 명확히 하고 `||` 연산자 사용 시 프로덕션에서 localhost로 요청이 발생할 수 있으므로 주의가 필요하다.

### 2.3 .env 개발 환경 API URL

**[위험 사항]** 🟡 Warning
- 프론트엔드 `.env` (개발 환경)에서 `VITE_API_BASE_URL=http://finance-alb-*.elb.amazonaws.com`으로 ALB에 직접 연결하는 설정이 되어 있다. ALB Security Group(`finance-alb-sg`)이 `0.0.0.0/0`으로 80, 443 포트를 개방하고 있어 ALB가 인터넷에서 직접 접근 가능하다. 개발 환경에서는 문제없으나, ALB를 CloudFront 뒤에서만 접근 가능하도록 제한하지 않으면 CloudFront WAF를 우회한 직접 접근이 가능하다.

### 2.4 S3 정적 호스팅과 Vite 빌드 설정

**[정합성 확인]** 🟢 Info
- Vite 빌드 출력 디렉토리가 `build`로 설정되어 있고, 배포 스크립트에서 `./build` 디렉토리를 S3(`lgcns-finance-frontend-app`)에 sync하므로 일치한다.
- 빌드 시 sourcemap이 비활성화되어 있어 프로덕션 환경에서 소스코드 노출 위험이 없다.

### 2.5 SPA 라우팅 지원

**[정합성 확인]** 🟢 Info
- CloudFront Custom Error Response에서 403/404 에러를 `/index.html`(응답 코드 200)로 리다이렉트하여 React Router의 클라이언트 사이드 라우팅을 정상 지원한다.
- 프론트엔드의 모든 라우트(`/login`, `/projects`, `/admin/*` 등)가 이 설정으로 정상 동작한다.

### 2.6 CORS 설정

**[정합성 확인]** 🟢 Info
- S3 `finance-excel-uploads` 버킷의 CORS 설정에서 `https://d3ipfpkjg02npk.cloudfront.net`과 `http://localhost:3000`을 Allowed Origins로 설정하고 있다. 프론트엔드의 Presigned URL 기반 S3 직접 업로드(PUT)가 정상 동작한다.
- 백엔드 SecurityConfig의 CORS 설정에서도 `localhost:3000`과 CloudFront 도메인을 허용하고 있어 일관성이 유지된다.

**[개선 제안]** 🟡 Warning
- 프론트엔드 개발 서버 포트가 Vite 설정에서 3000으로 설정되어 있고, CORS에서도 `localhost:3000`을 허용하고 있어 일치하지만, S3 CORS의 Allowed Methods에 `PUT, GET, HEAD`만 있고 `POST`가 없다. Presigned URL 업로드가 PUT 기반이므로 현재는 문제없으나, 향후 POST 기반 업로드(Multipart) 사용 시 CORS 오류가 발생할 수 있다.

---

## 3. 보안 관점 피드백

### 3.1 Security Group 체이닝과 서비스 포트

**[정합성 확인]** 🟢 Info
- Security Group 체이닝이 올바르게 구성되어 있다:
  - ALB SG: TCP 80/443 <- 0.0.0.0/0
  - ECS SG: TCP 8080 <- ALB SG (컨테이너 포트 8080과 일치)
  - DocumentDB SG: TCP 27017 <- ECS SG, 10.0.0.0/16 (MongoDB 기본 포트)
  - Redis SG: TCP 6379 <- ECS SG, Lambda SG, 10.0.0.0/16 (Redis 기본 포트)

**[위험 사항]** 🟡 Warning
- DocumentDB SG에서 `10.0.0.0/16` (VPC 전체 CIDR)를 소스로 허용하고 있다. Lambda SG가 명시적으로 포함되어 있지 않으나 VPC CIDR로 커버된다. 그러나 보안 모범 사례로는 VPC CIDR 대신 `finance-lambda-sg`를 명시적으로 추가하고 VPC CIDR 규칙을 제거하는 것이 바람직하다.

### 3.2 ALB 직접 접근 가능 문제

**[위험 사항]** 🔴 Critical
- ALB가 internet-facing으로 구성되어 있고 Security Group에서 `0.0.0.0/0`으로 80/443을 허용하고 있어, CloudFront를 거치지 않고 ALB DNS(`finance-alb-1506892035.ap-northeast-2.elb.amazonaws.com`)로 직접 접근이 가능하다. 이 경우 CloudFront WAF가 우회되어 보안 위협에 노출된다.
- **권장 조치**: ALB SG의 Inbound를 CloudFront의 Managed Prefix List(`com.amazonaws.global.cloudfront.origin-facing`)로 제한하거나, ALB에 커스텀 헤더 검증을 추가하여 CloudFront 경유 요청만 허용해야 한다.

### 3.3 JWT 인증과 ALB/CloudFront 레벨 보안

**[정합성 확인]** 🟢 Info
- 백엔드가 JWT 기반 Stateless 인증을 사용하고, CloudFront는 API 요청을 캐시하지 않고(캐시 비활성화) ALB로 전달하므로 JWT 토큰이 정상적으로 백엔드까지 전달된다.
- CloudFront WAF가 활성화되어 일반적인 웹 공격(SQL Injection, XSS 등)에 대한 1차 방어가 이루어진다.

**[개선 제안]** 🟡 Warning
- CloudFront `/api/*` Behavior에서 `Authorization` 헤더가 Origin(ALB)으로 전달되는지 확인이 필요하다. CloudFront의 Origin Request Policy에서 `Authorization` 헤더를 허용 목록에 포함시켜야 JWT 토큰이 백엔드까지 전달된다. 현재 캐시 비활성화 설정이라면 모든 헤더가 전달될 가능성이 높으나, 명시적 확인을 권장한다.

### 3.4 민감 정보 노출 위험

**[위험 사항]** 🔴 Critical
- ECS Task Definition과 Lambda 환경 변수에 `MONGODB_URI`가 평문으로 포함되어 있으며, 이 URI에 DocumentDB 자격증명(dmillion:비밀번호)이 포함되어 있다. AWS 콘솔, CLI, CloudTrail 로그 등에서 이 값이 노출될 수 있다.
- **권장 조치**: AWS Secrets Manager 또는 SSM Parameter Store(SecureString)를 사용하여 DB 자격증명을 관리하고, ECS Task Definition에서는 `valueFrom`으로 Secrets Manager ARN을 참조하도록 변경해야 한다.

**[위험 사항]** 🟡 Warning
- 백엔드의 JWT Secret이 환경 변수로 관리되는 것으로 보이나, ECS Task Definition 환경 변수 목록에 `JWT_SECRET`이 명시되어 있지 않다. application.yml에서 직접 값을 하드코딩하고 있다면 Git 저장소에 비밀 키가 노출된 상태이다. 이 또한 Secrets Manager로 관리하는 것을 권장한다.

### 3.5 DocumentDB TLS 비활성화

**[위험 사항]** 🟡 Warning
- DocumentDB Parameter Group `finance-docdb-no-tls`로 TLS가 비활성화되어 있어 VPC 내부에서도 평문 통신이 이루어진다. 현재 VPC 내부 통신이므로 외부 도청 위험은 낮으나, 규정 준수(Compliance) 요구사항이 있는 경우 TLS 활성화가 필요하다.

### 3.6 Redis 인증/암호화 미적용

**[위험 사항]** 🟡 Warning
- ElastiCache Redis에 Auth Token(비밀번호), 전송 중 암호화, 저장 시 암호화가 모두 비활성화되어 있다. Redis에 편집자 잠금 상태, 업로드 진행률, 세션 상태 등의 데이터가 저장되며, VPC 내부 어떤 자원에서든 인증 없이 Redis에 접근 가능하다.
- **권장 조치**: 최소한 Redis AUTH 토큰을 설정하고, 전송 중 암호화(TLS)를 활성화할 것을 권장한다.

### 3.7 관리자 초기 계정

**[위험 사항]** 🔴 Critical
- 백엔드 `AdminDataInitializer`에서 시작 시 관리자 계정(admin/admin)을 자동 생성한다. 프로덕션 환경에서 기본 자격증명이 그대로 사용되면 심각한 보안 취약점이 된다. 초기 배포 후 반드시 관리자 비밀번호를 변경하거나, 프로덕션 프로파일에서는 초기화를 비활성화해야 한다.

---

## 4. 성능/가용성 관점 피드백

### 4.1 ECS 2 Task 구성과 세션/캐시 전략

**[정합성 확인]** 🟢 Info
- 백엔드가 JWT 기반 Stateless 세션(Spring Security `STATELESS`)을 사용하고 있어 ECS 2 Task 간 세션 공유 문제가 없다.
- 편집자 잠금(Redis 기반 하트비트)과 업로드 진행률(Redis) 등 공유 상태가 Redis에 저장되므로 ECS 다중 Task 환경에서 정합성이 유지된다.
- ALB Target Group이 라운드 로빈 방식으로 요청을 분산하며, 백엔드가 Stateless이므로 Sticky Session 없이도 정상 동작한다.

### 4.2 DocumentDB Single AZ 구성

**[위험 사항]** 🔴 Critical
- DocumentDB가 Single Instance(db.r8g.large), 단일 AZ(ap-northeast-2c)로 구성되어 있다. AZ 2c에 장애가 발생하면 데이터베이스 접근이 완전히 불가능하다.
- 백엔드는 20개 이상의 MongoDB 컬렉션을 사용하며 모든 비즈니스 로직이 DocumentDB에 의존하므로, DB 장애 시 전체 서비스가 중단된다.
- 현재 데이터에는 프로젝트, 사용자, 파일 세션, raw_data, 클러스터링 결과 등 복구가 어려운 업무 데이터가 저장되어 있다.
- **권장 조치**: 최소 1개의 Reader Replica를 다른 AZ(ap-northeast-2a)에 추가하여 Multi-AZ 구성을 확보해야 한다. 자동 Failover가 지원되어 Writer 장애 시 Reader가 Writer로 승격된다.

### 4.3 Redis 단일 노드 구성과 캐시 의존도

**[위험 사항]** 🔴 Critical
- ElastiCache Redis가 단일 노드(cache.t4g.small), 단일 AZ(ap-northeast-2c)로 구성되어 있다.
- 백엔드에서 Redis는 단순 캐시 이상의 역할을 수행한다:
  - **편집자 잠금 (Distributed Lock)**: Redis TTL 기반 하트비트(30초 간격, TTL 60초). Redis 장애 시 다중 사용자 동시 편집 충돌 발생 가능.
  - **업로드/분석 진행률 상태**: Lambda가 Redis에 처리 상태를 기록하고 프론트엔드가 폴링. Redis 장애 시 진행 상태 확인 불가.
  - **세션 데이터 캐시**: 세션별 데이터 조회 결과 캐시. Redis 장애 시 DocumentDB 직접 조회로 부하 증가.
- `cache.t4g.small`(1.37 GB 메모리)로 대용량 데이터 캐시 시 메모리 부족 가능성이 있다.
- **권장 조치**:
  - Cluster Mode 또는 최소 Automatic Failover가 있는 Replication Group으로 전환하여 가용성 확보.
  - Redis 장애 시 편집자 잠금 기능의 Graceful Degradation 전략을 백엔드에 구현할 것을 권장(예: 잠금 획득 실패 시 경고 후 진행 허용).

### 4.4 NAT Gateway 단일 AZ

**[위험 사항]** 🟡 Warning
- NAT Gateway가 AZ 2a에만 배치되어 있다. AZ 2a 장애 시 Private Subnet(2a, 2c 모두)에서 인터넷 아웃바운드(S3, SQS 등 AWS 서비스 접근)가 불가능하다.
- ECS Task와 Lambda가 NAT Gateway를 통해 S3, SQS에 접근하므로, NAT Gateway 장애 시 파일 업로드/다운로드, SQS 메시지 처리가 모두 중단된다.
- **권장 조치**: AZ 2c에도 NAT Gateway를 추가하고, 각 AZ의 Private Subnet이 해당 AZ의 NAT Gateway를 사용하도록 Route Table을 분리해야 한다.

### 4.5 ECS Task 리소스 스펙

**[개선 제안]** 🟡 Warning
- ECS Task에 2 vCPU / 4 GB 메모리가 할당되어 있고, JVM 옵션 `-XX:MaxRAMPercentage=75.0`으로 최대 힙이 약 3GB로 설정된다.
- 백엔드에서 Apache POI로 대용량 Excel 처리(배열 크기 300MB 상향), DashboardGenerationService의 병렬 스레드 기반 통계 생성, MongoDB Semaphore 기반 동시 실행 제어(10개) 등 메모리 집약적 작업이 수행된다.
- 동시 사용자가 증가하거나 대용량 Excel 파일 처리 시 OOM이 발생할 수 있다. CloudWatch 메모리 사용률 메트릭을 모니터링하고, 필요 시 4 vCPU / 8 GB로 스케일업을 검토해야 한다.

### 4.6 ECS Auto Scaling 미구성

**[누락 사항]** 🟡 Warning
- ECS Service의 Desired Count가 2로 고정되어 있으며, Auto Scaling 정책이 문서에 언급되지 않았다. 업무 시간 중 사용량이 급증할 경우(예: 다수 사용자가 동시에 Excel 업로드/클러스터링 수행) 고정 2 Task로는 부족할 수 있다.
- **권장 조치**: CPU/메모리 사용률 기반 Target Tracking Auto Scaling 정책을 구성하여 최소 2, 최대 4 Task 등으로 탄력적 확장을 지원할 것을 권장한다.

### 4.7 CloudFront-ALB 구간 HTTP 통신

**[위험 사항]** 🟡 Warning
- CloudFront에서 ALB Origin으로의 통신이 HTTP(비암호화)로 이루어지고 있다. CloudFront->ALB 구간은 AWS 네트워크 내부이지만, JWT 토큰과 사용자 데이터가 평문으로 전달된다.
- **권장 조치**: ALB에 ACM 인증서를 적용하고 CloudFront Origin Protocol Policy를 HTTPS로 변경하는 것을 권장한다.

---

## 5. 누락 또는 불일치 사항

### 5.1 AccountAnalysisHandler Lambda 미확인

**[누락 사항]** 🔴 Critical
- 상기 1.5에서 언급한 바와 같이, 백엔드 아키텍처에서 핵심 기능인 계정 분석(raw_data -> session_data 변환)을 수행하는 `AccountAnalysisHandler` Lambda가 인프라 자원 목록에 누락되어 있다. 이 Lambda가 실제로 배포되어 있지 않다면 Step 2(계정 분석 시작) 기능이 동작하지 않으며, 전체 데이터 처리 파이프라인이 중단된다.

### 5.2 Actuator 엔드포인트 보안

**[위험 사항]** 🟡 Warning
- 백엔드 SecurityConfig에서 `/actuator/health`를 permitAll로 설정하고 있으며, 이 경로는 ALB Health Check에 사용된다. 그러나 `health, info, metrics` 엔드포인트가 모두 노출된다고 기술되어 있다. `/actuator/metrics`와 `/actuator/info`는 시스템 내부 정보를 노출할 수 있으므로, ALB에서만 접근 가능하도록 제한하거나 CloudFront에서 `/actuator/*` 경로를 차단해야 한다.

### 5.3 CloudFront 캐시 정책과 프론트엔드 배포

**[정합성 확인]** 🟢 Info
- 프론트엔드 배포 스크립트에서 정적 자산에 `max-age=31536000, immutable`, `index.html`에 `no-cache, no-store, must-revalidate`를 적용하고 있다. CloudFront Default Behavior의 DefaultTTL이 86400s이지만, S3 오브젝트의 Cache-Control 헤더가 우선 적용되므로 의도대로 동작한다.

### 5.4 프론트엔드 S3 버킷명 불일치

**[위험 사항]** 🟡 Warning
- 백엔드 아키텍처에서 프론트엔드 호스팅 버킷을 `finance-frontend`로 기술(6.1절)하고 있으나, 실제 AWS S3 버킷명은 `lgcns-finance-frontend-app`이다. 백엔드 문서의 오류이나, 백엔드 코드에서 이 버킷명을 참조하는 로직이 있다면 장애가 발생할 수 있다.

### 5.5 S3 Presigned URL 유효 기간 미확인

**[개선 제안]** 🟢 Info
- 백엔드에서 S3 Presigned URL을 생성하여 프론트엔드가 S3에 직접 업로드하는 구조이다. Presigned URL의 유효 기간이 문서에 명시되어 있지 않다. 대용량 Excel 파일(1GB 제한) 업로드 시 네트워크 속도에 따라 업로드 시간이 길어질 수 있으므로, Presigned URL 유효 기간이 충분한지(최소 30분 이상) 확인이 필요하다.

### 5.6 DLQ 모니터링 및 알림 미구성

**[누락 사항]** 🟡 Warning
- SQS DLQ(`finance-excel-processing-dlq`)에 현재 1개의 메시지가 잔류하고 있다. DLQ에 메시지가 쌓이면 Excel 처리 실패를 의미하지만, CloudWatch Alarm이나 SNS 알림이 구성되어 있는지 문서에서 확인되지 않는다.
- **권장 조치**: DLQ의 `ApproximateNumberOfMessagesVisible` 메트릭에 대한 CloudWatch Alarm을 구성하여 운영팀에 알림을 전송해야 한다.

### 5.7 Lambda Reserved/Provisioned Concurrency 미설정

**[개선 제안]** 🟡 Warning
- Lambda 함수(ExcelCoordinator, ExcelWorker)에 Reserved Concurrency나 Provisioned Concurrency가 문서에 언급되지 않았다. Java 21 Lambda는 Cold Start가 10~30초 이상 소요될 수 있으며, 대용량 Excel 처리 시 다수의 Worker가 동시 실행될 수 있다.
- **권장 조치**: ExcelWorker에 최소 Provisioned Concurrency 1~2를 설정하여 Cold Start를 줄이거나, SnapStart를 적용하는 것을 검토해야 한다. 또한 DocumentDB 커넥션 고갈을 방지하기 위해 Reserved Concurrency 상한을 설정하는 것이 좋다.

---

## 종합 요약

| 심각도 | 건수 | 주요 항목 |
|--------|------|-----------|
| 🔴 Critical | 5 | AccountAnalysisHandler Lambda 누락, DocumentDB Single AZ, Redis 단일 노드, DB 자격증명 평문 노출, ALB 직접 접근 가능, 관리자 기본 계정 |
| 🟡 Warning | 13 | NAT GW 단일 AZ, ANALYSIS_QUEUE_URL 누락, ECS Auto Scaling 미구성, DLQ 알림 미구성, Lambda Cold Start, CloudFront-ALB HTTP 통신, Redis 인증 미적용, DocumentDB TLS 비활성화, Actuator 노출, SG CIDR 규칙, ALB 직접 접근, API URL 폴백 로직, Lambda Concurrency 등 |
| 🟢 Info | 9 | 환경 변수 정합성, S3 버킷명 일치, CloudFront Origin 설정, SPA 라우팅, CORS 설정, JWT Stateless 호환성 등 |

### 우선 조치 권장 사항 (Top 5)

1. **DocumentDB Multi-AZ 구성**: Reader Replica 추가 (AZ 2a)
2. **DB 자격증명 Secrets Manager 이전**: MONGODB_URI 평문 노출 제거
3. **ALB 접근 제한**: CloudFront Managed Prefix List 적용 또는 커스텀 헤더 검증
4. **AccountAnalysisHandler Lambda 배포 확인**: 계정 분석 기능 동작 여부 검증
5. **Redis Replication Group 전환**: Automatic Failover 지원 구성
