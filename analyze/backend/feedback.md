# 백엔드 관점 크로스 리뷰 피드백

> **작성일**: 2026-03-19
> **리뷰어**: Backend Agent
> **리뷰 대상**: 인프라 아키텍처 문서, AWS 자원 분석 문서, 프론트엔드 아키텍처 문서, 페이지 라우팅 문서

---

## 1. 백엔드 <-> 인프라 정합성

### 1.1 ECS 환경 변수 / application.yml 정합성

**[정합성 확인]** :green_circle: Info

ECS Task Definition 환경 변수와 `application.yml`의 prod 프로파일 설정이 일치한다.

| 환경 변수 | ECS Task Definition | application.yml (prod) | 일치 여부 |
|-----------|--------------------|-----------------------|-----------|
| SPRING_PROFILES_ACTIVE | `prod` | `${SPRING_PROFILES_ACTIVE:local}` | 일치 |
| MONGODB_URI | `mongodb://dmillion:***@finance-docdb-cluster...` | `mongodb://dmillion:admin240401!@finance-docdb-cluster...` | 일치 |
| REDIS_HOST | `finance-redis-cluster.1kdayr.0001.apn2.cache.amazonaws.com` | 동일 | 일치 |
| REDIS_PORT | `6379` | `6379` | 일치 |
| S3_BUCKET | `finance-excel-uploads` | `aws.s3.excel-bucket: finance-excel-uploads` | 일치 |
| AWS_REGION | `ap-northeast-2` | `aws.region: ap-northeast-2` | 일치 |

**[위험 사항]** :red_circle: Critical - **MONGODB_URI에 DB 비밀번호 평문 노출**

`application.yml` prod 프로파일에 DocumentDB 비밀번호(`admin240401!`)가 하드코딩되어 있다. ECS Task Definition에서도 환경 변수로 평문 전달하고 있다. 인프라 문서에서도 이 점을 경고하고 있으나, 실제 조치가 필요하다.
- **권장**: AWS Secrets Manager 또는 SSM Parameter Store를 통해 `valueFrom`으로 시크릿을 참조하도록 변경해야 한다.

### 1.2 Health Check 설정 정합성

**[정합성 확인]** :green_circle: Info

| 항목 | 인프라 문서 | 실제 application.yml | 일치 여부 |
|------|-----------|---------------------|-----------|
| Health Check 경로 | `/actuator/health` | `management.endpoints.web.exposure.include: health,info,metrics` | 일치 |
| Security 허용 | permitAll 필요 | `SecurityConfig`: `/actuator/health` permitAll | 일치 |
| ECS Container HC | `wget --spider http://localhost:8080/actuator/health` | 포트 8080 노출 | 일치 |
| ALB Target Group HC | `/actuator/health`, Interval 30s | Actuator 설정과 일치 | 일치 |

**[개선 제안]** :yellow_circle: Warning - **Health Check show-details 설정**

`application.yml`에서 `management.endpoint.health.show-details: when-authorized`로 설정되어 있는데, ECS Health Check는 인증 없이 `wget`으로 호출한다. 현재 `mongo.enabled: false`, `redis.enabled: false`로 상세 정보를 비활성화하여 문제가 없지만, 향후 Health indicator를 추가할 경우 인증 없는 Health Check가 상세 정보를 반환하지 못할 수 있다. `show-details: always` 또는 별도의 내부 Health Check 엔드포인트 검토를 권장한다.

### 1.3 배포 파이프라인 정합성

**[정합성 확인]** :green_circle: Info

인프라 문서의 배포 파이프라인 설명과 실제 `deploy.ps1` 스크립트가 일치한다.
- 14단계 구성, Gradle clean build -x test, Docker Build/Push, Task Definition 갱신, ECS Rolling Update 등 모두 정확하다.
- 배포 상태 확인 폴링(30초 간격, 최대 10회)도 일치한다.

**[개선 제안]** :yellow_circle: Warning - **인프라 문서 배포 단계 번호 불일치**

인프라 문서에서 Lambda 배포 단계를 `(9) -> (10) -> (12)`로 기술하여 (11) 번호가 누락되어 있다. 실제 `deploy.ps1`에서는 `[10/14] Coordinator Code -> [11/14] Coordinator Config -> [12/14] Worker Code -> [13/14] Worker Config`로 구분되어 있다. 인프라 문서의 단계 번호를 수정할 필요가 있다.

### 1.4 Lambda 환경 변수 / 소스 코드 정합성

**[정합성 확인]** :green_circle: Info

Lambda 소스 코드(`MongoDBConfig.java`, `RedisConfig.java`)에서 `System.getenv()`로 참조하는 환경 변수와 인프라 문서의 Lambda 환경 변수가 일치한다.

| 환경 변수 | Lambda 소스 코드 참조 | 인프라 문서 | 일치 |
|-----------|---------------------|-----------|------|
| MONGODB_URI | `MongoDBConfig.getMongoClient()` | 설정됨 | 일치 |
| REDIS_HOST | `RedisConfig.getJedisPool()` | 설정됨 | 일치 |
| REDIS_PORT | `RedisConfig.getJedisPool()` | 6379 | 일치 |
| S3_BUCKET | Worker/Coordinator에서 사용 | 설정됨 | 일치 |
| SQS_QUEUE_URL | Coordinator에서 사용 | 설정됨 | 일치 |

**[누락 사항]** :yellow_circle: Warning - **ANALYSIS_QUEUE_URL 환경 변수 미기재**

백엔드 `application.yml`에 `aws.sqs.analysis-queue-url: ${ANALYSIS_QUEUE_URL:}`가 정의되어 있고, `SessionDataService`에서 이를 사용한다. 하지만 인프라 문서의 ECS Task Definition 환경 변수 목록에 `ANALYSIS_QUEUE_URL`이 누락되어 있다. Lambda `AccountAnalysisHandler`가 이 큐를 트리거로 사용하므로, SQS 큐 목록과 Lambda 트리거 설정도 인프라 문서에 추가해야 한다.

**[누락 사항]** :yellow_circle: Warning - **AccountAnalysisHandler Lambda 미기재**

백엔드 아키텍처 문서에 `AccountAnalysisHandler` Lambda 함수가 기술되어 있으나, 인프라 문서에는 `ExcelCoordinator`와 `ExcelWorker`만 기재되어 있다. `AccountAnalysisHandler`의 인프라 자원(메모리, 타임아웃, 환경 변수, 트리거 SQS 큐)이 인프라 문서에 누락되었다.

**[누락 사항]** :yellow_circle: Warning - **JWT_SECRET 환경 변수 미기재**

`application.yml`에서 `jwt.secret: ${JWT_SECRET:your-256-bit-secret-key-...}`로 환경 변수를 참조하고 있으나, ECS Task Definition 환경 변수 목록에 `JWT_SECRET`이 없다. 현재 기본값(하드코딩된 키)이 프로덕션에서 사용되고 있을 가능성이 있어 보안 위험이 높다.

---

## 2. 백엔드 <-> 프론트엔드 API 연동 정합성

### 2.1 API 엔드포인트 매핑 정합성

**[정합성 확인]** :green_circle: Info

프론트엔드 서비스 레이어(`services/*.js`)에서 호출하는 API 엔드포인트와 백엔드 Controller 엔드포인트가 전반적으로 일치한다.

| 프론트엔드 서비스 | 주요 API 경로 | 백엔드 Controller | 정합성 |
|-----------------|--------------|-------------------|--------|
| authService | `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh` | AuthController | 일치 |
| projectService | `/api/projects`, `/api/projects/{id}` | ProjectController | 일치 |
| uploadService | `/api/projects/{id}/upload/*` | UploadController, FileSessionController | 일치 |
| preprocessingService | `.../preprocessing/*` | PreprocessingController | 일치 |
| transformService | `.../transform/*` | TransformController | 일치 |
| clusteringService | `.../clustering/*` | ClusteringController | 일치 |
| detailClusteringService | `.../detail-clustering/*` | DetailClusteringController | 일치 |
| exportService | `.../export/*` | ExportController | 일치 |
| costReductionService | `.../dashboard/*`, `.../longlist/*`, `.../shortlist/*`, `.../tasks/*` | 관련 Controllers | 일치 |
| adminService | `/api/admin/*` | AdminController | 일치 |
| systemService | `/api/system/*` | SystemController | 일치 |

### 2.2 인증 토큰 처리 방식

**[정합성 확인]** :green_circle: Info

양측의 JWT 토큰 처리 흐름이 정확히 일치한다.

| 항목 | 프론트엔드 (api.js / authService.js) | 백엔드 (SecurityConfig / JwtTokenProvider) | 일치 |
|------|--------------------------------------|-------------------------------------------|------|
| 토큰 전달 방식 | `Authorization: Bearer {token}` | JwtAuthenticationFilter에서 Authorization 헤더 추출 | 일치 |
| 토큰 저장 | localStorage (authToken, refreshToken) | 서버 측 상태 없음 (Stateless) | 호환 |
| 토큰 갱신 | `POST /api/auth/refresh` { refreshToken } | AuthController.refreshToken() | 일치 |
| Access Token 만료 | 1시간 (클라이언트 30초 버퍼) | 3,600,000ms (1시간) | 일치 |
| Refresh Token 만료 | 7일 | 604,800,000ms (7일) | 일치 |
| 갱신 응답 필드 | `response.data.accessToken`, `response.data.refreshToken` | LoginResponse DTO | 일치 |

### 2.3 에러 응답 형식 호환성

**[정합성 확인]** :green_circle: Info

백엔드 GlobalExceptionHandler의 에러 응답 형식과 프론트엔드 인터셉터의 에러 처리 로직이 호환된다.

| 백엔드 에러 응답 | 프론트엔드 처리 |
|----------------|---------------|
| 401 + JSON `{ error, message, status }` | 401 -> refresh 시도 -> 실패 시 로그아웃 |
| 403 + JSON `{ error: "FORBIDDEN" }` | 백엔드 인증 403만 세션 만료 처리, 인프라 403 구분 |
| 400 + `{ success: false, error, message }` | 일반 에러 reject |
| 500+ | 연속 에러 카운팅 (임계값 5회) |

**[개선 제안]** :yellow_circle: Warning - **401 응답 형식 불일치 가능성**

백엔드 `jwtAuthenticationEntryPoint()`에서 반환하는 401 응답 형식은 `{ error: "UNAUTHORIZED", message: "...", status: 401 }`이지만, GlobalExceptionHandler의 일반 에러 응답 형식은 `{ success: false, error: "ERROR_CODE", message: "...", timestamp: "..." }`이다. 프론트엔드에서 두 형식을 모두 처리하고 있지만, 응답 형식을 통일하는 것이 유지보수에 유리하다.

### 2.4 systemService 인증 이슈

**[위험 사항]** :red_circle: Critical - **systemService API 인증 불일치**

프론트엔드 `systemService.js`는 `/api/system/maintenance-status`와 `/api/system/upload-progress`를 **인증 토큰 없이도 호출 가능하도록** 방어 코드를 작성하고 있다 (토큰이 없으면 헤더 생략). 또한 `api.js` Axios 인스턴스 대신 순수 `axios`를 직접 사용하여 인터셉터를 우회한다.

그러나 백엔드 `SecurityConfig`에서 `/api/system/**` 경로는 `permitAll`로 설정되어 있지 **않다** (`anyRequest().authenticated()`에 해당). 따라서 인증 토큰 없이 해당 API를 호출하면 401 에러가 발생한다.

**해결 방안**:
- 프론트엔드 문서에 기술된 "인증 토큰 없이 호출 가능" 설명이 실제 동작과 다르므로, `SecurityConfig`에 `/api/system/**` permitAll을 추가하거나, `systemService.js`가 `api.js` 인스턴스를 사용하도록 수정해야 한다.

---

## 3. API 설계 관점 피드백

### 3.1 RESTful 규칙 준수 여부

**[개선 제안]** :yellow_circle: Warning - **일부 엔드포인트 RESTful 위반**

| 엔드포인트 | 문제 | 개선안 |
|-----------|------|--------|
| `POST .../sessions/delete-batch` | DELETE 의미인데 POST 사용 | `DELETE .../sessions/batch` (body에 ID 목록) |
| `POST .../sessions/{id}/reset` | 상태 변경인데 POST | `PUT .../sessions/{id}/reset` 또는 `DELETE .../sessions/{id}/data` |
| `POST /api/admin/s3/cleanup` | 삭제 작업인데 POST | `DELETE /api/admin/s3/orphaned` |
| `POST .../upload/reanalyze` | 재처리 트리거 | POST 사용은 적절 (action endpoint) |

다만 이는 기능상 문제는 없으므로 우선순위가 낮다.

### 3.2 PATCH 메서드 미사용

**[정합성 확인]** :green_circle: Info

프론트엔드와 백엔드 모두 PATCH 메서드를 사용하지 않고 PUT으로 부분 업데이트를 처리한다. 양측이 일관되게 동일한 패턴을 사용하고 있으므로 문제 없다. 단, CloudFront Cache Behavior에서 PATCH를 허용 Method에 포함하고 있으므로, 향후 PATCH 도입 시 인프라 변경은 불필요하다.

### 3.3 페이지네이션 패턴 일관성

**[정합성 확인]** :green_circle: Info

프론트엔드의 페이지네이션 상수(`constants/pagination.js`)에서 정의한 페이지 크기 옵션 [100, 500, 1000, 5000, 10000]과 기본값 1000이 백엔드의 페이징 파라미터(`page`, `size`)와 호환된다. Spring Data의 `Pageable` 인터페이스 기반으로 동작하며 양측 일치한다.

---

## 4. 데이터 흐름 정합성

### 4.1 프론트엔드 상태 관리 <-> 백엔드 세션/캐시 전략

**[정합성 확인]** :green_circle: Info

| 항목 | 프론트엔드 | 백엔드 | 호환성 |
|------|-----------|--------|--------|
| 인증 상태 | AuthContext (React Context) | JWT Stateless (서버 세션 없음) | 호환 |
| 편집자 잠금 | useEditorLock (30초 heartbeat) | Redis TTL 60초 | 호환 (TTL > heartbeat 간격) |
| 세션 편집자 잠금 | useSessionEditorLock (30초 heartbeat) | Redis 기반 | 호환 |
| 처리 상태 폴링 | 1초 간격 폴링 | Redis에 진행률 저장 | 호환 |
| 세션 검증 | 1분마다 GET /api/auth/me | JWT 검증 | 호환 |

### 4.2 파일 업로드 흐름 (Presigned URL)

**[정합성 확인]** :green_circle: Info

파일 업로드 흐름이 양측에서 일관되게 기술되어 있다.

1. 프론트엔드: `uploadService.getPresignedUrl()` -> `POST /api/projects/{id}/upload/presigned-url`
2. 프론트엔드: `uploadService.uploadToS3()` -> XMLHttpRequest PUT to Presigned URL
3. 프론트엔드: `uploadService.completeFileUpload()` -> `POST /api/projects/{id}/upload/files`
4. Lambda 트리거 -> ExcelCoordinator -> ExcelWorker
5. 프론트엔드: 상태 폴링

**[개선 제안]** :yellow_circle: Warning - **S3 CORS 설정과 업로드 Content-Type**

프론트엔드 `uploadService.js`에서 S3 직접 업로드 시 Content-Type을 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`로 하드코딩하고 있다. 인프라 문서의 S3 CORS 설정에서 `Allowed Headers`는 `Content-Type, x-amz-*`로 허용하고 있으므로 호환된다. 다만, `.xls` (구 형식) 파일 업로드 시에는 Content-Type이 `application/vnd.ms-excel`이어야 하므로 파일 확장자에 따른 동적 Content-Type 설정을 검토할 필요가 있다.

### 4.3 ExcelCoordinator 트리거 방식 불일치

**[위험 사항]** :yellow_circle: Warning - **인프라 문서와 백엔드 문서 간 트리거 방식 불일치**

- **인프라 문서**: Excel 업로드 흐름을 `ECS -> S3 업로드 -> SQS 메시지 전송 -> SQS Trigger -> ExcelCoordinator`로 기술 (ECS가 직접 SQS에 메시지를 보내고, SQS가 Lambda를 트리거)
- **백엔드 문서**: `ExcelCoordinatorHandler`의 트리거를 `S3 이벤트 (파일 업로드)`로 기술 (S3 이벤트가 Lambda를 직접 트리거)

실제 동작 방식이 S3 이벤트 트리거인지 SQS 트리거인지 확인이 필요하다. 인프라 문서에서는 SQS를 중간에 두는 것으로, 백엔드 문서에서는 S3 -> Lambda 직접 트리거로 기술하고 있어 혼동이 있다.

---

## 5. 누락 또는 불일치 사항

### 5.1 CloudFront -> ALB 구간 HTTP 통신

**[위험 사항]** :yellow_circle: Warning

인프라 문서에서 명시한 대로 CloudFront에서 ALB Origin으로의 통신이 HTTP(평문)로 이루어진다. ALB에 HTTPS Listener가 없고, CloudFront Origin Protocol이 HTTP로 설정되어 있다. VPC 외부 구간(CloudFront Edge -> ALB)에서 API 요청(JWT 토큰 포함)이 평문으로 전송될 수 있다.

- **영향**: JWT 토큰, 사용자 데이터가 CloudFront -> ALB 구간에서 암호화되지 않음
- **권장**: ALB에 ACM 인증서를 적용하고 HTTPS Origin Protocol을 사용

### 5.2 CORS 설정 불일치

**[개선 제안]** :yellow_circle: Warning

백엔드 `SecurityConfig.java`의 CORS 허용 Origin:
- `http://localhost:3000`
- `https://finance-tool.com`
- `https://d3ipfpkjg02npk.cloudfront.net`

인프라 문서의 S3 CORS 설정 (finance-excel-uploads):
- `https://d3ipfpkjg02npk.cloudfront.net`
- `http://localhost:3000`

`https://finance-tool.com` 도메인이 백엔드 CORS에는 있지만 S3 CORS에는 없다. 커스텀 도메인 사용 시 S3에서 Presigned URL 업로드가 CORS 에러로 실패할 수 있다.

### 5.3 Redis SSL 설정

**[정합성 확인]** :green_circle: Info

`application.yml` prod 프로파일에서 `redis.ssl.enabled: false`, 인프라 문서에서 ElastiCache 전송 중 암호화 비활성화. 양측 일치한다. 다만 보안 관점에서 VPC 내부라 하더라도 전송 중 암호화 활성화를 권장한다.

### 5.4 프론트엔드 환경 변수 fallback 로직

**[개선 제안]** :green_circle: Info

프론트엔드 `api.js`에서 `VITE_API_BASE_URL`이 빈 값일 때 `http://localhost:8080`으로 fallback하는 로직이 있다. 프로덕션에서는 `.env.production`에 빈 값이 설정되므로 `http://localhost:8080`이 baseURL로 사용되지만, CloudFront 같은 도메인에서 프록시하므로 실제로는 상대 경로로 동작한다. 프론트엔드 문서에서 이 동작을 설명하고 있으나, `localhost:8080` fallback이 프로덕션 환경에서 의미 없는 값이므로 빈 문자열(`''`)을 명시적으로 설정하는 것이 깔끔하다.

### 5.5 인프라 문서 - ExcelCoordinator JVM 옵션 불일치

**[누락 사항]** :yellow_circle: Warning

인프라 문서에서 ExcelCoordinator의 JVM 옵션을 `-Xmx1536m`으로 기재했으나, Lambda 메모리가 1024MB인 상황에서 `-Xmx1536m`은 메모리 초과이다. Lambda 런타임에서 JVM이 실제로 1024MB 제한 내에서 자동 조정하겠지만, 문서의 정확성을 위해 확인 및 수정이 필요하다. ExcelWorker에 대해서도 동일한 설정인지 확인이 필요하다.

### 5.6 DocumentDB TLS 비활성화 관련 연결 문자열

**[정합성 확인]** :green_circle: Info

인프라 문서에서 DocumentDB Parameter Group이 `finance-docdb-no-tls` (TLS 비활성화)로 설정되어 있고, 백엔드 `application.yml`의 MongoDB URI에 TLS 관련 파라미터가 없다. Lambda `MongoDBConfig.java`에서도 TLS 설정 없이 연결한다. TLS 비활성화 상태에서의 연결이 양측 일관되게 구성되어 있다.

---

## 6. 종합 요약

| 심각도 | 항목 수 | 주요 내용 |
|--------|---------|----------|
| :red_circle: Critical | 2 | DB 비밀번호 평문 노출, systemService 인증 불일치 |
| :yellow_circle: Warning | 9 | ANALYSIS_QUEUE_URL 누락, AccountAnalysisHandler 미기재, JWT_SECRET 미기재, 배포 단계 번호 오류, 401 응답 형식 불일치, S3 Content-Type, 트리거 방식 문서 불일치, CloudFront-ALB HTTP, CORS 불일치 |
| :green_circle: Info | 8 | 환경 변수 일치, Health Check 일치, 토큰 처리 일치, 에러 응답 호환, 페이지네이션 일치, 편집자 잠금 일치, Redis SSL 일치, DocumentDB TLS 일치 |

### 우선 조치 항목

1. **[Critical]** DB 비밀번호를 AWS Secrets Manager로 이관하고, ECS Task Definition에서 `valueFrom`으로 참조
2. **[Critical]** `SecurityConfig`에 `/api/system/**` 경로 `permitAll` 추가 또는 `systemService.js`가 인증 인터셉터를 사용하도록 수정
3. **[Warning]** 인프라 문서에 `AccountAnalysisHandler` Lambda 및 `ANALYSIS_QUEUE_URL` 환경 변수 추가
4. **[Warning]** ECS Task Definition에 `JWT_SECRET` 환경 변수 추가 (Secrets Manager 권장)
5. **[Warning]** ExcelCoordinator 트리거 방식(S3 이벤트 vs SQS)에 대한 문서 통일
