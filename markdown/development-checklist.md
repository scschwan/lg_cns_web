# 프로젝트 단위 개발 체크리스트

> **📋 이 문서 사용 규칙**
>
> 1. ✅ 완료된 항목만 `⬜` → `✅`로 변경
> 2. ✅ 신규 항목 추가만 가능
> 3. ❌ 기존 내용 수정 금지
> 4. ✅ 모든 개발 세션에서 이 문서를 열어 체크
> 5. ✅ Git commit 메시지: "chore: update checklist [Phase X]"

**문서 버전:** 2.0  
**최초 작성일:** 2025-12-16  
**마지막 업데이트:** 2025-12-17

---

## 📊 전체 진행률

```
Phase 0: [ 0/30] (  0%)  - 인증 및 프로젝트 관리
Phase 1: [ 0/25] (  0%)  - 대용량 파일 업로드
Phase 2: [ 0/63] (  0%)  - 비즈니스 로직 구현 ⭐ v2.0 수정
Phase 3: [ 0/20] (  0%)  - UI 구현

전체:    [ 0/138] (  0%)
```

---

## Phase 0: 인증 및 프로젝트 관리 (30개 항목)

### 0.1 사용자 인증 (15개 항목)

```
⬜ User 모델 클래스 작성
⬜ UserRepository 인터페이스 작성
⬜ MongoDB Index 생성 (email unique)
⬜ SecurityConfig 작성
⬜ PasswordEncoder Bean 설정 (BCrypt)
⬜ CORS 설정
⬜ build.gradle에 JWT 의존성 추가
⬜ application.yml에 JWT 설정 추가
⬜ JwtTokenProvider 클래스 작성
⬜ JwtAuthenticationFilter 클래스 작성
⬜ SecurityFilterChain에 JWT 필터 등록
⬜ RegisterRequest/LoginRequest/LoginResponse DTO 작성
⬜ AuthService.register() 구현
⬜ AuthService.login() 구현
⬜ AuthController 작성 (POST /api/auth/register, login)
⬜ Postman: 회원가입/로그인 테스트
```

---

### 0.2 프로젝트 관리 (15개 항목)

```
⬜ Project/ProjectMember 모델 작성
⬜ ProjectRole Enum 작성
⬜ ProjectRepository/ProjectMemberRepository 작성
⬜ MongoDB Index 생성
⬜ CreateProjectRequest/InviteMemberRequest DTO 작성
⬜ ProjectService.createProject() 구현
⬜ ProjectService.getUserProjects() 구현
⬜ ProjectService.inviteMember() 구현
⬜ ProjectService.updateMemberRole() 구현
⬜ ProjectService.removeMember() 구현
⬜ ProjectController 작성
⬜ POST /api/projects 구현
⬜ GET /api/projects 구현
⬜ POST /api/projects/{projectId}/members 구현
⬜ Postman: 프로젝트 생성/멤버 초대/권한 변경 테스트
```

---

## Phase 1: 대용량 파일 업로드 (25개 항목)

### 1.1 기존 코드 개선 (10개 항목)

```
⬜ ExcelParserService: sanitizeFieldName() 제거
⬜ ExcelParserService: extractHeaders() 수정 (헤더 그대로)
⬜ RawDataDocument: isHidden/hiddenReason 확인
⬜ RawDataDocument: 필드명 snake_case 확인
⬜ ProcessDataDocument: rawDataId/clusterId/clusterName 추가
⬜ ProcessDataDocument: 필드명 snake_case 확인
⬜ deploy.ps1 실행
⬜ ECS 서비스 업데이트 확인
⬜ Excel 파싱 재테스트
⬜ MongoDB 데이터 확인
```

---

### 1.2 S3 업로드 수정 (5개 항목)

```
⬜ S3Service: generatePresignedUrl()에 projectId 추가
⬜ S3Service: Key 구조 변경 (projects/{projectId}/...)
⬜ UploadController: POST /{projectId}/presigned-url
⬜ UploadController: 프로젝트 멤버 권한 확인
⬜ Postman: Presigned URL 생성 테스트
```

---

### 1.3 Lambda Coordinator (10개 항목)

```
⬜ ExcelCoordinator 클래스 작성
⬜ ProcessingMessage DTO 작성
⬜ handleRequest(): S3 Event 파싱
⬜ handleRequest(): Excel 메타데이터 분석
⬜ handleRequest(): 청크 분할 (10만 행씩)
⬜ handleRequest(): SQS 메시지 발행
⬜ handleRequest(): Redis 초기화
⬜ build.gradle: AWS SDK 의존성 추가
⬜ Lambda 배포 (aws lambda create-function)
⬜ S3 Event 트리거 설정
⬜ Postman: 10만 행/100만 행 Excel 테스트
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

**핵심:** MongoDB clustering_results 빠른 저장!

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

**핵심:** Excel 내보내기 + 세션 완료!

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

## v2.0 변경 사항 요약

### Phase 2 수정 내역

| Step | v1.0 항목 수 | v2.0 항목 수 | 주요 변경 |
|------|-------------|-------------|----------|
| Step 1 | 5개 | 7개 | API 명시 |
| Step 2 | 5개 | 10개 | 데이터 조회 API 3개 추가 |
| Step 3 | 5개 | 9개 | 검증/정제 API 2개 추가 |
| Step 4 | 5개 | 8개 | 집계 API 1개 추가 |
| Step 5 | 10개 | 10개 | **비동기 제거, 로직 집중** ⭐ |
| Step 6 | 5개 | 12개 | **Excel 내보내기 핵심** ⭐⭐⭐ |
| Step 7 | 5개 | 7개 | 세부 클러스터링만 |
| **합계** | **35개** | **63개** | **+28개** |

### v1.0 vs v2.0 비교

| 항목 | v1.0 | v2.0 |
|------|------|------|
| Step 5 핵심 | 비동기 API | 클러스터링 로직 |
| Step 6 정의 | 모호함 | Excel 내보내기 + 세션 완료 |
| Excel 내보내기 위치 | Step 7? | **Step 6** ⭐ |
| 전체 항목 수 | 110개 | **138개** |

---

## 완료 기록

### 2025-12-17 (오늘)
```
✅ v2.0 업데이트
✅ GitHub C# 코드 분석
✅ Step 5/6/7 명확화
✅ Excel 내보내기 Step 6 확정
✅ 비동기 API 제거
✅ file_sessions 필드 추가
```

### 2025-12-16
```
✅ AWS 인프라 구축 (85%)
✅ DocumentDB 재생성
✅ ECS 배포 성공
✅ ExcelParserService 구현
✅ v1.0 문서 작성
```

---

**문서 버전:** 2.0  
**최종 업데이트:** 2025-12-17 02:45 KST  
**다음 업데이트:** Phase 0 완료 시

> **⚠️ v2.0 핵심 변경:**
>
> 1. **Phase 2:** 35개 → 63개 항목 (+28개)
> 2. **Step 5:** 비동기 API 제거, 클러스터링 로직 집중
> 3. **Step 6:** Excel 내보내기 + 세션 완료 (12개 항목 신규)
>
> **GitHub 코드 분석으로 정확하게 수정했습니다!**