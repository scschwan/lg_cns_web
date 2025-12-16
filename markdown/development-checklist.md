# 프로젝트 단위 개발 체크리스트

> **📋 이 문서 사용 규칙**
> 
> 1. ✅ 완료된 항목만 `⬜` → `✅`로 변경
> 2. ✅ 신규 항목 추가만 가능
> 3. ❌ 기존 내용 수정 금지
> 4. ✅ 모든 개발 세션에서 이 문서를 열어 체크
> 5. ✅ Git commit 메시지: "chore: update checklist [Phase X]"

**최초 작성일:** 2025-12-16  
**마지막 업데이트:** 2025-12-16

---

## 📊 전체 진행률

```
Phase 0: [ 0/30] (  0%)  - 인증 및 프로젝트 관리
Phase 1: [ 0/25] (  0%)  - 대용량 파일 업로드
Phase 2: [ 0/35] (  0%)  - 비즈니스 로직 구현
Phase 3: [ 0/20] (  0%)  - UI 구현

전체:    [ 0/110] (  0%)
```

---

## Phase 0: 인증 및 프로젝트 관리

### 0.1 사용자 인증 (15개 항목)

#### 0.1.1 모델 및 Repository
```
⬜ User 모델 클래스 작성
⬜ UserRepository 인터페이스 작성
⬜ MongoDB Index 생성 (email unique)
```

#### 0.1.2 보안 설정
```
⬜ SecurityConfig 작성
⬜ PasswordEncoder Bean 설정 (BCrypt)
⬜ CORS 설정
```

#### 0.1.3 JWT 구현
```
⬜ build.gradle에 JWT 의존성 추가 (jjwt 0.12.3)
⬜ application.yml에 JWT 설정 추가
⬜ JwtTokenProvider 클래스 작성
⬜ JwtAuthenticationFilter 클래스 작성
⬜ SecurityFilterChain에 JWT 필터 등록
```

#### 0.1.4 인증 서비스
```
⬜ RegisterRequest DTO 작성
⬜ LoginRequest DTO 작성
⬜ LoginResponse DTO 작성
⬜ DuplicateEmailException 작성
⬜ InvalidCredentialsException 작성
⬜ AuthService.register() 구현
⬜ AuthService.login() 구현
```

#### 0.1.5 인증 API
```
⬜ AuthController 작성
⬜ POST /api/auth/register 구현
⬜ POST /api/auth/login 구현
⬜ POST /api/auth/refresh 구현 (선택)
⬜ POST /api/auth/logout 구현 (선택)
```

#### 0.1.6 테스트
```
⬜ Postman: 회원가입 테스트
⬜ Postman: 로그인 테스트
⬜ Postman: JWT 토큰 발급 확인
⬜ Postman: 잘못된 비밀번호 테스트
⬜ Postman: 중복 이메일 테스트
```

---

### 0.2 프로젝트 관리 (15개 항목)

#### 0.2.1 모델 및 Enum
```
⬜ Project 모델 클래스 작성
⬜ ProjectMember 모델 클래스 작성
⬜ ProjectRole Enum 작성 (OWNER, EDITOR, VIEWER)
⬜ ProjectRepository 인터페이스 작성
⬜ ProjectMemberRepository 인터페이스 작성
⬜ MongoDB Index 생성 (project_id unique)
⬜ MongoDB Index 생성 (project_id + user_id unique)
```

#### 0.2.2 DTO 클래스
```
⬜ CreateProjectRequest DTO 작성
⬜ InviteMemberRequest DTO 작성
⬜ ProjectSummary DTO 작성
⬜ ProjectDetailResponse DTO 작성
```

#### 0.2.3 프로젝트 서비스
```
⬜ ProjectService.createProject() 구현
⬜ ProjectService.getUserProjects() 구현
⬜ ProjectService.getProjectDetail() 구현
⬜ ProjectService.inviteMember() 구현
⬜ ProjectService.updateMemberRole() 구현
⬜ ProjectService.removeMember() 구현
⬜ getPermissionsByRole() 헬퍼 메서드 구현
```

#### 0.2.4 프로젝트 API
```
⬜ ProjectController 작성
⬜ POST /api/projects 구현
⬜ GET /api/projects 구현
⬜ GET /api/projects/{projectId} 구현
⬜ POST /api/projects/{projectId}/members 구현
⬜ PUT /api/projects/{projectId}/members/{userId} 구현
⬜ DELETE /api/projects/{projectId}/members/{userId} 구현
```

#### 0.2.5 테스트
```
⬜ Postman: 프로젝트 생성 테스트
⬜ Postman: 프로젝트 목록 조회 테스트
⬜ Postman: 프로젝트 상세 조회 테스트
⬜ Postman: 멤버 초대 테스트
⬜ Postman: 멤버 권한 변경 테스트
⬜ Postman: 멤버 삭제 테스트
⬜ Postman: 권한 없는 사용자 접근 거부 확인
```

---

### 0.3 데이터 격리 (10개 항목)

#### 0.3.1 기존 모델 수정
```
⬜ RawDataDocument에 projectId 필드 추가
⬜ ProcessDataDocument에 projectId 필드 추가
⬜ ClusteringResultDocument에 projectId 필드 추가
⬜ FileSessionDocument에 projectId 필드 추가
⬜ FileSessionDocument에 createdBy 필드 추가
```

#### 0.3.2 MongoDB Index 생성
```
⬜ raw_data: { project_id: 1, session_id: 1 } 복합 인덱스
⬜ process_data: { project_id: 1 } 인덱스
⬜ clustering_results: { project_id: 1 } 인덱스
⬜ file_sessions: { project_id: 1 } 인덱스
```

#### 0.3.3 Repository 수정
```
⬜ RawDataRepository에 findByProjectId 메서드 추가
⬜ ProcessDataRepository에 findByProjectId 메서드 추가
⬜ ClusteringResultRepository에 findByProjectId 메서드 추가
```

#### 0.3.4 통합 테스트
```
⬜ 프로젝트 A의 데이터가 프로젝트 B에 노출되지 않는지 확인
⬜ 프로젝트 멤버만 데이터 접근 가능한지 확인
⬜ VIEWER 역할이 업로드 불가능한지 확인
```

---

## Phase 1: 대용량 파일 업로드

### 1.1 기존 코드 개선 (10개 항목)

#### 1.1.1 ExcelParserService 수정
```
⬜ sanitizeFieldName() 메서드 제거
⬜ extractHeaders()에서 헤더 그대로 사용하도록 수정
⬜ 점(.) 포함된 필드명 테스트
```

#### 1.1.2 RawDataDocument 수정
```
⬜ isHidden 필드 확인
⬜ hiddenReason 필드 확인
⬜ 필드명 snake_case 확인 (import_date, file_name)
```

#### 1.1.3 ProcessDataDocument 수정
```
⬜ rawDataId 필드 추가
⬜ clusterId 필드 추가
⬜ clusterName 필드 추가
⬜ 필드명 snake_case 확인 (raw_data_id, cluster_id)
```

#### 1.1.4 배포 및 테스트
```
⬜ deploy.ps1 실행
⬜ ECS 서비스 업데이트 확인
⬜ Excel 파싱 재테스트
⬜ MongoDB 데이터 확인 (점 포함 필드명)
```

---

### 1.2 S3 업로드 수정 (5개 항목)

#### 1.2.1 S3Service 수정
```
⬜ generatePresignedUrl()에 projectId 파라미터 추가
⬜ S3 Key 구조 변경: projects/{projectId}/sessions/{sessionId}/files/{fileName}
```

#### 1.2.2 UploadController 수정
```
⬜ POST /{projectId}/presigned-url 엔드포인트로 변경
⬜ 프로젝트 멤버 권한 확인 (can_upload)
⬜ projectId를 응답에 포함
```

#### 1.2.3 테스트
```
⬜ Postman: Presigned URL 생성 (projectId 포함)
⬜ Postman: 프로젝트 멤버만 업로드 가능한지 확인
⬜ aws s3 ls로 파일 경로 확인
```

---

### 1.3 Lambda Coordinator (10개 항목)

#### 1.3.1 클래스 작성
```
⬜ ExcelCoordinator 클래스 작성
⬜ ProcessingMessage DTO 작성
```

#### 1.3.2 handleRequest() 구현
```
⬜ S3 Event 파싱 로직
⬜ S3에서 Excel 다운로드
⬜ Excel 메타데이터만 분석 (총 행 수)
⬜ 청크 분할 계획 (10만 행씩)
⬜ SQS 메시지 발행 (각 청크마다)
⬜ Redis 초기화 (upload:status:{uploadId})
```

#### 1.3.3 의존성 및 배포
```
⬜ build.gradle에 AWS SDK 의존성 추가
⬜ Lambda JAR 빌드
⬜ aws lambda create-function 실행
⬜ S3 Event 트리거 설정
⬜ CloudWatch Logs 확인
```

#### 1.3.4 테스트
```
⬜ 10만 행 Excel → SQS 메시지 1개 확인
⬜ 100만 행 Excel → SQS 메시지 10개 확인
⬜ Redis 초기화 확인
```

---

### 1.4 Lambda Worker (15개 항목)

#### 1.4.1 클래스 작성
```
⬜ ExcelWorker 클래스 작성
⬜ handleRequest() 구현 (SQS 이벤트 수신)
```

#### 1.4.2 processChunk() 구현
```
⬜ SQS 메시지 파싱
⬜ S3에서 파일 다운로드
⬜ Excel 워크북 열기
⬜ 헤더 추출
⬜ 자기 범위만 파싱 (startRow ~ endRow)
⬜ Map<String, Object> data 생성
⬜ RawDataDocument 객체 생성
⬜ MongoDB 배치 삽입 (2만 건씩)
⬜ Redis 진행률 업데이트 (hincrby)
⬜ 남은 데이터 삽입
```

#### 1.4.3 VPC 및 배포
```
⬜ Lambda VPC 설정 (Private Subnet)
⬜ Security Group 설정 (DocumentDB/Redis 접근)
⬜ Lambda 함수 배포
⬜ SQS 트리거 설정 (배치 크기: 1)
⬜ 동시 실행 수 설정 (10개)
⬜ 타임아웃 설정 (15분)
⬜ 메모리 설정 (1024MB)
```

#### 1.4.4 테스트
```
⬜ 100만 행 Excel 업로드
⬜ 10개 Worker 병렬 실행 확인 (CloudWatch)
⬜ MongoDB raw_data 데이터 삽입 확인
⬜ Redis 진행률 확인
⬜ 처리 완료 시간 측정
```

---

### 1.5 진행률 추적 (5개 항목)

#### 1.5.1 DTO 및 서비스
```
⬜ UploadStatusResponse DTO 작성
⬜ UploadService.getUploadStatus() 구현
⬜ Redis에서 진행률 조회
⬜ 진행률 계산: (processedRows / totalRows) * 100
```

#### 1.5.2 API 및 테스트
```
⬜ GET /api/upload/status/{uploadId} 구현
⬜ Postman: 진행률 조회 테스트
⬜ React: 1초마다 폴링 구현 (선택)
⬜ React: Progress Bar 표시 (선택)
```

---

### 1.6 성능 테스트 (10개 항목)

#### 1.6.1 테스트 파일 준비
```
⬜ 50MB Excel 파일 생성 (10만 행)
⬜ 100MB Excel 파일 생성 (20만 행)
⬜ 500MB Excel 파일 생성 (100만 행)
```

#### 1.6.2 성능 측정
```
⬜ 50MB 파일 처리 시간 측정
⬜ 100MB 파일 처리 시간 측정
⬜ 500MB 파일 처리 시간 측정
⬜ Lambda 동시 실행 수 확인
⬜ MongoDB 삽입 속도 확인
⬜ Redis 업데이트 속도 확인
```

#### 1.6.3 벤치마크 문서화
```
⬜ 성능 결과 표 작성
⬜ C# 단일 스레드 vs Lambda 병렬 비교
⬜ 개선율 계산
⬜ 벤치마크 문서 작성 (performance-benchmark.md)
```

---

## Phase 2: 비즈니스 로직 구현

### 2.1 Step 1: Multi File Upload (5개 항목)

```
⬜ C# 코드 분석 (uc_MultiFileUploadSessionProcess.cs)
⬜ MultiFileUploadService 작성
⬜ createSession() 구현
⬜ uploadFile() 구현
⬜ getSessionFiles() 구현
⬜ Controller API 작성
⬜ Postman 테스트
```

---

### 2.2 Step 2: File Load (5개 항목)

```
⬜ C# 코드 분석 (uc_FileLoadProcess.cs)
⬜ FileLoadService 작성
⬜ loadExcelFile() 구현 (Phase 1 재활용)
⬜ Controller API 작성
⬜ Postman 테스트
```

---

### 2.3 Step 3: Preprocessing (5개 항목)

```
⬜ C# 코드 분석 (uc_PreprocessingProcess.cs)
⬜ PreprocessingService 작성
⬜ preprocessData() 구현
⬜ raw_data → process_data 변환
⬜ 컬럼 선택 로직
⬜ 데이터 정제 로직
⬜ Controller API 작성
⬜ Postman 테스트
```

---

### 2.4 Step 4: Data Transform (5개 항목)

```
⬜ C# 코드 분석 (uc_DataTransformProcess.cs)
⬜ DataTransformService 작성
⬜ transformData() 구현
⬜ MongoDB Aggregation Pipeline 작성
⬜ 집계 계산 (SUM, AVG, COUNT)
⬜ 그룹핑 로직
⬜ Controller API 작성
⬜ Postman 테스트
```

---

### 2.5 Step 5: Classification (5개 항목)

```
⬜ C# 코드 분석 (uc_ClassificationProcess.cs)
⬜ KeywordExtractor 유틸리티 작성
⬜ ClassificationService 작성
⬜ classifyData() 구현
⬜ 키워드 기반 분류 로직
⬜ Controller API 작성
⬜ Postman 테스트
```

---

### 2.6 Step 6: Clustering (10개 항목)

```
⬜ C# 코드 분석 (uc_ClusteringProcess.cs)
⬜ C# 코드 분석 (Utilities/ClusterManager/*.cs)
⬜ KMeans 알고리즘 클래스 작성
⬜ fit() 메서드 구현
⬜ predict() 메서드 구현
⬜ ClusteringService 작성
⬜ performKMeans() 구현
⬜ clustering_results 저장
⬜ process_data에 cluster_id 업데이트
⬜ Controller API 작성
⬜ Postman 테스트 (k=5)
```

---

### 2.7 Step 7: Detail Clustering (5개 항목)

```
⬜ C# 코드 분석 (uc_DetailClusteringProcess.cs)
⬜ DetailClusteringService 작성
⬜ analyzeCluster() 구현
⬜ Controller API 작성
⬜ Postman 테스트
```

---

## Phase 3: UI 구현

### 3.1 React 프로젝트 구조 (5개 항목)

```
⬜ npx create-react-app frontend
⬜ 폴더 구조 설정 (components, pages, services, hooks, utils)
⬜ Material-UI 또는 Ant Design 설치
⬜ React Router 설정
⬜ Axios 설정 (API 호출)
```

---

### 3.2 로그인/회원가입 UI (5개 항목)

```
⬜ LoginPage.jsx 작성
⬜ RegisterPage.jsx 작성
⬜ AuthContext 작성 (JWT 토큰 관리)
⬜ PrivateRoute 컴포넌트 작성
⬜ 회원가입 → 로그인 → 토큰 저장 테스트
```

---

### 3.3 프로젝트 관리 UI (5개 항목)

```
⬜ ProjectListPage.jsx 작성
⬜ CreateProjectDialog.jsx 작성
⬜ ProjectDetailPage.jsx 작성
⬜ InviteMemberDialog.jsx 작성
⬜ 프로젝트 생성 → 멤버 초대 → 권한 변경 테스트
```

---

### 3.4 7단계 프로세스 UI (5개 항목)

```
⬜ MultiFileUploadPage.jsx (C# uc_MultiFileUpload.cs 참고)
⬜ FileLoadPage.jsx (C# uc_FileLoad.cs 참고)
⬜ PreprocessingPage.jsx (C# uc_Preprocessing.cs 참고)
⬜ DataTransformPage.jsx (C# uc_DataTransform.cs 참고)
⬜ ClassificationPage.jsx (C# uc_Classification.cs 참고)
⬜ ClusteringPage.jsx (C# uc_Clustering.cs 참고)
⬜ DetailClusteringPage.jsx (C# uc_DetailClustering.cs 참고)
⬜ C# WinForms UI 레이아웃을 반응형 카드 구조로 재해석
⬜ 모바일/태블릿 대응
```

---

## 신규 항목 추가 영역

> **📝 새로운 작업 항목이 생기면 아래에 추가하세요**
> 
> 형식: `⬜ [Phase X.Y] 작업 항목 설명`

```
(여기에 신규 항목 추가)
```

---

## 완료 기록

### 2025-12-16 (오늘)
```
✅ AWS 인프라 구축 (85% 완료)
✅ DocumentDB 재생성 (TLS 활성화)
✅ ECS 배포 성공
✅ S3 Presigned URL API 구현
✅ ExcelParserService 구현
✅ UploadController 확장
✅ DataController Redis 캐싱
✅ 프로젝트 개발 가이드 문서 작성
```

---

**문서 버전:** 1.0  
**최종 업데이트:** 2025-12-16  
**다음 업데이트 예정:** Phase 0 완료 시

> **⚠️ 중요:**
> - 매 개발 세션 시작 시 이 문서를 열어 체크하세요
> - 완료된 항목은 `⬜` → `✅`로 변경하세요
> - 진행률이 자동 계산되지 않으니 수동으로 업데이트하세요
> - Git commit 시 체크리스트 업데이트도 함께 커밋하세요
