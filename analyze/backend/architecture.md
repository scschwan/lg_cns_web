최종 수정일: 2026-03-19 (Phase 4 피드백 반영 완료)

# Finance Tool - Spring Boot 백엔드 아키텍처 문서

## 1. 백엔드 개요

### 1.1 기술 스택

| 구분 | 기술 | 버전 |
|------|------|------|
| Framework | Spring Boot | 3.5.9 |
| Language | Java | 21 |
| Database | MongoDB (AWS DocumentDB) | - |
| Cache | Redis (AWS ElastiCache) | - |
| Storage | AWS S3 | SDK v2.28.11 |
| Message Queue | AWS SQS | SDK v2.28.11 |
| Serverless | AWS Lambda | - |
| Authentication | JWT (jjwt 0.12.3) | - |
| Security | Spring Security | 6.x |
| Excel Processing | Apache POI 5.2.5 | - |
| NLP | Open Korean Text 2.3.1 | - |
| API Docs | SpringDoc OpenAPI (Swagger) 2.3.0 | - |
| Build Tool | Gradle | - |

### 1.2 프로젝트 구조 요약

```
backend/
  src/main/java/com/example/finance/
    FinanceBackendApplication.java          # 메인 애플리케이션
    config/                                 # 설정 클래스 (5개)
    security/                               # JWT 인증 (4개)
    controller/                             # REST 컨트롤러 (20개)
      auth/   admin/   project/   upload/
      fileload/   data/   costreduction/   common/
    service/                                # 비즈니스 로직 (26개)
      auth/   admin/   project/   upload/
      data/   costreduction/   common/
    repository/                             # 데이터 접근 (21개)
      auth/   admin/   project/   session/
      upload/   data/   costreduction/
    model/                                  # 도메인 모델 (23개)
      auth/   admin/   project/   session/
      upload/   data/   costreduction/
    dto/                                    # Request/Response DTO
      request/   response/
    exception/                              # 예외 처리 (7개)
    enums/                                  # Enum 정의 (3개)
  src/main/resources/
    application.yml                         # 설정 파일 (local/prod 프로파일)

  lambda/
    src/main/java/com/example/lambda/
      coordinator/ExcelCoordinatorHandler.java   # S3 이벤트 -> SQS 청크 분할
      worker/ExcelWorkerHandler.java             # SQS -> Excel 파싱 -> MongoDB
      worker/AccountAnalysisHandler.java         # SQS -> 계정 분석 (raw_data -> session_data)
      model/ProcessingMessage.java               # SQS 메시지 DTO
      config/MongoDBConfig.java                  # Lambda MongoDB 설정
      config/RedisConfig.java                    # Lambda Redis 설정
```

---

## 2. 레이어드 아키텍처

```
+---------------------------------------------------------------------+
|                        [Client / Frontend]                          |
|                  React SPA (CloudFront + S3)                        |
+----------------------------+----------------------------------------+
                             | HTTP (REST API)
                             v
+---------------------------------------------------------------------+
|                     [Security Layer]                                |
|  SecurityConfig -> JwtAuthenticationFilter -> UserPrincipal         |
|  (CORS, CSRF off, Stateless Session, BCrypt)                       |
+----------------------------+----------------------------------------+
                             |
                             v
+---------------------------------------------------------------------+
|                   [Controller Layer]                                |
|  AuthController | AdminController | ProjectController               |
|  UploadController | FileSessionController | DataController          |
|  PreprocessingController | TransformController                      |
|  ClusteringController | DetailClusteringController                  |
|  ExportController | CostReductionDashboardController                |
|  LongListController | ShortListController | AbleTaskController      |
|  ClusteringImportController | DashboardGenerationController         |
|  CacheController | SystemController | HealthController              |
+----------------------------+----------------------------------------+
                             |
                             v
+---------------------------------------------------------------------+
|                    [Service Layer]                                  |
|  AuthService | AdminService | MaintenanceService | S3AdminService   |
|  ProjectService | UploadService | FileSessionService                |
|  FileAnalysisService | ExcelStreamingParser | ExcelParserService     |
|  RawDataService | SessionDataService | PreprocessingService         |
|  DataTransformService | ClusteringService | DetailClusteringService  |
|  ClusterStatisticsService | ExportService                           |
|  CostReductionDashboardService | LongListService | ShortListService  |
|  AbleTaskService | ClusteringImportService                          |
|  DashboardGenerationService | RedisService | S3Service              |
+----------------------------+----------------------------------------+
                             |
              +--------------+--------------+
              |                             |
              v                             v
+---------------------------+  +---------------------------+
| [Repository Layer]        |  | [External Services]       |
| MongoRepository 인터페이스  |  | AWS S3 (파일 저장)         |
| (Spring Data MongoDB)     |  | AWS SQS (메시지 큐)       |
| 21개 Repository            |  | AWS Lambda (비동기 처리)   |
+---------------------------+  | Redis (캐시/상태 관리)     |
                               +---------------------------+
              |
              v
+---------------------------------------------------------------------+
|                    [Data Layer]                                     |
|  MongoDB (AWS DocumentDB)                                          |
|  12개 컬렉션: users, projects, file_sessions, raw_data,             |
|  session_data, process_data, process_view_data, clustering_results, |
|  cluster_statistics, cost_reduction_dashboards, long_short_lists,   |
|  able_tasks, task_documents, task_weekly_progress,                  |
|  audit_logs, maintenance_status, upload_sessions,                   |
|  column_mappings, preprocessing_configs, search_keyword_hierarchies |
+---------------------------------------------------------------------+
```

---

## 3. 도메인 구조

### 3.1 auth (인증/사용자)

| 구성요소 | 클래스 | 역할 |
|----------|--------|------|
| Controller | `AuthController` | 회원가입, 로그인, 토큰 갱신, 프로필 관리 |
| Service | `AuthService` | 사용자 인증 로직, JWT 토큰 발급/갱신, 프로필 수정 |
| Repository | `UserRepository` | `users` 컬렉션 CRUD |
| Model | `User` | 사용자 엔티티 (email, password, role, isApproved) |
| DTO | `LoginRequest`, `RegisterRequest`, `RefreshTokenRequest`, `LoginResponse` | 인증 요청/응답 |

- 사용자 역할: `USER`, `ADMIN`
- 관리자 승인 기반 가입 (isApproved)
- BCrypt 비밀번호 암호화

### 3.2 admin (관리자)

| 구성요소 | 클래스 | 역할 |
|----------|--------|------|
| Controller | `AdminController` | 사용자/프로젝트/세션/S3 관리, 감사 로그, 유지보수 모드 |
| Service | `AdminService` | 관리자 비즈니스 로직 (사용자 승인/거부, 프로젝트 관리) |
| Service | `S3AdminService` | S3 파일 관리 (목록 조회, 고아 파일 정리) |
| Service | `MaintenanceService` | 유지보수 모드 제어, Lambda 상태 초기화 |
| Repository | `AuditLogRepository` | `audit_logs` 컬렉션 |
| Repository | `MaintenanceRepository` | `maintenance_status` 컬렉션 |
| Model | `AuditLog` | 감사 로그 엔티티 |
| Model | `MaintenanceStatus` | 유지보수 상태 엔티티 |

### 3.3 project (프로젝트 관리)

| 구성요소 | 클래스 | 역할 |
|----------|--------|------|
| Controller | `ProjectController` | 프로젝트 CRUD, 멤버 관리, 프로젝트 완료 |
| Service | `ProjectService` | 프로젝트 생성/수정/삭제, 멤버 초대/권한 변경 |
| Repository | `ProjectRepository` | `projects` 컬렉션 |
| Repository | `ProjectMemberRepository` | 프로젝트 멤버 쿼리 |
| Model | `Project` | 프로젝트 엔티티 (members 임베디드) |
| Model | `ProjectMember` | 멤버 정보 (userId, role) |

- 프로젝트 유형: `STANDARD` (일반), `DASHBOARD_IMPORT` (대시보드 전용)
- 멤버 역할: `OWNER`, `EDITOR`, `VIEWER`
- 소프트 삭제 지원

### 3.4 upload (파일 업로드)

| 구성요소 | 클래스 | 역할 |
|----------|--------|------|
| Controller | `UploadController` | Presigned URL 생성, 파일 업로드 완료, 파일 분석, 재분석 |
| Controller | `FileSessionController` | 세션 CRUD, 잠금, 컬럼 매핑, 데이터 관리, 표준화 |
| Service | `UploadService` | 업로드 세션 관리, 파일 메타데이터 저장, 상태 조회 |
| Service | `FileSessionService` | 파일 세션 생성/병합/삭제, 편집자 잠금 관리 |
| Service | `FileAnalysisService` | 파일 계정명 분석 및 파티션 제안 |
| Service | `ExcelStreamingParser` | 대용량 Excel 스트리밍 파싱 |
| Repository | `UploadSessionRepository` | `upload_sessions` 컬렉션 |
| Repository | `FileSessionRepository` | `file_sessions` 컬렉션 |
| Model | `UploadSession` | 업로드 세션 엔티티 |
| Model | `FileSession` | 파일 세션 엔티티 (진행 단계, 편집자 잠금 포함) |
| Model | `UploadedFileInfo` | 업로드 파일 정보 (임베디드) |
| Model | `StepHistory` | 단계별 이력 |

- S3 Presigned URL 기반 직접 업로드
- 편집자 잠금 (Redis 기반 하트비트)
- 세션별 파일 그룹핑 및 병합

### 3.5 data (데이터 처리)

#### 3.5.1 fileload (데이터 로드)
| 구성요소 | 클래스 | 역할 |
|----------|--------|------|
| Controller | `DataController` | MongoDB/Redis 테스트, 세션별 데이터 조회 |

#### 3.5.2 preprocessing (전처리 - Step 3)
| 구성요소 | 클래스 | 역할 |
|----------|--------|------|
| Controller | `PreprocessingController` | 구분자/불용어 설정, 키워드 추출 (구분자/NLP) |
| Service | `PreprocessingService` | 전처리 로직, 한국어 형태소 분석 (Open Korean Text) |
| Repository | `PreprocessingConfigRepository` | `preprocessing_configs` 컬렉션 |
| Model | `PreprocessingConfigDocument` | 전처리 설정 (구분자, 불용어 목록) |

#### 3.5.3 transform (데이터 변환 - Step 4)
| 구성요소 | 클래스 | 역할 |
|----------|--------|------|
| Controller | `TransformController` | 키워드 통계, 검색, 치환, 원본/결과 데이터 조회 |
| Service | `DataTransformService` | 키워드 집계, 치환 로직 |

#### 3.5.4 clustering (클러스터링 - Step 5)
| 구성요소 | 클래스 | 역할 |
|----------|--------|------|
| Controller | `ClusteringController` | 클러스터 생성, 병합/해제, 고급 검색, 키워드 계층 |
| Service | `ClusteringService` | 클러스터 생성/병합/해제 로직 |
| Repository | `ClusteringResultRepository` | `clustering_results` 컬렉션 |
| Model | `ClusteringResult` | 클러스터링 결과 엔티티 |

#### 3.5.5 detail-clustering (세부 클러스터링 - Step 7)
| 구성요소 | 클래스 | 역할 |
|----------|--------|------|
| Controller | `DetailClusteringController` | 세부 클러스터링 (cluster_sub_id 기반) |
| Service | `DetailClusteringService` | 세부 병합/해제 로직 |

#### 3.5.6 export (내보내기 - Step 6)
| 구성요소 | 클래스 | 역할 |
|----------|--------|------|
| Controller | `ExportController` | 전체/클러스터별 데이터 조회, Excel 내보내기, 세션 완료 |
| Service | `ExportService` | Excel 생성, S3 업로드, 세션 완료 처리 (비동기) |

#### 공통 데이터 모델
| Model | 컬렉션 | 역할 |
|-------|--------|------|
| `RawDataDocument` | `raw_data` | Lambda가 파싱한 원본 Excel 데이터 |
| `SessionDataDocument` | `session_data` | 계정 분석 후 필터링된 데이터 |
| `ProcessDataDocument` | `process_data` | 전처리 완료 데이터 |
| `ProcessViewData` | `process_view_data` | 프로세스 뷰 데이터 |
| `ColumnMappingDocument` | `column_mappings` | 컬럼 매핑 정보 |
| `SearchKeywordHierarchy` | `search_keyword_hierarchies` | 키워드 계층 (Lv1/Lv2/Lv3) |
| `ClusterStatistics` | `cluster_statistics` | 클러스터 통계 (3계층) |

### 3.6 costreduction (원가절감)

#### 3.6.1 dashboard (대시보드)
| 구성요소 | 클래스 | 역할 |
|----------|--------|------|
| Controller | `CostReductionDashboardController` | 대시보드 초기화, 상태/잠금 관리, 페이즈 전환 |
| Controller | `DashboardGenerationController` | 배치 데이터 생성 (cluster_statistics) |
| Controller | `ClusteringImportController` | 클러스터링 완료 Excel Import |
| Service | `CostReductionDashboardService` | 대시보드 상태 관리, 편집자 잠금 |
| Service | `DashboardGenerationService` | 병렬 스레드 기반 통계 생성 |
| Service | `ClusteringImportService` | Excel Import -> 대시보드 데이터 반영 |
| Repository | `CostReductionDashboardRepository` | `cost_reduction_dashboards` 컬렉션 |
| Model | `CostReductionDashboard` | 대시보드 상태 (페이즈, 잠금 정보) |

- 페이즈 흐름: `LONG_LIST` -> `SHORT_LIST` -> `ABLE_REGISTER` -> `ABLE_MANAGE` -> `COMPLETED_MANAGE`

#### 3.6.2 longlist (Long List)
| 구성요소 | 클래스 | 역할 |
|----------|--------|------|
| Controller | `LongListController` | 트리 데이터, 통계, 차트, 선택 저장, Raw 데이터 조회 |
| Service | `LongListService` | Long List 비즈니스 로직 |

#### 3.6.3 shortlist (Short List)
| 구성요소 | 클래스 | 역할 |
|----------|--------|------|
| Controller | `ShortListController` | 트리 데이터, 통계, 차트, 선택 저장, Raw 데이터 조회 |
| Service | `ShortListService` | Short List 비즈니스 로직 |

#### 3.6.4 abletask (Able Task)
| 구성요소 | 클래스 | 역할 |
|----------|--------|------|
| Controller | `AbleTaskController` | Task CRUD, 문서/링크 관리, 주간 진행 관리 |
| Service | `AbleTaskService` | Task 비즈니스 로직, 문서 업로드/다운로드 |
| Repository | `AbleTaskRepository` | `able_tasks` 컬렉션 |
| Repository | `TaskDocumentRepository` | `task_documents` 컬렉션 |
| Repository | `TaskWeeklyProgressRepository` | `task_weekly_progress` 컬렉션 |
| Model | `AbleTask` | Task 엔티티 (담당자, 절감액, 진행률 등) |
| Model | `TaskDocument` | Task 첨부 문서/링크 |
| Model | `TaskWeeklyProgress` | 주간 진행 보고 |

#### 공통 원가절감 모델
| Model | 컬렉션 | 역할 |
|-------|--------|------|
| `LongShortList` | `long_short_lists` | Long/Short List 선택 항목 |

### 3.7 common (공통)

| 구성요소 | 클래스 | 역할 |
|----------|--------|------|
| Controller | `CacheController` | Redis 연결 테스트, 세션/진행률 관리 |
| Controller | `SystemController` | 유지보수 상태, Lambda 진행률 조회 |
| Controller | `HealthController` | 헬스 체크, DB 상태 진단, 앱 정보 |
| Service | `RedisService` | Redis 캐시 공통 유틸리티 |
| Service | `S3Service` | S3 Presigned URL 생성, 파일 관리 |
| Service | `ExcelParserService` | Excel 파싱 공통 유틸리티 |

---

## 4. 인증/인가 아키텍처

### 4.1 JWT 토큰 흐름

```
[Client]                    [Spring Security]              [Backend]
   |                              |                            |
   |-- POST /api/auth/login ----->|                            |
   |                              |-- (permitAll) ------------>|
   |                              |                   AuthService.login()
   |                              |                   - 이메일/비밀번호 검증
   |                              |                   - 승인 상태 확인
   |                              |                   - Access Token 생성 (1시간)
   |                              |                   - Refresh Token 생성 (7일)
   |<---- LoginResponse ---------|<----------------------------|
   |  (accessToken, refreshToken) |                            |
   |                              |                            |
   |-- GET /api/projects -------->|                            |
   |  Authorization: Bearer {AT}  |                            |
   |                              |-- JwtAuthenticationFilter ->|
   |                              |   1. Authorization 헤더 추출 |
   |                              |   2. JWT 토큰 검증           |
   |                              |   3. UserPrincipal 생성      |
   |                              |   4. SecurityContext 설정    |
   |                              |-- (authenticated) --------->|
   |                              |              @CurrentUser UserPrincipal
   |<---- Response ---------------|<----------------------------|
   |                              |                            |
   |-- POST /api/auth/refresh --->|                            |
   |  { refreshToken: "..." }     |-- (permitAll) ------------>|
   |                              |          AuthService.refreshToken()
   |<---- New AccessToken --------|<----------------------------|
```

### 4.2 SecurityConfig 필터 체인

```java
SecurityFilterChain 구성:
  1. CSRF 비활성화 (REST API)
  2. CORS 설정 (localhost:3000, finance-tool.com, CloudFront 도메인)
  3. 세션 비활성화 (STATELESS - JWT 사용)
  4. 요청 권한 설정:
     - /api/auth/me -> authenticated
     - /api/auth/profile -> authenticated
     - /api/auth/profile/** -> authenticated
     - /api/auth/** -> permitAll (로그인, 회원가입, 토큰 갱신)
     - /actuator/health -> permitAll
     - /api/health/** -> permitAll
     - 그 외 모든 경로 -> authenticated (anyRequest().authenticated())
  5. JwtAuthenticationFilter 추가 (UsernamePasswordAuthenticationFilter 앞)
  6. 인증 실패 시 JSON 401 응답 (AuthenticationEntryPoint)
```

> **[Phase 3 피드백 반영] /api/system/* 경로 인증 설정 주의사항**
>
> `/api/system/**` 경로는 SecurityConfig에서 `permitAll`로 설정되어 있지 **않다**. `anyRequest().authenticated()` 규칙에 의해 **인증이 필요**하다. 그러나 프론트엔드 `systemService.js`는 `api.js`의 공통 Axios 인스턴스를 사용하지 않고 별도의 `axios`를 직접 사용하며, 인증 토큰이 없을 때 헤더를 생략하는 방어 코드가 존재한다. 이 경우 인증 토큰 없이 호출하면 **401 에러가 발생**한다.
>
> **현재 상태**: `/api/system/**`는 인증 필요 (authenticated)
> **영향**: 프론트엔드에서 토큰 없이 호출 시 401 실패 가능
> **개선 방안**:
> - (A안) `SecurityConfig`에 `.requestMatchers("/api/system/**").permitAll()` 추가
> - (B안) `systemService.js`가 공통 `api.js` 인스턴스를 사용하도록 수정

### 4.3 주요 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| `JwtTokenProvider` | JWT 토큰 생성/검증, 클레임 추출 (HMAC-SHA 서명) |
| `JwtAuthenticationFilter` | OncePerRequestFilter, 요청마다 JWT 검증 |
| `UserPrincipal` | Spring Security UserDetails 구현체 (id, email) |
| `@CurrentUser` | `@AuthenticationPrincipal` 메타 어노테이션 |
| `SecurityConfig` | Security Filter Chain, CORS, BCrypt 설정 |

---

## 5. 데이터 모델

### 5.1 MongoDB 컬렉션 구조

```
+-------------------+       +-------------------+       +-------------------+
|      users        |       |     projects      |       |   file_sessions   |
|-------------------|       |-------------------|       |-------------------|
| _id               |       | _id               |       | _id               |
| email (unique)    |<------| created_by        |       | session_id (uniq) |
| password (BCrypt) |       | project_id (uniq) |<------| project_id        |
| name              |       | project_name      |       | session_name      |
| role (USER/ADMIN) |       | description       |       | current_step      |
| is_approved       |       | project_type      |       | uploaded_files[]  |
| is_active         |       | members[] --------|------>|   - file_id       |
| created_at        |       |   - user_id       |       |   - s3_key        |
| last_login_at     |       |   - role          |       |   - row_count     |
+-------------------+       | is_completed      |       | total_row_count   |
                             | is_deleted        |       | editor_user_id    |
                             +-------------------+       | is_completed      |
                                                         | export_path       |
                                                         +--------+----------+
                                                                  |
                    +--------------------+       +----------------+---------------+
                    |     raw_data       |       |         session_data           |
                    |--------------------|       |--------------------------------|
                    | _id                |       | _id                            |
                    | project_id --------|       | project_id                     |
                    | session_id --------|       | session_id                     |
                    | upload_id          |       | raw_data_id --> raw_data._id   |
                    | row_number         |       | upload_id                      |
                    | data: { ... }      |       | data: { ... }                  |
                    | created_at         |       | is_hidden                      |
                    +--------------------+       +--------------------------------+
                                                              |
                    +--------------------+       +------------+-------------------+
                    |   process_data     |       |     clustering_results         |
                    |--------------------|       |--------------------------------|
                    | _id                |       | _id                            |
                    | project_id         |       | session_id                     |
                    | session_id         |       | cluster_number (unique/session) |
                    | raw_data_id        |       | cluster_id (-1=미병합, >0=소속) |
                    | data: { ... }      |       | cluster_sub_id (세부 병합)      |
                    | cluster_id         |       | cluster_name                   |
                    | cluster_name       |       | keywords[]                     |
                    | is_hidden          |       | count, total_amount            |
                    +--------------------+       | data_indices[]                 |
                                                 | supplier, department           |
                    +--------------------+       +--------------------------------+
                    | cluster_statistics |
                    |--------------------|       +--------------------------------+
                    | _id                |       | cost_reduction_dashboards      |
                    | project_id         |       |--------------------------------|
                    | session_id         |       | project_id (unique)            |
                    | level (1/2/3)      |       | current_phase                  |
                    | cluster_number     |       | is_list_locked                 |
                    | account_name       |       | editor_user_id                 |
                    | total_count        |       +--------------------------------+
                    | total_amount       |
                    | cost_center_count  |       +--------------------------------+
                    | supplier_count     |       |     long_short_lists           |
                    | cost_center_bkdn[] |       |--------------------------------|
                    | supplier_bkdn[]    |       | project_id (unique)            |
                    +--------------------+       | long_list_items[]              |
                                                 | short_list_items[]             |
                    +--------------------+       | is_locked                      |
                    |    able_tasks      |       +--------------------------------+
                    |--------------------|
                    | project_id         |       +--------------------------------+
                    | task_name          |       |     task_documents             |
                    | clusters[]         |       |--------------------------------|
                    | department         |       | task_id                        |
                    | manager            |       | type (link/file)               |
                    | base_amount        |       | name, url, s3_key              |
                    | expected_saving    |       +--------------------------------+
                    | actual_saving      |
                    | progress           |       +--------------------------------+
                    | status             |       |   task_weekly_progress         |
                    +--------------------+       |--------------------------------|
                                                 | task_id                        |
                                                 | week_number                    |
                                                 | progress_details, issues       |
                                                 +--------------------------------+
```

### 5.2 주요 엔티티 관계 요약

- **User (1) <-> Project (N)**: 사용자가 여러 프로젝트 생성 (created_by)
- **Project (1) <-> FileSession (N)**: 프로젝트에 여러 세션 포함 (project_id)
- **FileSession (1) <-> RawData (N)**: 세션에 여러 raw_data 행 (session_id)
- **FileSession (1) <-> ClusteringResult (N)**: 세션에 여러 클러스터 결과 (session_id)
- **ClusteringResult -> ClusterStatistics**: 세션 완료 시 통계 생성
- **Project (1) <-> CostReductionDashboard (1)**: 프로젝트당 1개 대시보드
- **Project (1) <-> LongShortList (1)**: 프로젝트당 1개 Long/Short List
- **Project (1) <-> AbleTask (N)**: 프로젝트에 여러 Task

---

## 6. 외부 연동

### 6.1 AWS S3

| 용도 | 버킷 | 설명 |
|------|------|------|
| Excel 업로드 | `finance-excel-uploads` | 프로젝트별 Excel 파일 저장 |
| Frontend 호스팅 | `lgcns-finance-frontend-app` | React SPA 정적 파일 (CloudFront Origin) |

**S3 키 구조**: `projects/{projectId}/sessions/{sessionId}/uploads/{uploadId}/{fileName}`

**주요 연동 포인트**:
- `S3Config`: S3Client, S3Presigner, SqsClient Bean 등록 (Lazy 초기화)
- `S3Service`: Presigned URL 생성, 파일 업로드/다운로드, S3 키 빌드
- `S3AdminService`: 관리자용 파일 목록/삭제, 고아 파일 정리
- `ExportService`: 결과 Excel을 S3에 업로드

### 6.2 AWS SQS

| 큐 | 용도 |
|----|------|
| `finance-excel-processing-queue` | Excel 파싱 청크 메시지 (Coordinator -> Worker) |
| `finance-excel-processing-dlq` | Dead Letter Queue (실패 메시지) |
| `ANALYSIS_QUEUE_URL` (환경 변수 참조) | 계정 분석 메시지 (Backend -> AccountAnalysisHandler) |

> **[Phase 3 피드백 반영] ANALYSIS_QUEUE_URL 환경 변수 현황**
>
> `application.yml`에서 `aws.sqs.analysis-queue-url: ${ANALYSIS_QUEUE_URL:}`로 정의되어 있으나, ECS Task Definition 환경 변수 목록에 `ANALYSIS_QUEUE_URL`이 **누락**되어 있다. 현재 기본값이 빈 문자열이므로, `SessionDataService.startAccountAnalysis()`에서 SQS 큐 URL이 비어있을 경우 **Fallback으로 `CompletableFuture.runAsync()`를 사용하여 ECS 내부 비동기 스레드로 실행**한다. 즉, Lambda `AccountAnalysisHandler`를 트리거하지 않고 ECS 자체에서 처리한다.
>
> 인프라에 `ANALYSIS_QUEUE_URL` 환경 변수와 해당 SQS 큐를 프로비저닝하면 Lambda 기반 비동기 처리로 전환 가능하다.

### 6.3 AWS Lambda

> **[Phase 3 피드백 반영] ExcelCoordinator 트리거 방식 명확화**
>
> 소스 코드 확인 결과, `ExcelCoordinatorHandler`는 `RequestStreamHandler`를 구현하며, 입력 스트림을 `S3EventDto` (S3 이벤트 구조체: `Records[].s3.bucket.name`, `Records[].s3.object.key`)로 파싱한다. 따라서 **S3 Event Notification이 직접 Lambda를 트리거하는 방식**이 정확하다. 인프라 문서에서 "SQS Trigger"로 기술한 부분은 인프라 문서 측에서 수정이 필요하다.

| 함수 | 트리거 | 역할 |
|------|--------|------|
| `ExcelCoordinatorHandler` | **S3 Event Notification** (PutObject) | S3EventDto를 파싱하여 bucket/key 추출, StAX로 Excel 행 수 분석, 50,000행 단위 청크 분할, SQS 메시지 발행 |
| `ExcelWorkerHandler` | SQS 이벤트 (`finance-excel-processing-queue`) | Excel 청크 파싱, raw_data MongoDB 삽입, 진행률 Redis 업데이트 |
| `AccountAnalysisHandler` | SQS 이벤트 (`ANALYSIS_QUEUE_URL`) | raw_data -> session_data 복사 (계정명 필터링), Redis 진행 상태 업데이트 |

> **[Phase 3 피드백 반영] AccountAnalysisHandler Lambda 현재 상태**
>
> - **소스 코드**: `lambda/src/main/java/com/example/lambda/worker/AccountAnalysisHandler.java`에 존재하며, `SQSEvent`를 입력으로 받는 `RequestHandler<SQSEvent, String>` 구현체이다.
> - **동작**: SQS 메시지에서 `type=ACCOUNT_ANALYSIS`인 메시지를 필터링하여 raw_data에서 session_data로 데이터를 복사한다. 10,000건 단위 배치 처리, Redis 진행 상태 업데이트를 수행한다.
> - **인프라 배포 상태**: 인프라 자원 목록(AWS Lambda)에 `ExcelCoordinator`와 `ExcelWorker`만 존재하며, `AccountAnalysisHandler`는 **미배포 상태로 추정**된다. 또한 트리거 SQS 큐(`ANALYSIS_QUEUE_URL`)도 인프라에 프로비저닝되지 않은 것으로 보인다.
> - **현재 운영 방식**: `SessionDataService`에서 `analysisQueueUrl`이 빈 문자열일 경우 Fallback으로 ECS 내부 `CompletableFuture.runAsync()`로 동기 스레드 처리한다. 따라서 현재는 Lambda 없이 ECS에서 직접 계정 분석을 수행 중이다.
> - **개선 방안**: 대용량 데이터 처리 시 ECS 리소스 부하를 줄이려면 별도 SQS 큐를 생성하고 `AccountAnalysisHandler` Lambda를 배포하여 비동기 처리로 전환해야 한다.

---

## 7. 비동기 처리 아키텍처

### 7.1 Excel 업로드 -> 파싱 흐름

```
[Frontend]                [Backend]              [AWS]
    |                        |                     |
    |-- 1. Presigned URL --->|                     |
    |<-- URL 응답 ----------|                     |
    |                        |                     |
    |-- 2. S3 직접 업로드 ---|-------------------->| S3 (finance-excel-uploads)
    |                        |                     |
    |-- 3. 업로드 완료 ----->|                     |
    |   (메타데이터 저장)     |                     |
    |                        |                     |
    |                        |   4. S3 이벤트 ---->| Lambda: ExcelCoordinator
    |                        |                     |  - StAX로 Excel 행 수 분석
    |                        |                     |  - 50,000행 단위 청크 분할
    |                        |                     |  - SQS 메시지 발행
    |                        |                     |
    |                        |                     | SQS: excel-processing-queue
    |                        |                     |  |
    |                        |                     |  v
    |                        |                     | Lambda: ExcelWorker (병렬 실행)
    |                        |                     |  - S3에서 Excel 다운로드
    |                        |                     |  - StreamingReader로 청크 파싱
    |                        |                     |  - raw_data MongoDB 삽입
    |                        |                     |  - Redis 진행률 업데이트
    |                        |                     |  - 완료 시 file_sessions 업데이트
    |                        |                     |
    |-- 5. 상태 폴링 ------>|                     |
    |   (GET /status/{id})   |-- Redis 조회 ------>| Redis: upload:status:{uploadId}
    |<-- 진행률 응답 --------|<--------------------|
```

### 7.2 계정 분석 흐름

```
[Frontend]                [Backend]              [AWS]
    |                        |                     |
    |-- 분석 시작 ---------->|                     |
    |   POST .../analyze     |-- SQS 메시지 발행 ->| SQS: analysis-queue
    |<-- { status: ok } ----|                     |
    |                        |                     | Lambda: AccountAnalysisHandler
    |                        |                     |  - raw_data에서 계정명 필터링
    |                        |                     |  - session_data에 복사
    |                        |                     |  - Redis 진행 상태 업데이트
    |                        |                     |
    |-- 상태 폴링 ---------->|                     |
    |   GET .../analyze/status|-- Redis 조회 ----->| Redis: analysis:status:{sessionId}
    |<-- 진행률 응답 --------|<--------------------|
```

### 7.3 세션 완료 흐름 (Export)

```
[Frontend]                [Backend]
    |                        |
    |-- POST .../complete -->|
    |                        |-- 비동기 스레드 시작
    |<-- { taskId } ---------|
    |                        |
    |                        |  [비동기 처리]
    |                        |  1. cluster_statistics 생성 (3계층)
    |                        |  2. Excel 파일 생성
    |                        |  3. S3 업로드
    |                        |  4. file_sessions 상태 업데이트
    |                        |  5. Redis 진행률 업데이트
    |                        |
    |-- 진행률 폴링 -------->|
    |   GET .../progress/{id}|-- Redis 조회
    |<-- { progress: 80 } --|
```

---

## 8. 설정 관리

### 8.1 application.yml 프로파일 구조

```yaml
# 공통 설정 (프로파일 무관)
spring.application.name: finance-backend
spring.profiles.active: ${SPRING_PROFILES_ACTIVE:local}  # 기본값: local

# Jackson: case-insensitive enum, Asia/Seoul timezone
# Multipart: max-file-size 1GB, max-request-size 1GB
# JWT: secret, access-token-expiration (1시간), refresh-token-expiration (7일)
# AWS: region (ap-northeast-2), S3 buckets, SQS queue URLs
# Actuator: health, info, metrics 노출

---
# local 프로파일
spring.data.mongodb.uri: mongodb://localhost:27017/finance
spring.data.redis.host: localhost (port 6379, SSL off)

---
# prod 프로파일
spring.data.mongodb.uri: mongodb://...docdb.amazonaws.com:27017/...
spring.data.redis.host: ...cache.amazonaws.com (port 6379)
```

### 8.2 주요 설정 항목

| 설정 | 값 | 설명 |
|------|-----|------|
| `jwt.secret` | `${JWT_SECRET:your-256-bit-secret-key-...}` | JWT 서명 키 (HMAC-SHA) |
| `jwt.access-token-expiration` | 3,600,000ms (1시간) | Access Token 유효 기간 |
| `jwt.refresh-token-expiration` | 604,800,000ms (7일) | Refresh Token 유효 기간 |
| `aws.region` | ap-northeast-2 | AWS 리전 (서울) |
| `aws.s3.excel-bucket` | finance-excel-uploads | Excel 파일 버킷 |
| `spring.servlet.multipart.max-file-size` | 1GB | 업로드 파일 크기 제한 |
| Redis pool max-active | 10 | Redis 연결 풀 최대 활성 |
| MongoDB maxSize | 30 | MongoDB 커넥션 풀 최대 크기 |
| DB Semaphore permits | 10 | 대량 DB 작업 동시 실행 제한 |

> **[Phase 3 피드백 반영] DB 비밀번호 평문 노출 - 보안 위험**
>
> `application.yml` prod 프로파일에 DocumentDB 비밀번호가 하드코딩되어 있으며 (`mongodb://dmillion:admin240401!@finance-docdb-cluster...`), ECS Task Definition에서도 `MONGODB_URI` 환경 변수로 평문 전달하고 있다. Git 저장소, AWS 콘솔, CloudTrail 로그 등에서 자격증명이 노출될 수 있다.
>
> **개선 방안**:
> 1. AWS Secrets Manager에 DB 자격증명을 저장
> 2. ECS Task Definition에서 `valueFrom`으로 Secrets Manager ARN을 참조
> 3. `application.yml`에서 환경 변수 참조로 변경: `spring.data.mongodb.uri: ${MONGODB_URI}`
> 4. Lambda 환경 변수도 동일하게 Secrets Manager 참조로 변경

> **[Phase 3 피드백 반영] JWT_SECRET 환경 변수 관리 방식**
>
> `application.yml`에서 `jwt.secret: ${JWT_SECRET:your-256-bit-secret-key-change-this-in-production-please-use-environment-variable}`로 정의되어 있다. `JWT_SECRET` 환경 변수가 설정되지 않으면 기본값(하드코딩된 키)이 사용된다.
>
> **현재 상태**: ECS Task Definition 환경 변수 목록에 `JWT_SECRET`이 **포함되어 있지 않다**. 따라서 프로덕션 환경에서 기본 시크릿 키가 그대로 사용될 가능성이 높으며, 이는 JWT 토큰 위조 위험을 야기한다.
>
> **개선 방안**:
> 1. AWS Secrets Manager에 JWT 시크릿을 저장
> 2. ECS Task Definition에 `JWT_SECRET` 환경 변수를 추가하고 `valueFrom`으로 Secrets Manager ARN 참조
> 3. 최소 256비트 이상의 강력한 랜덤 키 사용

### 8.3 초기화

- `AdminDataInitializer`: 애플리케이션 시작 시 관리자 계정 자동 생성 (admin/admin)
- `FinanceBackendApplication`: JVM 시간대 Asia/Seoul 설정, POI 배열 크기 300MB 상향

---

## 9. 예외 처리 전략

### 9.1 GlobalExceptionHandler

> **[Phase 3 피드백 반영] 에러 응답 형식 상세 기술**

`@RestControllerAdvice`로 전역 예외 처리를 수행하며, 모든 예외를 JSON 형태로 반환한다.

```
예외 처리 흐름:
  Controller -> Service -> Repository
       ^                       |
       |          예외 발생 시    |
       +--- GlobalExceptionHandler <---+
                    |
                    v
            JSON 에러 응답
```

**에러 응답 형식은 2가지가 존재한다:**

**(1) GlobalExceptionHandler 응답 형식** (Controller 레이어에서 발생하는 예외)

```json
{
  "success": false,
  "error": "HTTP_STATUS_NAME 또는 커스텀 에러코드",
  "message": "에러 메시지",
  "timestamp": "2026-03-19T10:30:00"
}
```

- `BusinessException`: `error` 필드에 커스텀 `errorCode` 사용 (예: `SESSION_NOT_FOUND`, `NO_FILES`)
- 기타 예외: `error` 필드에 HTTP 상태 이름 사용 (예: `CONFLICT`, `NOT_FOUND`, `UNAUTHORIZED`)
- `MethodArgumentNotValidException`: 추가로 `errors` 필드에 필드별 에러 맵 포함
- `HttpMessageNotReadableException`: 추가로 `details` 필드에 상세 메시지 포함

**(2) JwtAuthenticationEntryPoint 응답 형식** (Security 레이어에서 인증 실패 시)

```json
{
  "error": "UNAUTHORIZED",
  "message": "인증이 필요합니다. 토큰이 만료되었거나 유효하지 않습니다.",
  "status": 401
}
```

> **주의**: JwtAuthenticationEntryPoint의 응답에는 `success`, `timestamp` 필드가 **없고** `status` 필드가 **추가**되어 있다. GlobalExceptionHandler의 응답 형식과 구조가 다르므로, 프론트엔드에서 두 형식을 모두 처리해야 한다. 응답 형식 통일을 검토할 것을 권장한다.

### 9.2 커스텀 예외 구조

```
RuntimeException
  |
  +-- BusinessException (errorCode + message)
  |     - 비즈니스 로직 위반 시 사용
  |     - HTTP 400 BAD_REQUEST
  |
  +-- DuplicateEmailException
  |     - 이메일 중복 가입 시
  |     - HTTP 409 CONFLICT
  |
  +-- InvalidCredentialsException
  |     - 로그인 실패 (비밀번호 불일치, 미승인)
  |     - HTTP 401 UNAUTHORIZED
  |
  +-- UserNotFoundException
  |     - 사용자 조회 실패
  |     - HTTP 404 NOT_FOUND
  |
  +-- ProjectNotFoundException
  |     - 프로젝트 조회 실패
  |     - HTTP 404 NOT_FOUND
  |
  +-- AlreadyMemberException
        - 이미 프로젝트 멤버인 사용자 초대 시
        - HTTP 409 CONFLICT
```

### 9.3 예외 매핑 테이블

| 예외 클래스 | HTTP 상태 | 용도 |
|------------|-----------|------|
| `BusinessException` | 400 BAD_REQUEST | 비즈니스 로직 위반 (잠금 충돌, 유효하지 않은 상태 전환 등) |
| `DuplicateEmailException` | 409 CONFLICT | 이메일 중복 |
| `InvalidCredentialsException` | 401 UNAUTHORIZED | 인증 실패 |
| `UserNotFoundException` | 404 NOT_FOUND | 사용자 미존재 |
| `ProjectNotFoundException` | 404 NOT_FOUND | 프로젝트 미존재 |
| `AlreadyMemberException` | 409 CONFLICT | 멤버 중복 초대 |
| `MethodArgumentNotValidException` | 400 BAD_REQUEST | `@Valid` 검증 실패 (필드별 에러 포함) |
| `HttpMessageNotReadableException` | 400 BAD_REQUEST | JSON 파싱 오류 (잘못된 Enum 값 등) |
| `Exception` (fallback) | 500 INTERNAL_SERVER_ERROR | 예상하지 못한 서버 오류 |
