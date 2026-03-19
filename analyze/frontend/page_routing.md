최종 수정일: 2026-03-19 (Phase 4 피드백 반영 완료)

# Finance Tool - 페이지 라우팅 맵

## 1. 전체 페이지 라우팅 맵

### 1.1 Public Routes (인증 불필요)

| 경로 | 컴포넌트 | 레이아웃 | 인증 | 설명 |
|------|----------|----------|------|------|
| `/login` | `LoginPage` | 없음 (독립) | 불필요 | 로그인 |
| `/register` | `RegisterPage` | 없음 (독립) | 불필요 | 회원가입 |
| `/test` | `TestPage` | 없음 (독립) | 불필요 | 테스트 페이지 |
| `/` | - | - | - | `/login`으로 리다이렉트 |

### 1.2 Legacy Preview Routes (인증 불필요, NewServiceLayout)

| 경로 | 컴포넌트 | 레이아웃 | 인증 | 설명 |
|------|----------|----------|------|------|
| `/longlist` | `LongListPage` | `NewServiceLayout` | 불필요 | Long List (레거시 Preview) |
| `/shortlist` | `ShortListPage` | `NewServiceLayout` | 불필요 | Short List (레거시 Preview) |
| `/able-register` | `AbleTaskRegisterPage` | `NewServiceLayout` | 불필요 | Able 과제 등록 (레거시 Preview) |
| `/able-manage` | `AbleTaskManagePage` | `NewServiceLayout` | 불필요 | Able 과제 관리 (레거시 Preview) |
| `/completed-manage` | `CompletedTaskManagePage` | `NewServiceLayout` | 불필요 | 완료 과제 관리 (레거시 Preview) |

### 1.3 Private Routes - 프로젝트 관리 (LayoutWrapper: Navbar)

| 경로 | 컴포넌트 | 레이아웃 | 인증 | 설명 |
|------|----------|----------|------|------|
| `/projects` | `ProjectsPage` | `LayoutWrapper` (Navbar) | 필요 | 프로젝트 목록 |
| `/projects/:projectId/settings` | `ProjectSettingsPage` | `LayoutWrapper` (Navbar) | 필요 | 프로젝트 설정 |

### 1.4 Private Routes - 데이터 처리 7단계 (LayoutWrapper + DashboardLayout: Navbar + Sidebar)

| 경로 | 컴포넌트 | 레이아웃 | 인증 | Step | 설명 |
|------|----------|----------|------|------|------|
| `/projects/:projectId/upload` | `MultiFileUploadPage` | Navbar + DashboardLayout | 필요 | 1 | 멀티 파일 업로드 |
| `/projects/:projectId/dashboard-upload` | `DashboardUploadPage` | Navbar + DashboardLayout | 필요 | - | 대시보드 전용 업로드 |
| `/projects/:projectId/sessions/:sessionId/startanalysis` | `StartAnalysisPage` | Navbar + DashboardLayout | 필요 | 2 | 계정 분석 시작 |
| `/projects/:projectId/sessions/:sessionId/preprocessing` | `PreprocessingPage` | Navbar + DashboardLayout | 필요 | 3 | 데이터 전처리 |
| `/projects/:projectId/sessions/:sessionId/transform` | `DataTransformPage` | Navbar + DashboardLayout | 필요 | 4 | 데이터 변환 |
| `/projects/:projectId/sessions/:sessionId/clustering` | `ClusteringPage` | Navbar + DashboardLayout | 필요 | 5 | 클러스터링 |
| `/projects/:projectId/sessions/:sessionId/export` | `ExportPage` | Navbar + DashboardLayout | 필요 | 6 | 결과 내보내기 |
| `/projects/:projectId/sessions/:sessionId/detailclustering` | `DetailClusteringPage` | Navbar + DashboardLayout | 필요 | 7 | 상세 클러스터링 |

### 1.5 Private Routes - 비용 절감 대시보드 (CostReductionLayout)

| 경로 | 컴포넌트 | 레이아웃 | 인증 | 설명 |
|------|----------|----------|------|------|
| `/projects/:projectId/longlist` | `LongListPage` | `CostReductionLayout` | 필요 | Long List 도출 |
| `/projects/:projectId/shortlist` | `ShortListPage` | `CostReductionLayout` | 필요 | Short List 도출 |
| `/projects/:projectId/able-register` | `AbleTaskRegisterPage` | `CostReductionLayout` | 필요 | Able 과제 등록 |
| `/projects/:projectId/able-manage` | `AbleTaskManagePage` | `CostReductionLayout` | 필요 | Able 과제 관리 |
| `/projects/:projectId/completed-manage` | `CompletedTaskManagePage` | `CostReductionLayout` | 필요 | 완료 과제 관리 |

### 1.6 Admin Routes (관리자 전용, 중첩 라우팅)

| 경로 | 컴포넌트 | 레이아웃 | 인증 | 설명 |
|------|----------|----------|------|------|
| `/admin` | `AdminDashboard` | `LayoutWrapper` + `AdminLayout` | 필요 (ADMIN) | 관리자 대시보드 |
| `/admin/users` | `UserManagement` | `LayoutWrapper` + `AdminLayout` | 필요 (ADMIN) | 사용자 관리 |
| `/admin/projects` | `ProjectManagement` | `LayoutWrapper` + `AdminLayout` | 필요 (ADMIN) | 프로젝트 관리 |
| `/admin/s3` | `S3Management` | `LayoutWrapper` + `AdminLayout` | 필요 (ADMIN) | S3 파일 관리 |
| `/admin/sessions` | `SessionMonitoring` | `LayoutWrapper` + `AdminLayout` | 필요 (ADMIN) | 세션 모니터링 |
| `/admin/logs` | `AuditLogPage` | `LayoutWrapper` + `AdminLayout` | 필요 (ADMIN) | 감사 로그 |
| `/admin/profile` | `AdminProfile` | `LayoutWrapper` + `AdminLayout` | 필요 (ADMIN) | 관리자 프로필 |

### 1.7 에러 및 기타

| 경로 | 컴포넌트 | 레이아웃 | 인증 | 설명 |
|------|----------|----------|------|------|
| `/error/500` | `ServerErrorPage` | 없음 (독립) | 불필요 | 서버 에러 페이지 |
| `*` (기타) | `NotFoundPage` | 없음 (독립) | 불필요 | 404 페이지 |

---

## 2. 페이지별 사용 컴포넌트 및 API 서비스 매핑

### 2.1 인증 페이지

| 페이지 | 사용 컴포넌트 | API 서비스 |
|--------|-------------|------------|
| `LoginPage` | Card, Input, Label, Button, Alert, SessionExpiredToast | `authService.login()` (via `useAuth().login()`) |
| `RegisterPage` | Card, Input, Label, Button, Alert | `authService.register()` (via `useAuth().register()`) |

### 2.2 프로젝트 관리

| 페이지 | 사용 컴포넌트 | API 서비스 |
|--------|-------------|------------|
| `ProjectsPage` | Card, Button, Badge, Dialog, CreateProjectDialog | `projectService.getMyProjects()`, `projectService.createProject()`, `projectService.deleteProject()`, `projectService.completeProject()` |
| `ProjectSettingsPage` | Card, Input, Label, Button, Dialog, Select | `projectService.getProject()`, `projectService.updateProject()`, `projectService.getProjectMembers()`, `projectService.inviteMember()`, `projectService.updateMemberRole()`, `projectService.removeMember()` |

### 2.3 데이터 처리 7단계

| 페이지 | 사용 컴포넌트 | API 서비스 | 커스텀 훅 |
|--------|-------------|------------|-----------|
| `MultiFileUploadPage` (Step 1) | Card, Button, Badge, Breadcrumb, Table, Checkbox, Select, Input, Dialog, PartitionDialog | `uploadService.*` (presignedUrl, uploadToS3, completeFileUpload, getFiles, createSession, analyzePartitions 등) [Phase 3 피드백 반영] `addFilesToSession` API URL 불일치 - 프론트엔드 `/files` vs 백엔드 `/add-files` | `useUploadPageLock` |
| `DashboardUploadPage` | Card, Button, Dialog, Select | `uploadService.*`, `costReductionService.startDashboardGeneration()` | `useUploadPageLock` |
| `StartAnalysisPage` (Step 2) | StyledGroupBox, StyledDataGrid, Pagination, SessionHeader, ActionButton | `uploadService.getSessionData()`, `uploadService.getColumnMappings()`, `uploadService.updateColumnVisibility()`, `uploadService.hideSessionDataRows()`, `uploadService.standardizeData()`, `uploadService.prepareProcessData()` | `useSessionEditorLock` |
| `PreprocessingPage` (Step 3) | StyledGroupBox, StyledDataGrid, Pagination, SessionHeader | `preprocessingService.*` (getSessionInfo, getProcessData, getConfig, saveConfig, extractKeywords, extractKeywordsNlp, removeSingleChar) | `useSessionEditorLock` |
| `DataTransformPage` (Step 4) | StyledGroupBox, StyledDataGrid, Pagination, SessionHeader, ActionButton | `transformService.*` (getKeywordStats, searchKeywords, replaceKeywords, getOriginalData, getSearchData) | `useSessionEditorLock` |
| `ClusteringPage` (Step 5) | StyledGroupBox, StyledDataGrid, Pagination, SessionHeader, ActionButton, ProgressDialog | `clusteringService.*` (generateClusters, getUnmergedClusters, mergeClusters, unmergeClusters, advancedSearch, getKeywordHierarchy 등) | `useSessionEditorLock` |
| `ExportPage` (Step 6) | StyledGroupBox, StyledDataGrid, Pagination, SessionHeader, ActionButton, ProgressDialog | `exportService.*` (getAllDataWithClusterInfo, getMergedClusters, updateClusterName, exportAllClusters, completeSession 등) | `useSessionEditorLock` |
| `DetailClusteringPage` (Step 7) | StyledGroupBox, StyledDataGrid, Pagination, SessionHeader, ActionButton | `detailClusteringService.*` (getUnmergedClusters, mergeClusters, unmergeClusters, advancedSearch, getKeywordHierarchy 등) | `useSessionEditorLock` |

### 2.4 비용 절감 대시보드

| 페이지 | 사용 컴포넌트 | API 서비스 | 커스텀 훅 |
|--------|-------------|------------|-----------|
| `LongListPage` | Card, Button, Table, Checkbox, Badge, RawDataModal, ClusteringImportDialog | `costReductionService.getLongListTree()`, `.getLongListStats()`, `.getLongListChart()`, `.saveLongListSelections()`, `.getLongListRawData()`, `.importClusteringExcel()` | `useEditorLock`, `useDashboardStatus` |
| `ShortListPage` | Card, Button, Table, Checkbox, Badge, RawDataModal | `costReductionService.getShortListTree()`, `.getShortListStats()`, `.getShortListChart()`, `.saveShortListSelections()`, `.getShortListRawData()` | `useEditorLock`, `useDashboardStatus` |
| `AbleTaskRegisterPage` | Card, Button, Dialog, Input, Select, Textarea | `costReductionService.createTask()`, `.getShortListSelectionTree()`, `.getLockedStatisticsIds()`, `.getTaskDocuments()`, `.addTaskLink()`, `.getTaskUploadUrl()` | `useEditorLock`, `useDashboardStatus` |
| `AbleTaskManagePage` | Card, Button, Table, Badge, Dialog | `costReductionService.getTasks()`, `.getTask()`, `.updateTask()`, `.deleteTask()`, `.getTaskSummary()`, `.getWeeklyProgress()` | `useEditorLock`, `useDashboardStatus` |
| `CompletedTaskManagePage` | Card, Button, Table, Badge | `costReductionService.getTasks()`, `.getTaskSummary()` | `useEditorLock`, `useDashboardStatus` |

### 2.5 관리자 페이지

| 페이지 | 사용 컴포넌트 | API 서비스 |
|--------|-------------|------------|
| `AdminDashboard` | Card, Badge, Recharts | `adminService.getStats()` |
| `UserManagement` | Table, Button, Dialog, Checkbox | `adminService.getUsers()`, `.approveUser()`, `.revokeUser()`, `.deleteUser()`, `.bulkApprove()`, `.bulkRevoke()`, `.updateUserInfo()`, `.resetUserPassword()` |
| `ProjectManagement` | Table, Button, Dialog | `adminService.getProjects()`, `.getProjectDetail()`, `.updateMemberRole()`, `.addProjectMember()`, `.removeProjectMember()` |
| `S3Management` | Table, Button, Dialog | `adminService.getS3Files()`, `.getOrphanedFiles()`, `.deleteS3Files()`, `.cleanupOrphaned()` |
| `SessionMonitoring` | Table, Button, Dialog | `adminService.getSessions()`, `.resetSession()` |
| `AuditLogPage` | Table, Select, Input | `adminService.getLogs()` |
| `AdminProfile` | Card, Input, Button | `adminService.changePassword()` |

### 2.6 공통/전역 컴포넌트

| 컴포넌트 | 위치 | API 서비스 | 설명 |
|----------|------|------------|------|
| `MaintenanceDialog` | 전역 (App 내부) | `systemService.getMaintenanceStatus()` [Phase 3 피드백 반영] 별도 axios 인스턴스 사용, 인증 없이 호출 시도하나 백엔드 SecurityConfig에서 permitAll 미설정으로 401 가능 | 5초 폴링, 유지보수/Lambda 실행 중 서비스 차단 |
| `ViewerModeOverlay` | DashboardLayout, CostReductionLayout 내부 | `projectService.getProject()` (via `useViewerMode`) | VIEWER 권한 시 인터랙션 차단 |
| `ErrorBoundary` | 전역 (최상위) | 없음 | React 렌더링 에러 포착 및 복구 UI |
| `Navbar` | LayoutWrapper 내부 | `authService.updateProfile()`, `authService.changePassword()` | 상단 네비게이션 바 |

---

## 3. 네비게이션 흐름도

### 3.1 전체 네비게이션 흐름

```
                        ┌──────────────┐
                        │   /login     │
                        │  (LoginPage) │
                        └──────┬───────┘
                               │ 로그인 성공
                    ┌──────────┴──────────┐
                    │                     │
              role=ADMIN           role=USER/EDITOR
                    │                     │
                    ▼                     ▼
            ┌──────────────┐    ┌────────────────┐
            │   /admin     │    │   /projects    │
            │ (Dashboard)  │    │ (ProjectsPage) │
            └──────┬───────┘    └───────┬────────┘
                   │                    │
        ┌──────────┼───────┐     프로젝트 선택
        ▼          ▼       ▼            │
    /admin/    /admin/  /admin/    ┌─────┴──────┐
    users      s3      sessions   │            │
    ...                         프로젝트타입   프로젝트타입
                              =데이터분석    =비용절감
                                  │            │
                                  ▼            ▼
                        ┌─────────────┐  ┌──────────────────┐
                        │ /projects/  │  │ /projects/:pid/  │
                        │ :pid/upload │  │ longlist         │
                        │  (Step 1)   │  │ (CostReduction)  │
                        └─────┬───────┘  └────────┬─────────┘
                              │                   │
                    세션 생성 + 시작          ┌─────┼─────┐
                              │              │     │     │
                              ▼              ▼     ▼     ▼
                      ┌───────────────┐  shortlist  able-  completed-
                      │ /projects/    │            register  manage
                      │ :pid/sessions/│            able-
                      │ :sid/         │            manage
                      │ startanalysis │
                      │  (Step 2)     │
                      └───────┬───────┘
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
               Step 3    Step 4    Step 5
           preprocessing transform clustering
                                      │
                              ┌───────┼───────┐
                              ▼               ▼
                           Step 6          Step 7
                           export      detailclustering
```

### 3.2 데이터 처리 단계별 흐름

```
Step 1: Multi File Upload
│   파일 업로드 → 세션 생성 → 파티션 분석 → 세션 시작
│
▼
Step 2: Start Analysis
│   데이터 로드 → 컬럼 매핑 → 데이터 정제 → process_data 생성
│
▼
Step 3: Preprocessing
│   구분자/불용어 설정 → 키워드 추출 (구분자/NLP) → 1글자 제거
│
▼
Step 4: Data Transform
│   키워드 통계 → 키워드 검색/치환 → 변환 결과 확인
│
▼
Step 5: Clustering
│   클러스터 생성 → 미병합 목록 → 병합/해제 → 클러스터명 지정
│   └─→ Step 7: Detail Clustering (선택적)
│        클러스터 내부 세부 클러스터링
│
▼
Step 6: Export
│   전체 데이터 확인 → 클러스터명 수정 → 컬럼 설정 → Excel 내보내기
│   → 세션 완료
```

### 3.3 비용 절감 대시보드 흐름

```
Long List 도출
│   트리 데이터 조회 → 통계/차트 분석 → 항목 선택 → 저장
│   (클러스터링 Excel 임포트 가능)
│
▼
Short List 도출
│   Long List 선택 기반 → 세부 항목 분석 → 선택 → 저장
│
▼
Able 과제 등록
│   Short List 선택 기반 → 과제 생성 → 문서 첨부
│
▼
Able 과제 관리
│   과제 현황 관리 → 주간 진행 현황 기록 → 과제 수정/삭제
│
▼
완료 과제 관리
│   완료된 과제 현황 조회 및 관리
```

### 3.4 인증 흐름 상세

```
앱 초기 로드
    │
    ▼
AuthProvider 마운트
    │
    ├── localStorage에 authToken 존재?
    │   ├── 없음 → user=null, loading=false
    │   │           → PrivateRoute가 /login으로 리다이렉트
    │   │
    │   └── 있음 → 클라이언트 토큰 만료 체크
    │       ├── Access + Refresh 모두 만료 → forceLogout() → /login
    │       │
    │       └── 유효(또는 Access만 만료) → GET /api/auth/me
    │           ├── 200 OK → user 설정, loading=false → 정상 렌더링
    │           ├── 401/403 → forceLogout() → /login
    │           └── 500/네트워크 에러
    │               ├── Access 만료 → forceLogout()
    │               └── Access 유효 → localStorage user로 임시 유지
    │
    ▼
인증 완료 후 주기적 검증
    │
    ├── 1분 interval: validateSession()
    ├── 탭 복귀: visibilitychange/focus → 토큰 체크 + 서버 검증
    ├── 네트워크 복구: online → 서버 검증
    └── api.js 401 응답: session-expired 이벤트 → React state 동기화
```

### 3.5 Sidebar 단계 제어 로직

**DashboardLayout Sidebar (7단계):**

| 조건 | Step 1 | Step 2~6 | Step 7 |
|------|--------|----------|--------|
| sessionId 없음 (Upload 페이지) | 활성 | 비활성 | 비활성 |
| sessionId 있음 (Step 페이지) | 활성 (확인 다이얼로그) | stepHistory 기반 | 항상 비활성 (Export에서만 진입) |
| stepHistory에 방문 기록 있음 | - | 활성 | - |
| currentStep 이전 단계 | - | 활성 | - |
| 방문 기록 없고 currentStep 이후 | - | 비활성 | - |

**CostReductionLayout Sidebar (5단계):**
- 모든 단계 항상 활성화 (자유 이동 가능)
- 현재 페이지 하이라이트 표시

---

## 4. CloudFront SPA 라우팅 정합성 [Phase 3 피드백 반영]

CloudFront Custom Error Response에서 403/404 에러를 `/index.html`(Response Code 200, Cache TTL 0초)로 리다이렉트하여 React Router의 클라이언트 사이드 라우팅을 지원한다. 위 1.1~1.7의 모든 경로가 이 설정에 의해 정상 동작함을 확인했다.

BrowserRouter 사용 시 새로고침/직접 URL 접근 시 S3에 해당 파일이 존재하지 않아 403/404가 발생하는데, CloudFront가 이를 `index.html`로 리다이렉트하여 React Router가 클라이언트 측에서 적절한 페이지를 렌더링한다.

**주의사항**: CloudFront의 `/api/*` Cache Behavior가 ALB로 프록시하는 설정과 Default(`*`) Behavior의 에러 응답 리다이렉트 설정이 서로 독립적으로 동작한다. API 경로(`/api/*`)는 에러 응답 리다이렉트 대상이 아니며, ALB에서 반환하는 에러 코드가 그대로 프론트엔드에 전달된다.
