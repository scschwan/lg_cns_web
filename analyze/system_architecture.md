# Finance Tool - 시스템 통합 아키텍처 문서

> **작성일**: 2026-03-19 (최종 수정: 2026-04-03 서비스 개선 반영)
> **리전**: ap-northeast-2 (서울)
> **문서 목적**: 프론트엔드, 백엔드, 인프라 3개 계층의 아키텍처를 통합하여 전체 시스템 관점에서 조감한다.

---

## 1. 시스템 개요

### 1.1 프로젝트 목적

Finance Tool은 기업의 금융 데이터(Excel 기반)를 업로드, 전처리, 클러스터링, 분석하여 원가절감 과제를 도출하고 관리하는 웹 애플리케이션이다. 대용량 Excel 파일의 비동기 파싱, 한국어 형태소 분석 기반 키워드 추출, 다단계 클러스터링, Long/Short List 기반 원가절감 과제 관리를 핵심 기능으로 제공한다.

### 1.2 주요 기능 요약

| 영역 | 핵심 기능 |
|------|-----------|
| **데이터 처리 파이프라인** | 7단계 프로세스 (업로드 → 계정분석 → 전처리 → 변환 → 클러스터링 → 내보내기 → 상세 클러스터링) |
| **비동기 대용량 처리** | Lambda 기반 Excel 파싱 (50,000행 단위 청크 분할, 20,000건 배치 삽입) |
| **원가절감 관리** | Long List → Short List → Able 과제 등록/관리 → 완료 과제 관리 (5단계 페이즈) |
| **협업 기능** | Redis 기반 편집자 잠금 (Distributed Lock), 프로젝트 멤버 역할 관리 (OWNER/EDITOR/VIEWER) |
| **관리자 기능** | 사용자 승인/관리, 프로젝트 관리, S3 파일 관리, 세션 모니터링, 감사 로그 |

### 1.3 기술 스택 통합 요약

| 계층 | 기술 | 버전/사양 |
|------|------|-----------|
| **Frontend** | React + Vite, MUI + Radix UI + TailwindCSS, Axios, Recharts | React 18.2, Vite 7.3 |
| **Backend** | Spring Boot, Spring Security + JWT, Spring Data MongoDB, Apache POI, Open Korean Text | Spring Boot 3.5.9, Java 21 |
| **Serverless** | AWS Lambda (Java 21), SQS, S3 Event | ExcelCoordinator, ExcelWorker |
| **Database** | Amazon DocumentDB 5.0 (MongoDB 호환), ElastiCache Redis 7.1 | db.r8g.large, cache.t4g.small |
| **Infra** | CloudFront + WAF, ALB, ECS Fargate, S3, SQS, ECR | ap-northeast-2 |

---

## 2. 전체 시스템 아키텍처도

```
+====================================================================================+
|                              사용자 (Browser)                                       |
|                      React SPA (React 18.2 + Vite 7.3)                             |
+====================================================================================+
                                      |
                                      | HTTPS
                                      v
+====================================================================================+
|  CloudFront (d3ipfpkjg02npk.cloudfront.net)                                        |
|  [WAF 활성화] [HTTPS redirect] [HTTP/2] [PriceClass_All]                            |
|                                                                                     |
|  Cache Behavior:                                                                    |
|    /* (Default) ──────> S3 Origin (정적 파일)                                        |
|    /api/* ────────────> ALB Origin (API 프록시, 캐시 비활성화)                         |
+====================================================================================+
         |                                              |
         | /* (Default)                                  | /api/*
         v                                              v
+---------------------+                  +----------------------------------+
| S3 Static Website   |                  | ALB (finance-alb)                |
| lgcns-finance-      |                  | internet-facing                  |
| frontend-app        |                  | Public Subnet 1a, 1c             |
| [React SPA Build]   |                  | [Round Robin → ECS Tasks]        |
+---------------------+                  +----------------------------------+
                                                        |
                                                        | HTTP:8080
                                                        v
                                         +----------------------------------+
                                         | ECS Fargate (finance-api)        |
                                         | 2 Tasks x (2vCPU / 4GB)         |
                                         | Spring Boot 3.5.9 / Java 21     |
                                         | Private Subnet 1a, 1c            |
                                         | [JWT 인증] [7개 도메인] [218 API] |
                                         +----------------------------------+
                                            |       |       |       |
                       +--------------------+   +---+   +---+   +---+------+
                       v                        v       v       v          |
                 +-----------+           +-------+ +--------+ +------+    |
                 | DocumentDB|           | Redis | | S3     | | SQS  |    |
                 | 5.0       |           | 7.1   | | Excel  | |      |    |
                 | db.r8g.lg |           |t4g.sm | | Uploads| |      |    |
                 | AZ: 2c    |           |AZ: 2c | |        | |      |    |
                 +-----------+           +-------+ +--------+ +--+---+    |
                       ^                    ^          ^          |        |
                       |                    |          |          |        |
                       |                    |          |     SQS Trigger   |
                       |                    |          |          |        |
                       |                    |          |          v        |
                       |                    |          |   +------------+  |
                       |                    |          |   | Lambda     |  |
                       |                    |          +---| Coordinator|  |
                       |                    |              | (Java 21)  |  |
                       |                    |              +-----+------+  |
                       |                    |                    |         |
                       |                    |              Lambda Invoke   |
                       |                    |                    |         |
                       |                    |                    v         |
                       |                    |              +------------+  |
                       +--------------------+--------------| Lambda     |  |
                                                           | Worker     |  |
                                                           | (Java 21)  |  |
                                                           +------------+  |
                                                                           |
                                         +----------------------------------+
                                         | NAT Gateway (AZ: 2a)             |
                                         | [Private→Internet 아웃바운드]      |
                                         +----------------------------------+
```

---

## 3. 계층별 아키텍처 요약

### 3.1 프론트엔드 계층

React 18.2 기반 SPA로, CloudFront + S3를 통해 서빙된다. MUI(데이터 그리드, 폼)와 Radix UI + TailwindCSS(Shadcn/UI 패턴)를 혼용하며, Axios 인터셉터로 JWT 자동 갱신과 에러 핸들링을 처리한다.

| 모듈 | 역할 | 주요 기술 |
|------|------|-----------|
| **인증** | JWT 로그인/회원가입, 세션 검증 (1분 주기) | AuthContext, localStorage |
| **데이터 처리 7단계** | 업로드 → 분석 → 전처리 → 변환 → 클러스터링 → 내보내기 → 상세 | DashboardLayout, Sidebar |
| **원가절감** | Long/Short List, Able 과제 등록/관리 | CostReductionLayout |
| **관리자** | 사용자/프로젝트/S3/세션/감사로그 관리 | AdminLayout |
| **편집자 잠금** | Redis 기반 Distributed Lock (30초 heartbeat, 60초 TTL) | useEditorLock, useSessionEditorLock |
| **API 서비스** | 12개 서비스 모듈, 공통 Axios 인터셉터 | api.js + 도메인별 서비스 |

### 3.2 백엔드 계층

Spring Boot 3.5.9 / Java 21 기반 REST API 서버로, ECS Fargate에서 2 Task로 운영된다. JWT Stateless 인증, 7개 도메인, 총 218개 API 엔드포인트를 제공한다.

| 도메인 | 컨트롤러 수 | 주요 기능 |
|--------|------------|-----------|
| **auth** | 1 | 회원가입, 로그인, JWT 토큰 발급/갱신 |
| **admin** | 1 | 사용자 관리, 프로젝트 관리, S3/세션/감사로그 관리, 유지보수 모드 |
| **project** | 1 | 프로젝트 CRUD, 멤버 관리 (OWNER/EDITOR/VIEWER) |
| **upload** | 2 | Presigned URL 발급, 파일 업로드/분석, 세션 CRUD, 편집자 잠금 |
| **data** | 5 | 전처리 (NLP), 데이터 변환 (키워드 치환), 클러스터링, 상세 클러스터링, 내보내기 |
| **costreduction** | 5 | 대시보드 상태 관리, Long/Short List, Able 과제 CRUD, 클러스터링 Import |
| **common** | 3 | Redis 캐시, S3 유틸, 헬스 체크, 시스템 상태 |

### 3.3 데이터 계층

| 저장소 | 용도 | 주요 컬렉션/데이터 |
|--------|------|-------------------|
| **DocumentDB 5.0** | 영속 데이터 저장 (MongoDB 호환) | users, projects, file_sessions, raw_data, session_data, process_data, clustering_results, cluster_statistics, cost_reduction_dashboards, long_short_lists, able_tasks 등 20+ 컬렉션 |
| **Redis 7.1** | 캐시, 분산 잠금, 진행률 상태 | 편집자 잠금 (TTL 60초), 업로드/분석 진행률, 세션 데이터 캐시 |
| **S3** | 파일 저장소 | Excel 원본 (`finance-excel-uploads`), 내보내기 결과, Task 첨부 문서 |

### 3.4 인프라 계층

| 서비스 | 구성 | 역할 |
|--------|------|------|
| **CloudFront** | WAF 활성화, PriceClass_All | CDN + SPA 호스팅 + API 프록시 |
| **ALB** | internet-facing, 2 AZ | 백엔드 트래픽 분산 |
| **ECS Fargate** | 2 Task (2vCPU/4GB), Rolling Deploy | Spring Boot 컨테이너 실행 |
| **Lambda** | Java 21, 1024MB, 15분 Timeout | Excel 대용량 비동기 처리 |
| **SQS** | Processing Queue + DLQ | 비동기 메시지 큐 (VT 30분, DLQ 3회 재시도) |
| **VPC** | 10.0.0.0/16, 2 AZ (2a, 2c), Public/Private Subnet | 네트워크 격리 |

---

## 4. 핵심 데이터 흐름

### 4.1 사용자 인증 흐름

```
[Browser]                    [CloudFront]        [ALB]         [ECS/Spring Boot]       [DocumentDB]
    |                             |                 |                  |                      |
    |-- POST /api/auth/login ---->|--- /api/* ----->|--- :8080 ------->|                      |
    |   {email, password}         |                 |                  |-- BCrypt 검증 ------->|
    |                             |                 |                  |<-- User 조회 ---------|
    |                             |                 |                  |                      |
    |                             |                 |                  |-- JWT Access Token   |
    |                             |                 |                  |   (1시간) 생성        |
    |                             |                 |                  |-- JWT Refresh Token  |
    |<--- {accessToken, ----------|<----------------|<-----------------|   (7일) 생성          |
    |      refreshToken}          |                 |                  |                      |
    |                             |                 |                  |                      |
    |== 이후 모든 API 요청 ========|=================|==================|                      |
    |   Authorization: Bearer AT  |                 |                  |                      |
    |-- GET /api/projects ------->|--- /api/* ----->|--- :8080 ------->|                      |
    |                             |                 |  JwtAuthFilter   |                      |
    |                             |                 |  → JWT 검증       |                      |
    |                             |                 |  → UserPrincipal |                      |
    |<--- 응답 -------------------|<----------------|<-----------------|                      |
    |                             |                 |                  |                      |
    |== Access Token 만료 시 =====|=================|==================|                      |
    |   (프론트엔드 30초 버퍼)      |                 |                  |                      |
    |-- POST /api/auth/refresh -->|--- /api/* ----->|--- :8080 ------->|                      |
    |   {refreshToken}            |                 |                  |-- 새 AT 발급          |
    |<--- {newAccessToken} -------|<----------------|<-----------------|                      |
```

### 4.2 파일 업로드 및 비동기 처리 흐름

```
[Browser]              [ECS/Spring Boot]        [S3]           [SQS]        [Lambda]          [DocumentDB]  [Redis]
    |                        |                    |               |              |                  |           |
    |-- Presigned URL 요청 ->|                    |               |              |                  |           |
    |<-- URL + uploadId -----|                    |               |              |                  |           |
    |                        |                    |               |              |                  |           |
    |-- PUT (Presigned URL) =====================>|               |              |                  |           |
    |   [Excel 파일 직접 업로드]                    |               |              |                  |           |
    |                        |                    |               |              |                  |           |
    |-- 업로드 완료 통보 ---->|                    |               |              |                  |           |
    |                        |-- 메타데이터 저장 --|---------------|--------------|----------------->|           |
    |                        |                    |               |              |                  |           |
    |                        |                    |== S3 Event ==>|              |                  |           |
    |                        |                    |               | SQS Trigger  |                  |           |
    |                        |                    |               |==============>|                  |           |
    |                        |                    |               |              |                  |           |
    |                        |                    |               |     ExcelCoordinator            |           |
    |                        |                    |               |     - 행 수 분석 (StAX)          |           |
    |                        |                    |               |     - 50,000행 단위 청크 분할     |           |
    |                        |                    |               |<-- 청크 메시지|                  |           |
    |                        |                    |               |              |                  |           |
    |                        |                    |               |== SQS ======>|                  |           |
    |                        |                    |               |              |                  |           |
    |                        |                    |<== GetObject ==|  ExcelWorker |                  |           |
    |                        |                    |               |  - 20,000건 배치 파싱            |           |
    |                        |                    |               |              |-- raw_data 삽입 ->|           |
    |                        |                    |               |              |-- 진행률 저장 ----|---------->|
    |                        |                    |               |              |                  |           |
    |-- 상태 폴링 (1초) ---->|                    |               |              |                  |           |
    |   GET /status/{id}     |-- Redis 조회 ------|---------------|--------------|------------------|---------->|
    |<-- {progress: 75%} ----|<-------------------|---------------|--------------|------------------|-----------|
    |                        |                    |               |              |                  |           |
    |                        |              실패 시: 3회 재시도 후 DLQ 이동 (보존 14일)              |           |
```

### 4.3 데이터 분석 파이프라인 흐름

```
Step 1: 파일 업로드                Step 2: 계정 분석               Step 3: 전처리
+------------------+              +------------------+             +------------------+
| S3 업로드        |              | raw_data →       |             | 구분자/불용어 설정 |
| Lambda 파싱      |  ========>   | session_data 복사|  ========>  | 키워드 추출 (NLP) |
| raw_data 생성    |              | 계정명 필터링     |             | process_data 생성|
+------------------+              +------------------+             +------------------+
                                                                          |
                                                                          v
Step 6: 내보내기                  Step 5: 클러스터링               Step 4: 데이터 변환
+------------------+              +------------------+             +------------------+
| Excel 생성       |              | 클러스터 생성     |             | 키워드 통계       |
| S3 업로드        |  <========   | 병합/해제/검색    |  <========  | 키워드 검색/치환  |
| 세션 완료        |              | 통계 생성        |             | 원본 데이터 조회  |
+------------------+              +------------------+             +------------------+
        |                                |
        v                                v
Step 7: 상세 클러스터링           원가절감 대시보드
+------------------+              +------------------+
| 병합 클러스터 내  |              | LONG_LIST →      |
| 세부 클러스터링   |              | SHORT_LIST →     |
| (선택적)         |              | ABLE_REGISTER →  |
+------------------+              | ABLE_MANAGE →    |
                                  | COMPLETED_MANAGE |
                                  +------------------+
```

### 4.4 원가절감 흐름

```
[클러스터링 완료 세션]
        |
        v
+------------------+     cluster_statistics (3계층) 기반
| 대시보드 초기화   | --> 배치 데이터 생성 (병렬 스레드)
| 또는 Excel Import |     또는 클러스터링 결과 Excel Import
+------------------+
        |
        v
+------------------+     트리 구조 데이터 조회 → 통계/차트 분석 → 항목 선택 저장
| Long List 도출   |     (account_name 기반 3계층 통계)
+------------------+
        |
        v
+------------------+     Long List 선택 항목 기반 세부 분석 → 항목 선택 저장
| Short List 도출  |
+------------------+
        |
        v
+------------------+     과제 생성 → 담당자/절감액 설정 → 문서 첨부 (S3)
| Able 과제 등록   |
+------------------+
        |
        v
+------------------+     주간 진행 현황 기록 → 과제 수정/삭제 → 진행률 관리
| Able 과제 관리   |
+------------------+
        |
        v
+------------------+     완료된 과제 현황 조회 및 관리
| 완료 과제 관리   |
+------------------+
```

---

## 5. API 연동 매트릭스

### 5.1 프론트엔드 페이지 ↔ 백엔드 API ↔ 인프라 서비스 매핑

| 프론트엔드 페이지 | 백엔드 API (Controller) | 인프라 서비스 | API 수 |
|------------------|------------------------|-------------|--------|
| LoginPage / RegisterPage | AuthController (`/api/auth/*`) | ECS → DocumentDB | 7 |
| ProjectsPage / ProjectSettingsPage | ProjectController (`/api/projects/*`) | ECS → DocumentDB | 10 |
| MultiFileUploadPage (Step 1) | UploadController + FileSessionController | ECS → S3 (Presigned URL), SQS, Lambda, DocumentDB, Redis | 52 |
| StartAnalysisPage (Step 2) | FileSessionController (sessions/analyze) | ECS → DocumentDB, Redis (진행률) | - |
| PreprocessingPage (Step 3) | PreprocessingController | ECS → DocumentDB (process_data) | 8 |
| DataTransformPage (Step 4) | TransformController | ECS → DocumentDB | 5 |
| ClusteringPage (Step 5) | ClusteringController | ECS → DocumentDB | 24 |
| ExportPage (Step 6) | ExportController | ECS → DocumentDB, S3 (Excel 내보내기), Redis | 12 |
| DetailClusteringPage (Step 7) | DetailClusteringController | ECS → DocumentDB | 18 |
| LongListPage | LongListController + DashboardController | ECS → DocumentDB (cluster_statistics) | 20 |
| ShortListPage | ShortListController + DashboardController | ECS → DocumentDB | 20 |
| AbleTaskRegisterPage | AbleTaskController | ECS → DocumentDB, S3 (문서) | 13 |
| AbleTaskManagePage / CompletedTaskManagePage | AbleTaskController | ECS → DocumentDB | - |
| Admin 페이지 (6개) | AdminController | ECS → DocumentDB, S3, Redis | 19 |
| 전역 (MaintenanceDialog) | SystemController | ECS → Redis (Lambda 상태) | 2 |
| **합계** | **20 Controllers** | | **~218** |

### 5.2 비동기 처리 연동

| 트리거 | 대상 | 인프라 서비스 | 비고 |
|--------|------|-------------|------|
| S3 PutObject (Excel 업로드) | ExcelCoordinator Lambda | S3 → Lambda | 50,000행 단위 청크 분할 |
| SQS 메시지 (청크) | ExcelWorker Lambda | SQS → Lambda | 20,000건 배치 파싱 |
| ECS 내부 비동기 (Fallback) | 계정 분석 처리 | CompletableFuture | AccountAnalysisHandler Lambda 미배포 시 |
| ECS 내부 비동기 | 세션 완료 처리 (Export) | 비동기 스레드 | cluster_statistics 생성 + Excel 생성 |

---

## 6. 보안 아키텍처 통합

### 6.1 네트워크 보안

```
[Internet] ──HTTPS──> [CloudFront + WAF] ──HTTP──> [ALB (Public Subnet)]
                                                        |
                                                   TCP 8080
                                                        |
                                              [ECS (Private Subnet)]
                                                   |          |
                                             TCP 27017    TCP 6379
                                                   |          |
                                            [DocumentDB]  [Redis]
                                           (Private Sub)  (Private Sub)
```

| 보안 계층 | 구성 | 상태 |
|-----------|------|------|
| **WAF** | CloudFront 연동, SQL Injection/XSS 방어 | 활성화 |
| **Security Group 체이닝** | ALB→ECS(8080), ECS→DocumentDB(27017), ECS/Lambda→Redis(6379) | 구성 완료 |
| **VPC 격리** | Public Subnet (ALB, NAT, Bastion) / Private Subnet (ECS, Lambda, DB) | 구성 완료 |
| **Bastion Host** | SSH 접근 IP 제한 (61.36.232.75/32) | 구성 완료 |

### 6.2 애플리케이션 보안

| 항목 | 구현 | 상태 |
|------|------|------|
| **인증** | JWT (Access 1시간 / Refresh 7일), HMAC-SHA 서명 | 구현 완료 |
| **인가** | Spring Security Filter Chain, 역할 기반 (USER/ADMIN) | 구현 완료 |
| **비밀번호** | BCrypt 해싱 | 구현 완료 |
| **CORS** | localhost:3000, CloudFront 도메인, finance-tool.com 허용 | 구현 완료 |
| **CSRF** | REST API 특성상 비활성화 (Stateless) | 의도적 비활성화 |
| **토큰 자동 갱신** | Axios 인터셉터 기반 사전 갱신 + 401 후속 갱신 | 구현 완료 |

### 6.3 데이터 보안

| 서비스 | 저장 시 암호화 | 전송 중 암호화 | 인증 |
|--------|-------------|-------------|------|
| DocumentDB | KMS 암호화 | TLS 비활성화 | 자격증명 (평문 URI) |
| Redis | 비활성화 | 비활성화 | Auth Token 미적용 |
| S3 | SSE (기본) | HTTPS | IAM Role |
| CloudFront→사용자 | N/A | HTTPS (redirect) | N/A |
| CloudFront→ALB | N/A | **HTTP (평문)** | N/A |

---

## 7. 배포 아키텍처

### 7.1 프론트엔드 배포

```
[개발자 로컬] ── npm run build ──> [build/]
                                       |
                   (1) 정적 자산 (JS/CSS/이미지): Cache-Control: max-age=31536000, immutable
                   (2) index.html: Cache-Control: no-cache, no-store, must-revalidate
                                       |
                                  aws s3 sync
                                       |
                                       v
                              [S3: lgcns-finance-frontend-app]
                                       |
                              CloudFront Invalidation (/*)
                                       |
                                       v
                              [CloudFront Edge 갱신 완료]
```

- Vite Content Hash 기반 파일명으로 효율적 캐시 무효화 구현
- `index.html`만 항상 최신 번들을 참조하도록 no-cache 설정

### 7.2 백엔드 배포

```
[개발자 로컬]
    |
    | (1) version.txt Patch 자동 증가 + Git Push
    | (2) Gradle clean build -x test (Spring Boot + Lambda 동시 빌드)
    |
    v
[Spring Boot 배포] ─────────────────────────────────────────
    |
    | (3) Docker Build (eclipse-temurin:21-jre-alpine)
    | (4) ECR Login → (5) Docker Tag → (6) ECR Push
    | (7) Task Definition 새 Revision 등록 (PLACEHOLDER_IMAGE → 실제 URI 치환)
    | (8) ECS Service 업데이트 (Rolling, --force-new-deployment)
    |     minimumHealthyPercent: 100%, maximumPercent: 200%
    |     Circuit Breaker 활성화 (자동 rollback)
    |
    v
[Lambda 배포] ──────────────────────────────────────────────
    |
    | (9)  finance-lambda.zip 확인
    | (10) ExcelCoordinator 코드 배포 → (11) 구성 업데이트 (1024MB, 900s)
    | (12) ExcelWorker 코드 배포 → (13) 구성 업데이트 (1024MB, 900s)
    |
    v
[검증] ─────────────────────────────────────────────────────
    |
    | (14) ECS 배포 상태 확인 (30초 간격, 최대 10회 폴링)
    |      Running Count == Desired Count 확인
    v
[완료] ECR 이미지 태그: v{Major}.{Minor}.{Patch} (현재: v1.1.306)
```

### 7.3 Lambda 배포

Lambda 함수는 백엔드 배포 스크립트(`deploy.ps1`)에 포함되어 동시 배포된다. Gradle 멀티프로젝트 빌드로 `finance-lambda.zip`을 생성하고, AWS CLI를 통해 코드 업데이트 및 구성 변경을 수행한다.

---

## 8. 모니터링 및 운영

### 8.1 Health Check 체계

```
[CloudFront] ──cache behavior──> [ALB] ──health check──> [ECS Container]
                                   |                         |
                                   | /actuator/health        | wget --spider
                                   | Interval: 30s           | http://localhost:8080
                                   | Healthy: 2              | /actuator/health
                                   | Unhealthy: 2            | Interval: 30s
                                   |                         | Retries: 3
                                   v                         | Start Period: 120s
                              [Target Group]                 v
                              finance-backend-tg         [Spring Boot Actuator]
```

- **이중 Health Check**: ALB Target Group Level + ECS Container Level 모두 `/actuator/health` 사용
- **JVM 워밍업 대기**: Start Period 120초로 Cold Start 허용
- **Circuit Breaker**: ECS Deployment에 활성화, 실패 시 자동 rollback

### 8.2 로깅

| Log Group | 소스 | 설명 |
|-----------|------|------|
| `/ecs/finance-backend-task` | ECS Fargate | Spring Boot 애플리케이션 로그 |
| `/aws/lambda/ExcelCoordinator` | Lambda | Excel 처리 Coordinator 로그 |
| `/aws/lambda/ExcelWorker` | Lambda | Excel 처리 Worker 로그 |
| DocumentDB audit/profiler | DocumentDB | 감사 로그, 프로파일러 로그 |

### 8.3 주요 모니터링 지표

| 지표 | 대상 | 임계값/기준 |
|------|------|------------|
| CPU/Memory 사용률 | ECS Task | JVM MaxRAMPercentage 75% (최대 힙 ~3GB) |
| DocumentDB 커넥션 수 | DocumentDB | ECS 2 Task x 30 = 60 + Lambda 동시 실행 |
| Redis 메모리 사용률 | Redis (1.37GB) | 편집자 잠금 + 진행률 + 세션 캐시 |
| SQS DLQ 메시지 수 | DLQ | 0건 유지 (현재 1건 잔류) |
| Lambda 실행 시간 | ExcelCoordinator/Worker | Timeout 900초, Cold Start 10~30초 |
| ALB 5xx 응답률 | ALB | 연속 에러 시 프론트엔드 경고 (임계값 5회) |
| Performance Insights | DocumentDB | 활성화됨, 쿼리 병목 분석 |

---

## 9. 알려진 이슈 및 개선 권장사항

### 9.1 Critical 이슈

| # | 이슈 | 영향 | 권장 조치 |
|---|------|------|-----------|
| C-1 | **DocumentDB Single AZ** (2c) | AZ 2c 장애 시 전체 서비스 중단. 20+ 컬렉션의 업무 데이터 접근 불가. | AZ 2a에 Reader Replica 추가하여 Multi-AZ + 자동 Failover 구성 |
| C-2 | **Redis 단일 노드** (2c, 인증/암호화 미적용) | 장애 시 편집자 잠금 충돌, 진행률 확인 불가, DocumentDB 부하 증가. VPC 내 무인증 접근 가능. | Replication Group 전환 (Automatic Failover) + AUTH Token + TLS 활성화 |
| C-3 | **DB 자격증명 평문 노출** | MONGODB_URI에 비밀번호 하드코딩 (application.yml, ECS Task Def, Lambda 환경 변수). Git/콘솔/CloudTrail 노출 위험. | AWS Secrets Manager로 이관, ECS는 `valueFrom`으로 참조 |
| C-4 | **ALB 직접 접근 가능** | CloudFront WAF 우회 가능 (ALB SG가 0.0.0.0/0 허용) | ALB SG를 CloudFront Managed Prefix List로 제한 또는 커스텀 헤더 검증 |
| C-5 | **AccountAnalysisHandler Lambda 미배포** | Step 2 계정 분석이 Lambda가 아닌 ECS Fallback (CompletableFuture)으로 실행. 대용량 시 ECS 리소스 부하. | Lambda 배포 + ANALYSIS_QUEUE_URL SQS 큐 프로비저닝 |
| C-6 | **JWT_SECRET 환경 변수 미설정** | ECS Task Definition에 JWT_SECRET 누락. 기본 하드코딩 키 사용 시 토큰 위조 위험. | Secrets Manager에 강력한 랜덤 키 저장, ECS 환경 변수 추가 |
| C-7 | **관리자 기본 계정** (admin/admin) | AdminDataInitializer가 프로덕션에서도 기본 계정 생성. | 프로덕션 프로파일에서 초기화 비활성화 또는 초기 배포 후 즉시 비밀번호 변경 |
| C-8 | **addFilesToSession API URL 불일치** | 프론트엔드 `/files` vs 백엔드 `/add-files`. 세션에 파일 추가 시 404 발생. | 양측 URL 통일 |
| C-9 | **systemService 인증 불일치** | 프론트엔드가 토큰 없이 호출 시도하나, 백엔드 SecurityConfig에서 `/api/system/**`은 인증 필요. | SecurityConfig에 permitAll 추가 또는 systemService.js가 공통 인터셉터 사용 |

### 9.2 Warning 이슈

| # | 이슈 | 권장 조치 |
|---|------|-----------|
| W-1 | NAT Gateway 단일 AZ (2a) | AZ 2c에 NAT Gateway 추가, Route Table 분리 |
| W-2 | CloudFront→ALB HTTP 통신 (JWT 평문 전송) | ALB에 ACM 인증서 적용, Origin Protocol HTTPS 변경 |
| W-3 | DocumentDB TLS 비활성화 | TLS 활성화 (finance-docdb-no-tls → TLS 활성화 Parameter Group) |
| W-4 | ECS Auto Scaling 미구성 (고정 2 Task) | CPU/Memory 기반 Target Tracking 정책 (최소 2, 최대 4) |
| W-5 | Lambda JVM 옵션 불일치 (-Xmx1536m > Lambda 1024MB) | -Xmx768m으로 조정 또는 Lambda 메모리 1536MB 상향 |
| W-6 | DLQ 모니터링/알림 미구성 (현재 1건 잔류) | CloudWatch Alarm + SNS 알림 구성 |
| W-7 | Lambda Provisioned Concurrency 미설정 (Java Cold Start 10~30초) | SnapStart 적용 또는 Provisioned Concurrency 1~2 설정 |
| W-8 | ExcelCoordinator 트리거 방식 문서 불일치 (S3 Event vs SQS) | 실제 구현 확인 후 문서 통일 |
| W-9 | CORS 설정 불일치 (finance-tool.com이 S3 CORS에 미포함) | S3 CORS에 커스텀 도메인 추가 |
| W-10 | Actuator 엔드포인트 노출 (/metrics, /info) | CloudFront에서 /actuator/* 차단 또는 접근 제한 |
| W-11 | 401 에러 응답 형식 불일치 (JwtAuthEntryPoint vs GlobalExceptionHandler) | 에러 응답 형식 통일 |
| W-12 | .env.production 누락 시 localhost:8080 폴백 | 빌드 스크립트에서 .env.production 존재 사전 검증 |
| W-13 | DocumentDB SG에 VPC CIDR(10.0.0.0/16) 허용 | finance-lambda-sg 명시 추가 후 CIDR 규칙 제거 |

### 9.3 우선순위별 개선 로드맵

**Phase 1 - 즉시 조치 (보안 위험)**
1. DB 자격증명 Secrets Manager 이관 (C-3)
2. JWT_SECRET 환경 변수 설정 (C-6)
3. ALB 접근 제한 (C-4)
4. addFilesToSession URL 수정 (C-8)
5. systemService 인증 정합성 해결 (C-9)

**Phase 2 - 단기 조치 (가용성)**
1. DocumentDB Multi-AZ 구성 (C-1)
2. Redis Replication Group 전환 + 인증/암호화 (C-2)
3. NAT Gateway 이중화 (W-1)
4. CloudFront→ALB HTTPS 적용 (W-2)

**Phase 3 - 중기 조치 (운영 안정성)**
1. AccountAnalysisHandler Lambda 배포 (C-5)
2. ECS Auto Scaling 구성 (W-4)
3. DLQ 모니터링 알림 구성 (W-6)
4. Lambda Provisioned Concurrency / SnapStart (W-7)

**Phase 4 - 장기 개선 (코드 품질)**
1. 에러 응답 형식 통일 (W-11)
2. 문서 불일치 해소 (W-8)
3. CORS/SG 설정 정리 (W-9, W-13)
4. Actuator 접근 제한 (W-10)

---

## 10. 문서 참조

| 문서 | 경로 | 설명 |
|------|------|------|
| 인프라 아키텍처 | `analyze/infra/architecture.md` | AWS 인프라 구성, 네트워크, 보안, 배포 파이프라인 상세 |
| AWS 자원 분석 | `analyze/infra/aws_resources.md` | AWS 자원 목록 및 설정값 원본 데이터 |
| 백엔드 아키텍처 | `analyze/backend/architecture.md` | Spring Boot 레이어드 아키텍처, 도메인 구조, 데이터 모델, 비동기 처리 |
| API 엔드포인트 | `analyze/backend/api_endpoints.md` | REST API 218개 엔드포인트 전수 목록 |
| 프론트엔드 아키텍처 | `analyze/frontend/architecture.md` | React SPA 컴포넌트 구조, 상태 관리, API 서비스 레이어 |
| 페이지 라우팅 | `analyze/frontend/page_routing.md` | 페이지별 라우팅, 컴포넌트, API 매핑 |
| 인프라 피드백 | `analyze/infra/feedback.md` | 인프라 관점 크로스 리뷰 (Critical 5, Warning 13) |
| 백엔드 피드백 | `analyze/backend/feedback.md` | 백엔드 관점 크로스 리뷰 (Critical 2, Warning 9) |
| 프론트엔드 피드백 | `analyze/frontend/feedback.md` | 프론트엔드 관점 크로스 리뷰 (Critical 1, Warning 4) |
