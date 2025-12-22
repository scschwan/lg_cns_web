# 프로젝트 단위 개발 체크리스트

> **📋 이 문서 사용 규칙**
>
> 1. ✅ 완료된 항목만 `⬜` → `✅`로 변경
> 2. ✅ 신규 항목 추가만 가능
> 3. ❌ 기존 내용 수정 금지
> 4. ✅ 모든 개발 세션에서 이 문서를 열어 체크
> 5. ✅ Git commit 메시지: "chore: update checklist [Phase X]"

**문서 버전:** 2.1  
**최초 작성일:** 2025-12-16  
**마지막 업데이트:** 2025-12-19 01:00 KST

---

## 📊 전체 진행률

```
Phase 0: [30/30] (100%)  - 인증 및 프로젝트 관리 ✅
Phase 1: [35/35] (100%)  - 대용량 파일 업로드 ✅
Phase 2: [ 0/63] (  0%)  - 비즈니스 로직 구현 ⭐ v2.0 수정
Phase 3: [ 0/20] (  0%)  - UI 구현

전체:    [65/148] ( 44%)
```

---

## Phase 0: 인증 및 프로젝트 관리 (30개 항목) ✅ 완료

### 0.1 사용자 인증 (15개 항목)

```
✅ User 모델 클래스 작성
✅ UserRepository 인터페이스 작성
✅ MongoDB Index 생성 (email unique)
✅ SecurityConfig 작성
✅ PasswordEncoder Bean 설정 (BCrypt)
✅ CORS 설정
✅ build.gradle에 JWT 의존성 추가
✅ application.yml에 JWT 설정 추가
✅ JwtTokenProvider 클래스 작성
✅ JwtAuthenticationFilter 클래스 작성
✅ SecurityFilterChain에 JWT 필터 등록
✅ RegisterRequest/LoginRequest/LoginResponse DTO 작성
✅ AuthService.register() 구현
✅ AuthService.login() 구현
✅ AuthController 작성 (POST /api/auth/register, login)
✅ Postman: 회원가입/로그인 테스트
```

---

### 0.2 프로젝트 관리 (15개 항목)

```
✅ Project/ProjectMember 모델 작성
✅ ProjectRole Enum 작성
✅ ProjectRepository/ProjectMemberRepository 작성
✅ MongoDB Index 생성
✅ CreateProjectRequest/InviteMemberRequest DTO 작성
✅ ProjectService.createProject() 구현
✅ ProjectService.getUserProjects() 구현
✅ ProjectService.inviteMember() 구현
✅ ProjectService.updateMemberRole() 구현
✅ ProjectService.removeMember() 구현
✅ ProjectController 작성
✅ POST /api/projects 구현
✅ GET /api/projects 구현
✅ POST /api/projects/{projectId}/members 구현
✅ Postman: 프로젝트 생성/멤버 초대/권한 변경 테스트
```

---

## Phase 1: 대용량 파일 업로드 (35개 항목) ✅ 완료

### 1.1 Lambda Coordinator 구현 (10개 항목)

```
✅ ExcelCoordinatorHandler 클래스 작성
✅ ProcessingMessage DTO 작성
✅ handleRequest(): S3 Event 파싱
✅ handleRequest(): Dimension 태그 분석 (sheet1.xml)
✅ handleRequest(): Fallback 파일 크기 추정
✅ handleRequest(): 청크 분할 (CHUNK_SIZE=2000)
✅ handleRequest(): SQS 메시지 발행
✅ handleRequest(): isFirstChunk 플래그 추가
✅ build.gradle: AWS SDK v2 의존성 추가
✅ Lambda 배포 (aws lambda create-function)
✅ S3 Event Notification 트리거 설정
```

---

### 1.2 Lambda Worker 구현 (12개 항목)

```
✅ ExcelWorkerHandler 클래스 작성
✅ SQSEvent 처리 로직 구현
✅ isFirstChunk 조건으로 Redis 초기화
✅ S3 파일 다운로드 (/tmp에 임시 저장)
✅ Streaming Reader 적용 (monitorjbl/xlsx-streamer)
✅ POI 4.1.2 다운그레이드 (호환성 문제 해결)
✅ 행 범위 필터링 (startRow ~ endRow)
✅ MongoDB 배치 삽입 (BATCH_SIZE=20000)
✅ Redis 진행률 업데이트 (원자적 증가)
✅ 임시 파일 정리 (finally 블록)
✅ RedisConfig: Jedis 연결 풀 설정
✅ MongoDBConfig: DocumentDB 연결 설정
```

---

### 1.3 Spring Boot 통합 (8개 항목)

```
✅ UploadService 작성
✅ createSession() / createUploadId() 구현
✅ saveUploadSession(): Redis 초기 상태 저장
✅ getUploadStatus(): Redis 상태 조회
✅ UploadController: POST /api/upload/{projectId}/presigned-url
✅ UploadController: GET /api/upload/status/{uploadId}
✅ S3Service: Presigned URL 생성 (프로젝트별 경로)
✅ Postman: 업로드 및 진행률 조회 테스트
```

---

### 1.4 AWS 인프라 최적화 (5개 항목)

```
✅ Lambda Event Source Mapping: MaxConcurrency=500 설정
✅ Lambda Event Source Mapping: BatchSize=1 설정
✅ Lambda Reserved Concurrency: 1000 설정
✅ Lambda Memory: 1024MB 설정
✅ Lambda Timeout: 900초 설정
```

---

### 1.5 Health Check 안정화 (신규 추가)

```
✅ application.yml: MongoDB Health Check 비활성화
✅ application.yml: Redis Health Check 비활성화
✅ ECS 태스크 Health Check 실패 문제 해결
✅ 배포 및 안정성 확인
```

---

## Phase 2: 비즈니스 로직 구현 (63개 항목) ⭐ v2.0 수정

### 2.1 Step 1: Multi File Upload (7개 항목)

```
⬜ C# 코드 분석 (uc_multiFileUpload.cs)
⬜ MultiFileUploadService 작성
⬜ createSession() 구현
⬜ uploadMultipleFiles() 구현
⬜ Controller: POST /api/sessions
⬜ Controller: POST /api/sessions/{sessionId}/files
⬜ Controller: GET /api/sessions/{sessionId}/files
⬜ Postman 테스트
```

---

### 2.2 Step 2: File Load (10개 항목)

```
⬜ C# 코드 분석 (uc_fileLoad.cs)
⬜ FileLoadService 작성
⬜ loadExcelFile() 구현 (Phase 1 Lambda 재활용)
⬜ GET /api/data 구현 (페이징 조회)
⬜ GET /api/data/{id} 구현 (단일 조회)
⬜ GET /api/data/summary 구현 (집계 요약)
⬜ Redis 캐싱 적용
⬜ Controller API 작성
⬜ Postman: 페이징 조회 (1000건씩)
⬜ Postman: 집계 요약
```

---

### 2.3 Step 3: Preprocessing (9개 항목)

```
⬜ C# 코드 분석 (uc_preprocessing.cs)
⬜ PreprocessingService 작성
⬜ preprocessData() 구현
⬜ raw_data → process_data 변환
⬜ 컬럼 선택 로직
⬜ POST /api/preprocessing/validate 구현
⬜ POST /api/preprocessing/clean 구현
⬜ Controller API 작성
⬜ Postman 테스트
```

---

### 2.4 Step 4: Data Transform (8개 항목)

```
⬜ C# 코드 분석 (uc_dataTransform.cs)
⬜ DataTransformService 작성
⬜ transformData() 구현
⬜ MongoDB Aggregation Pipeline 작성
⬜ POST /api/transform/aggregate 구현
⬜ Controller API 작성
⬜ Postman 테스트
```

---

### 2.5 Step 5: Clustering (10개 항목) ⭐ v2.0 수정

```
⬜ C# 코드 분석 (uc_Clustering.cs, ClusterManager/*.cs)
⬜ KMeans 클래스 작성
⬜ fit() 메서드 구현
⬜ predict() 메서드 구현
⬜ ClusteringService 작성
⬜ performKMeans() 구현
   - process_data 로드
   - 클러스터링 실행
   - clustering_results 저장 (빠르게!)
   - process_data에 cluster_id 업데이트
⬜ MergeAndCreateNewCluster() 구현
⬜ POST /api/clustering/execute 구현
⬜ POST /api/clustering/merge 구현
⬜ GET /api/clustering/results 구현
⬜ Controller API 작성
⬜ Postman: k=5로 클러스터링 테스트
```

---

### 2.6 Step 6: Export (uc_Classification) (12개 항목) ⭐⭐⭐ v2.0 신규

```
⬜ C# 코드 분석 (uc_Classification.cs)
⬜ ExportService 작성

⭐ Excel 내보내기:
⬜ POST /api/export/excel 구현
   - clustering_results → Excel (Apache POI)
   - S3 업로드
   - Presigned URL 생성
⬜ CreateServerBackupAsync() 구현

⭐ 세션 완료 처리:
⬜ PUT /api/sessions/{sessionId}/complete 구현
   - file_sessions.is_completed = true
   - file_sessions.export_path = s3Path
   - file_sessions.completed_at = now()

⭐ 결과 확인 API:
⬜ GET /api/clustering/results 구현 (페이징)
⬜ PUT /api/clustering/results/{clusterId}/name 구현
⬜ GET /api/clustering/results/hidden 구현
⬜ POST /api/clustering/{clusterId}/detail 구현

⬜ Controller API 작성
⬜ Postman: Excel 내보내기 테스트
⬜ Postman: 세션 완료 처리 테스트
```

---

### 2.7 Step 7: Detail Clustering (7개 항목)

```
⬜ C# 코드 분석 (uc_detailClustering.cs)
⬜ DetailClusteringService 작성
⬜ analyzeCluster() 구현
⬜ POST /api/clustering/{clusterId}/sub-clusters 구현
⬜ GET /api/clustering/{clusterId}/sub-clusters 구현
⬜ Controller API 작성
⬜ Postman 테스트
```

---

## Phase 3: UI 구현 (20개 항목)

### 3.1 React 프로젝트 구조 (5개 항목)

```
⬜ npx create-react-app frontend
⬜ 폴더 구조 설정
⬜ Material-UI 설치
⬜ React Router 설정
⬜ Axios 설정
```

---

### 3.2 로그인/회원가입 UI (5개 항목)

```
⬜ LoginPage.jsx 작성
⬜ RegisterPage.jsx 작성
⬜ AuthContext 작성
⬜ PrivateRoute 작성
⬜ 로그인 플로우 테스트
```

---

### 3.3 프로젝트 관리 UI (5개 항목)

```
⬜ ProjectListPage.jsx 작성
⬜ CreateProjectDialog.jsx 작성
⬜ ProjectDetailPage.jsx 작성
⬜ InviteMemberDialog.jsx 작성
⬜ 프로젝트 관리 플로우 테스트
```

---

### 3.4 7단계 프로세스 UI (5개 항목)

```
⬜ MultiFileUploadPage.jsx
⬜ FileLoadPage.jsx
⬜ PreprocessingPage.jsx
⬜ DataTransformPage.jsx
⬜ ClusteringPage.jsx
⬜ ExportPage.jsx ⭐ Excel 내보내기
⬜ DetailClusteringPage.jsx
⬜ 반응형 템플릿 적용
⬜ 모바일/태블릿 대응
```

---

## 완료 기록

### 2025-12-19 (오늘)
```
✅ Phase 1 완료! (35개 항목)
✅ Lambda Coordinator: Dimension 태그 분석
✅ Lambda Worker: Streaming Reader 적용
✅ Event Source Mapping: MaxConcurrency=500
✅ Health Check 안정화 (MongoDB/Redis 체크 비활성화)
✅ 100MB Excel 파일 500개 청크 6-8초 처리 성공
✅ 메모리: 1024MB로 안정화
✅ 비용: 월 $1 미만 (파일 100개 기준)
```

### 2025-12-18
```
✅ Redis Cluster 전환 완료
✅ Lambda Worker 메모리 최적화
✅ Streaming Reader 도입 (POI 4.1.2)
✅ FastExcel 검토 후 monitorjbl 선택
```

### 2025-12-17
```
✅ Phase 0 완료 (JWT 인증, 프로젝트 관리)
✅ Lambda 기본 구조 구현
✅ Gradle Multi-project 구성
```

### 2025-12-16
```
✅ AWS 인프라 구축 (85%)
✅ DocumentDB 재생성
✅ ECS 배포 성공
✅ v1.0 문서 작성
```

---

## 🎯 다음 마일스톤: Phase 2 시작

**내일(2025-12-19) 목표:**
- Phase 2.1: Multi File Upload (세션 관리) 완료
- Phase 2.2: File Load (데이터 조회 API) 시작

**예상 소요 시간:**
- Step 1: 2시간
- Step 2: 3시간
- 총 5시간

---

**문서 버전:** 2.1  
**최종 업데이트:** 2025-12-19 01:00 KST  
**다음 업데이트:** Phase 2.1 완료 시

> **🎉 Phase 1 완료 축하합니다!**
>
> - Lambda 500개 동시 실행 ✅
> - Streaming Reader 메모리 최적화 ✅
> - Health Check 안정화 ✅
> - 6-8초 초고속 처리 ✅