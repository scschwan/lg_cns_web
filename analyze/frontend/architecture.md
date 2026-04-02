최종 수정일: 2026-04-03 (서비스 개선 반영)

# Finance Tool - 프론트엔드 아키텍처 문서

## 1. 프론트엔드 개요

### 1.1 기술 스택

| 분류 | 기술 | 버전 | 용도 |
|------|------|------|------|
| **코어** | React | 18.2 | UI 라이브러리 |
| **빌드 도구** | Vite | 7.3 | 빌드 및 개발 서버 |
| **라우팅** | React Router DOM | 6.30 | SPA 라우팅 |
| **HTTP 클라이언트** | Axios | 1.13 | API 통신 (api.js 공통 인스턴스 + systemService.js 개별 인스턴스) |
| **UI 프레임워크** | MUI (Material UI) | 5.18 | DataGrid, Dialog, Paper 등 |
| **UI 프레임워크** | Radix UI | 최신 | Shadcn/UI 스타일 Headless 컴포넌트 |
| **스타일링** | TailwindCSS | 3.4 | 유틸리티 기반 CSS |
| **스타일 유틸** | class-variance-authority | 0.7 | 컴포넌트 변형 관리 |
| **스타일 유틸** | tailwind-merge / clsx | 최신 | 클래스명 병합 |
| **아이콘** | Lucide React | 0.563 | 아이콘 시스템 |
| **차트** | Recharts | 3.7 | 데이터 시각화 |
| **파일 처리** | xlsx (SheetJS) | 0.18 | Excel 파일 파싱/생성 |
| **파일 업로드** | react-dropzone | 14.3 | 드래그 앤 드롭 파일 업로드 |
| **CSS 후처리** | PostCSS + Autoprefixer | 최신 | CSS 호환성 |
| **애니메이션** | tailwindcss-animate | 1.0 | CSS 애니메이션 유틸리티 |
| **패널 리사이즈** | react-resizable-panels | 4.8 | 수직 드래그 리사이즈 패널 (StartAnalysis, DataTransform) |

### 1.2 프로젝트 구조

```
frontend/
├── index.html                    # 진입점 HTML
├── package.json                  # 의존성 관리
├── vite.config.js                # Vite 빌드 설정
├── tailwind.config.js            # TailwindCSS 설정
├── postcss.config.js             # PostCSS 설정
├── components.json               # Shadcn/UI 설정
├── .env                          # 개발 환경 변수
├── .env.production               # 프로덕션 환경 변수
├── deploy.ps1                    # 배포 스크립트
├── cloudfront-config.json        # CloudFront 설정
└── src/
    ├── App.jsx                   # 루트 컴포넌트 (라우팅 정의)
    ├── index.jsx                 # React DOM 렌더링 진입점
    ├── index.css                 # 전역 CSS (TailwindCSS 디렉티브)
    ├── components/               # 재사용 컴포넌트
    │   ├── layout/               # 레이아웃 컴포넌트
    │   ├── common/               # 공통 UI 컴포넌트
    │   ├── ui/                   # Shadcn/UI 기반 기초 컴포넌트
    │   ├── upload/               # 업로드 관련 컴포넌트
    │   ├── costreduction/        # 원가절감 관련 컴포넌트
    │   ├── PrivateRoute.jsx      # 인증 라우트 가드
    │   ├── ErrorBoundary.jsx     # 에러 바운더리
    │   ├── SessionExpiredToast.jsx # 세션 만료 알림
    │   └── AdvancedTable.jsx     # 고급 테이블 컴포넌트
    ├── pages/                    # 페이지 컴포넌트
    │   ├── auth/                 # 인증 (로그인/회원가입)
    │   ├── project/              # 프로젝트 관리
    │   ├── upload/               # Step 1: 파일 업로드
    │   ├── startAnalysis/        # Step 2: 분석 시작
    │   ├── preprocessing/        # Step 3: 전처리
    │   ├── transform/            # Step 4: 데이터 변환
    │   ├── clustering/           # Step 5: 클러스터링
    │   ├── export/               # Step 6: 내보내기
    │   ├── detailclustering/     # Step 7: 상세 클러스터링
    │   ├── longlist/             # 비용절감: Long List
    │   ├── shortlist/            # 비용절감: Short List
    │   ├── abletask/             # 비용절감: Able 과제 등록
    │   ├── abletaskmanage/       # 비용절감: Able 과제 관리
    │   ├── completedtask/        # 비용절감: 완료 과제 관리
    │   ├── admin/                # 관리자 페이지
    │   └── error/                # 에러 페이지
    ├── services/                 # API 서비스 레이어
    ├── hooks/                    # 커스텀 React 훅
    ├── context/                  # React Context (전역 상태)
    ├── constants/                # 상수 정의
    ├── utils/                    # 유틸리티 함수
    └── lib/                      # 라이브러리 유틸 (cn 함수)
```

---

## 2. 컴포넌트 아키텍처

### 2.1 컴포넌트 계층 구조

```
ErrorBoundary
└── AuthProvider (Context)
    └── BrowserRouter
        ├── MaintenanceDialog (전역 서비스 차단)
        └── Routes
            ├── [Public] LoginPage / RegisterPage / TestPage
            ├── [Public Legacy] NewServiceLayout > Pages
            ├── [Private] LayoutWrapper (Navbar)
            │   ├── ProjectsPage
            │   ├── ProjectSettingsPage
            │   └── DashboardLayout (Sidebar)
            │       ├── MultiFileUploadPage (Step 1)
            │       ├── DashboardUploadPage
            │       ├── StartAnalysisPage (Step 2)
            │       ├── PreprocessingPage (Step 3)
            │       ├── DataTransformPage (Step 4)
            │       ├── ClusteringPage (Step 5)
            │       ├── ExportPage (Step 6)
            │       └── DetailClusteringPage (Step 7)
            ├── [Private] CostReductionLayout
            │   ├── LongListPage
            │   ├── ShortListPage
            │   ├── AbleTaskRegisterPage
            │   ├── AbleTaskManagePage
            │   └── CompletedTaskManagePage
            └── [Private+Admin] LayoutWrapper > AdminLayout
                ├── AdminDashboard
                ├── UserManagement
                ├── ProjectManagement
                ├── S3Management
                ├── SessionMonitoring
                ├── AuditLogPage
                └── AdminProfile
```

### 2.2 컴포넌트 분류

| 분류 | 위치 | 설명 |
|------|------|------|
| **레이아웃** | `components/layout/` | 전체 레이아웃 구조 (Navbar, Sidebar, DashboardLayout 등) |
| **공통 컴포넌트** | `components/common/` | 재사용 가능한 공통 UI (SessionHeader, Pagination, StyledDataGrid, StyledGroupBox, ActionButton, ProgressDialog, MaintenanceDialog, ViewerModeOverlay) |
| **UI 기초** | `components/ui/` | Shadcn/UI 스타일 기초 컴포넌트 (Button, Card, Dialog, Input, Table, Select, Tabs, Badge, Alert, Avatar, Breadcrumb, Checkbox, Label, Progress, Separator, Textarea) |
| **업로드** | `components/upload/` | PartitionDialog (파티션 분석 다이얼로그) |
| **원가절감** | `components/costreduction/` | RawDataModal, ClusteringImportDialog |
| **페이지** | `pages/` | 각 라우트에 대응하는 페이지 컴포넌트 |

---

## 3. 라우팅 구조

### 3.1 React Router 구성

프로젝트는 `react-router-dom` v6 기반의 클라이언트 사이드 라우팅을 사용한다. 최상위에서 `BrowserRouter`로 감싸고, `Routes`와 `Route`로 경로를 정의한다.

**라우팅 패턴:**
- **Public Routes**: 인증 없이 접근 가능 (로그인, 회원가입, 테스트, 레거시 Preview)
- **Private Routes**: `PrivateRoute` 래퍼로 인증 필요
- **Admin Routes**: `PrivateRoute`의 `requireAdmin` prop으로 관리자 권한 필요
- **Nested Routes**: Admin 페이지는 `AdminLayout` 내부에 중첩 라우팅 사용

### 3.2 PrivateRoute 인증 흐름

```
사용자 접근 요청
    │
    ▼
PrivateRoute 컴포넌트
    │
    ├── loading === true → 로딩 스피너 표시 ("세션 확인 중...")
    │
    ├── isAuthenticated === false → /login으로 리다이렉트 (현재 위치 state 전달)
    │
    ├── requireAdmin && role !== 'ADMIN' → /projects로 리다이렉트
    │
    └── 인증 완료 → children 렌더링
```

### 3.3 레이아웃 래퍼

- **LayoutWrapper**: `Navbar` + 메인 콘텐츠 영역 (showNavbar prop으로 Navbar 토글)
- **DashboardLayout**: `Sidebar` (7단계 프로세스 네비게이션) + `ViewerModeOverlay` + 콘텐츠
- **CostReductionLayout**: 독립 헤더 + `CostReductionSidebar` + `ViewerModeOverlay` + 콘텐츠
- **NewServiceLayout**: 독립 헤더 + `NewServiceSidebar` + 콘텐츠 (레거시 Preview용)
- **AdminLayout**: Admin 전용 레이아웃 (중첩 라우팅의 `Outlet` 사용)

---

## 4. 상태 관리

### 4.1 AuthContext (전역 인증 상태)

**위치**: `src/context/AuthContext.jsx`

AuthContext는 애플리케이션 전체의 인증 상태를 관리하는 유일한 전역 Context이다.

**제공하는 값:**

| 속성/메서드 | 타입 | 설명 |
|-------------|------|------|
| `user` | object/null | 현재 로그인 사용자 정보 (userId, email, name, role) |
| `isAuthenticated` | boolean | 인증 여부 (`!!user`) |
| `loading` | boolean | 초기 세션 검증 중 여부 |
| `login(credentials)` | async function | 로그인 수행 |
| `register(userData)` | async function | 회원가입 수행 |
| `logout()` | function | 로그아웃 (localStorage 정리) |
| `updateUser(fields)` | function | 사용자 정보 부분 업데이트 |
| `validateSession()` | async function | 세션 유효성 서버 검증 |

**세션 관리 전략:**
1. **초기 검증**: 앱 마운트 시 `GET /api/auth/me`로 서버 검증
2. **주기적 검증**: 1분마다 서버에 세션 유효성 확인
3. **클라이언트 토큰 체크**: JWT의 `exp` 클레임으로 즉시 만료 판단 (서버 요청 없이)
4. **탭 복귀 검증**: `visibilitychange` / `focus` 이벤트 시 토큰 만료 즉시 감지
5. **네트워크 복구 검증**: `online` 이벤트 시 세션 검증
6. **글로벌 이벤트**: `session-expired` 커스텀 이벤트로 api.js 인터셉터와 동기화

### 4.2 커스텀 훅 기반 상태 관리

프로젝트는 Redux/Zustand 같은 전역 상태 라이브러리 없이, **커스텀 훅 패턴**으로 로컬/공유 상태를 관리한다.

| 훅 | 파일 | 용도 |
|----|------|------|
| `useAuth()` | `context/AuthContext.jsx` | 인증 상태 접근 (Context 소비) |
| `useEditorLock(projectId)` | `hooks/useEditorLock.js` | 비용절감 대시보드 편집자 잠금 (Redis 기반) |
| `useSessionEditorLock(projectId, sessionId)` | `hooks/useSessionEditorLock.js` | 세션 편집자 잠금 (Redis 기반, Step 2~7) |
| `useUploadPageLock(projectId)` | `hooks/useUploadPageLock.js` | 업로드 페이지 편집자 잠금 (프로젝트 단위) |
| `useViewerMode(projectId)` | `hooks/useViewerMode.js` | 뷰어 권한 확인 (VIEWER 역할 체크) |
| `useDashboardStatus(projectId)` | `hooks/useDashboardStatus.js` | 비용절감 대시보드 상태 조회 |

**편집자 잠금 패턴 (Distributed Lock):**
- `acquire` → 잠금 획득 시도
- 30초마다 `heartbeat` 전송 (Redis TTL 60초)
- 언마운트 시 `release` (페이지 내 전환 시 500ms 지연으로 경쟁 방지)
- `beforeunload` 시 즉시 해제

---

## 5. API 서비스 레이어

### 5.1 서비스 구조

```
services/
├── api.js                    # Axios 인스턴스 + 인터셉터 (핵심)
├── authService.js            # 인증 API (로그인/회원가입/프로필)
├── projectService.js         # 프로젝트 CRUD + 멤버 관리
├── uploadService.js          # 파일 업로드/세션 관리/컬럼 매핑 (Step 1-2) ⚠ addFilesToSession URL 불일치 주의
├── preprocessingService.js   # 전처리 API (Step 3)
├── transformService.js       # 데이터 변환 API (Step 4)
├── clusteringService.js      # 클러스터링 API (Step 5)
├── exportService.js          # 내보내기/세션 완료 API (Step 6)
├── detailClusteringService.js # 상세 클러스터링 API (Step 7)
├── costReductionService.js   # 비용절감 대시보드 API (Long/Short List, Able 과제)
├── adminService.js           # 관리자 API (사용자/프로젝트/S3/세션/감사로그)
├── systemService.js          # 시스템 상태 API (유지보수 모드, Lambda 진행률) ⚠ 별도 axios 인스턴스 사용
└── mockDataService.js        # UI 테스트용 더미 데이터
```

### 5.2 Axios 인터셉터 (api.js)

**Request 인터셉터:**
1. 인증 불필요 요청(`/api/auth/*`) 통과
2. 토큰 없으면 즉시 세션 만료 처리
3. Access Token 만료 시 사전 갱신 (Request 전에 Refresh)
4. Refresh Token도 만료 시 즉시 로그아웃
5. 갱신 중 다른 요청은 큐에 대기 (중복 갱신 방지)

**Response 인터셉터:**
1. 정상 응답: 연속 에러 카운터 리셋
2. CloudFront HTML 응답 감지 (프록시 타임아웃 방어)
3. 401: Refresh Token으로 재시도 -> 실패 시 로그아웃
4. 403: 백엔드 인증 403만 세션 만료 처리 (CloudFront/WAF 403 구분)
5. 500+ / 네트워크 에러: 연속 에러 카운팅 (DB 과부하 보조 탐지, 임계값 5회)

### 5.3 토큰 관리

**저장 위치:**
- `localStorage.authToken` - JWT Access Token
- `localStorage.refreshToken` - JWT Refresh Token
- `localStorage.user` - 사용자 정보 JSON

**토큰 유틸리티** (`utils/tokenUtils.js`):
- `decodeJwtPayload(token)` - JWT 페이로드 디코딩 (서명 검증 없이)
- `isTokenExpired(token, bufferSeconds=30)` - 만료 여부 확인 (30초 버퍼)
- `isAuthTokenExpired()` - Access Token 만료 확인
- `isRefreshTokenExpired()` - Refresh Token 만료 확인

**토큰 갱신 흐름:**
```
Access Token 만료 감지
    │
    ├── Request Interceptor: 요청 전 사전 갱신
    │   └── POST /api/auth/refresh { refreshToken }
    │       ├── 성공 → 새 Access Token 저장 + 원래 요청 진행
    │       └── 실패 → 세션 만료 처리 (로그아웃)
    │
    └── Response Interceptor: 401 응답 시 후속 갱신
        └── POST /api/auth/refresh { refreshToken }
            ├── 성공 → 새 Access Token + 원래 요청 재시도
            └── 실패 → 세션 만료 처리 (로그아웃)
```

### 5.4 uploadService API URL 불일치 [Phase 3 피드백 반영]

프론트엔드 `uploadService.js`의 `addFilesToSession` 메서드에서 사용하는 API 경로가 백엔드 엔드포인트와 불일치한다.

| 항목 | 값 |
|------|-----|
| **프론트엔드 호출 경로** | `POST /api/projects/{projectId}/upload/sessions/{sessionId}/files` |
| **백엔드 정의 경로** | `POST /api/projects/{projectId}/upload/sessions/{sessionId}/add-files` |
| **불일치 부분** | 마지막 경로 세그먼트: `/files` vs `/add-files` |
| **영향** | 세션에 파일 추가 시 404 에러 발생 가능 |

**실제 소스 확인 결과** (`uploadService.js` 라인 577-584):
```javascript
addFilesToSession: async (projectId, sessionId, fileIds) => {
    const response = await api.post(
        `/api/projects/${projectId}/upload/sessions/${sessionId}/files`,  // ← /files 사용
        { fileIds }
    );
    return response.data;
},
```

**조치 필요**: 프론트엔드 경로를 `/add-files`로 수정하거나, 백엔드 컨트롤러 매핑을 `/files`로 변경하여 양측을 일치시켜야 한다. (심각도: Critical)

### 5.5 systemService 인증 설정 [Phase 3 피드백 반영]

`systemService.js`는 공통 Axios 인스턴스(`api.js`)를 사용하지 않고, 순수 `axios`를 직접 import하여 사용한다. 이로 인해 `api.js`의 Request/Response 인터셉터(토큰 자동 갱신, CloudFront HTML 감지, 연속 에러 카운팅 등)가 적용되지 않는다.

**인증 없이 호출하는 API 경로:**
| API 경로 | 인증 토큰 | 설명 |
|----------|-----------|------|
| `GET /api/system/maintenance-status` | 있으면 첨부, 없으면 생략 | 유지보수 모드 조회 (5초 폴링) |
| `GET /api/system/upload-progress` | 있으면 첨부, 없으면 생략 | Lambda 업로드 진행률 조회 |

**실제 동작 방식**: `localStorage.getItem('authToken')`으로 토큰을 직접 확인하여, 토큰이 존재하고 유효한 값이면 `Authorization: Bearer {token}` 헤더를 수동으로 첨부한다. 토큰이 없거나 `'undefined'`/`'null'` 문자열이면 헤더를 생략한다.

**백엔드와의 불일치**: 백엔드 `SecurityConfig`에서 `/api/system/**` 경로는 `permitAll`로 설정되어 있지 않다 (`anyRequest().authenticated()`에 해당). 따라서 인증 토큰 없이 호출 시 401 에러가 발생한다. 실제로는 `MaintenanceDialog`가 `AuthProvider` 하위에서 렌더링되므로 대부분의 경우 토큰이 존재하지만, 로그인 전 상태에서는 실패할 수 있다. (심각도: Critical)

**조치 필요**: 백엔드 `SecurityConfig`에 `/api/system/maintenance-status`, `/api/system/upload-progress` 경로를 `permitAll`로 추가하거나, `systemService.js`가 `api.js` 공통 인스턴스를 사용하도록 수정해야 한다.

### 5.6 CloudFront-ALB HTTP 구간 JWT 평문 전송 위험 [Phase 3 피드백 반영]

CloudFront에서 ALB Origin으로의 통신이 HTTP(비암호화)로 이루어지고 있다. API 요청의 `Authorization` 헤더에 포함된 JWT 토큰과 요청/응답 본문의 사용자 데이터가 CloudFront Edge -> ALB 구간에서 평문으로 전송된다.

| 항목 | 현재 상태 |
|------|----------|
| **CloudFront Origin Protocol** | HTTP Only |
| **ALB HTTPS Listener** | 미설정 |
| **전송되는 민감 정보** | JWT Access/Refresh Token, 사용자 데이터, 금융 Excel 데이터 |
| **위험 수준** | AWS 내부 네트워크이므로 외부 도청 위험은 낮으나, 금융 데이터 취급 시 컴플라이언스 요구사항 불충족 가능 |

**권장 조치**: ALB에 ACM 인증서를 적용하고 CloudFront Origin Protocol Policy를 HTTPS로 변경해야 한다.

### 5.7 CORS 설정 정합성 [Phase 3 피드백 반영]

현재 CORS 설정은 다음과 같이 구성되어 있다.

**S3 `finance-excel-uploads` 버킷 CORS:**
- Allowed Origins: `https://d3ipfpkjg02npk.cloudfront.net`, `http://localhost:3000`
- Allowed Methods: `PUT, GET, HEAD` (POST 미포함)
- Allowed Headers: `Content-Type, x-amz-*`

**백엔드 SecurityConfig CORS:**
- Allowed Origins: `http://localhost:3000`, `https://finance-tool.com`, `https://d3ipfpkjg02npk.cloudfront.net`

**주의사항:**
1. `https://finance-tool.com` 커스텀 도메인이 백엔드 CORS에는 있으나 S3 CORS에는 없다. 커스텀 도메인으로 서비스 시 S3 Presigned URL 업로드에서 CORS 에러가 발생할 수 있다.
2. S3 CORS의 Allowed Methods에 `POST`가 없다. 현재 Presigned URL이 PUT 기반이므로 문제없으나, 향후 POST 기반 Multipart 업로드 사용 시 CORS 오류가 발생할 수 있다.
3. 프론트엔드 Vite 개발 서버 포트(3000)와 CORS 허용 Origin(`localhost:3000`)이 일치하므로 개발 환경에서 정상 동작한다.

---

## 6. UI 컴포넌트 시스템

### 6.1 MUI 기반 컴포넌트

MUI v5를 사용하여 데이터 중심의 복잡한 UI를 구현한다.

| 컴포넌트 | 용도 |
|----------|------|
| `@mui/x-data-grid` | 대용량 데이터 그리드 (페이징, 정렬, 가상 스크롤) |
| `Paper` | 카드형 섹션 래퍼 (StyledGroupBox) |
| `Button` | MUI 스타일 액션 버튼 (ActionButton) |
| `Box`, `Typography` | 레이아웃 및 타이포그래피 |
| `TextField`, `Select`, `MenuItem` | 폼 컨트롤 |

**커스텀 MUI 래퍼:**
- `StyledGroupBox` - C# WinForms GroupBox 스타일의 Paper 래퍼
- `StyledDataGrid` - 컬럼 리사이즈/드래그 순서 변경을 지원하는 커스텀 테이블
- `ActionButton` - 색상 프리셋 기반 MUI Button (complete/search/apply/delete/merge/add)
- `Pagination` - C# WinForms 스타일 페이지네이션 (100/500/1000/5000/10000 페이지 크기)
- `SessionHeader` - 세션명 표시 헤더

### 6.2 Radix UI 기반 컴포넌트 (Shadcn/UI 스타일)

Radix UI Headless 컴포넌트 위에 TailwindCSS 스타일을 입힌 Shadcn/UI 패턴을 사용한다.

| 컴포넌트 | Radix 패키지 | 파일 |
|----------|-------------|------|
| `AlertDialog` | `@radix-ui/react-alert-dialog` | `ui/alert.jsx` |
| `Avatar` | `@radix-ui/react-avatar` | `ui/avatar.jsx` |
| `Checkbox` | `@radix-ui/react-checkbox` | `ui/checkbox.jsx` |
| `Dialog` | `@radix-ui/react-dialog` | `ui/dialog.jsx` |
| `Label` | `@radix-ui/react-label` | `ui/label.jsx` |
| `Progress` | `@radix-ui/react-progress` | `ui/progress.jsx` |
| `Select` | `@radix-ui/react-select` | `ui/select.jsx` |
| `Separator` | `@radix-ui/react-separator` | `ui/separator.jsx` |
| `Tabs` | `@radix-ui/react-tabs` | `ui/tabs.jsx` |
| `Slot` | `@radix-ui/react-slot` | Button의 `asChild` 패턴 |

**순수 TailwindCSS 컴포넌트** (Radix 미사용):
- `Button` (`ui/button.jsx`) - CVA 기반 변형 시스템 (default/destructive/outline/secondary/ghost/link)
- `Card` (`ui/card.jsx`) - 카드 레이아웃
- `Input` (`ui/input.jsx`) - 텍스트 입력
- `Textarea` (`ui/textarea.jsx`) - 멀티라인 입력
- `Badge` (`ui/badge.jsx`) - 뱃지/태그
- `Table` (`ui/table.jsx`) - HTML 테이블 스타일링
- `Breadcrumb` (`ui/breadcrumb.jsx`) - 경로 탐색

### 6.3 TailwindCSS 스타일링 전략

**설정 특징:**
- **다크 모드**: `class` 기반 (수동 토글 가능, 현재 미사용)
- **커스텀 폰트**: `Pretendard` (한국어 최적화 폰트)
- **CSS 변수 기반 테마**: `hsl(var(--primary))` 패턴으로 Shadcn/UI 테마 시스템 적용
- **애니메이션**: `tailwindcss-animate` 플러그인 사용

**CSS 변수 기반 색상 토큰:**
```
--background, --foreground
--primary, --primary-foreground
--secondary, --secondary-foreground
--destructive, --destructive-foreground
--muted, --muted-foreground
--accent, --accent-foreground
--popover, --popover-foreground
--card, --card-foreground
--border, --input, --ring, --radius
```

**유틸리티 함수** (`lib/utils.js`):
```js
cn(...inputs)  // clsx + tailwind-merge로 클래스명 병합 및 충돌 해결
```

---

## 7. 레이아웃 시스템

### 7.1 레이아웃 컴포넌트 구성

```
┌─────────────────────────────────────────────┐
│  Navbar (h-14, border-b)                     │
│  [Finance Logo] [Title]     [Admin] [User ▼] │
├──────────┬──────────────────────────────────┤
│ Sidebar  │  Main Content                     │
│ (w-64)   │  (flex-1, overflow-hidden)        │
│          │                                    │
│ Step 1~7 │  [ViewerModeOverlay]              │
│ 또는      │    [Page Component]               │
│ CR Steps │                                    │
│          │                                    │
└──────────┴──────────────────────────────────┘
```

### 7.2 각 레이아웃 상세

**LayoutWrapper**
- 최상위 레이아웃 래퍼
- Navbar 표시 + 콘텐츠 영역
- `showNavbar` prop으로 Navbar 토글 가능

**DashboardLayout** (`components/layout/DashboardLayout.jsx`)
- 데이터 처리 7단계 전용 레이아웃
- 좌측 `Sidebar` (7단계 프로세스 네비게이션) + 우측 콘텐츠
- `ViewerModeOverlay`로 VIEWER 권한 사용자 인터랙션 차단

**Sidebar** (`components/layout/Sidebar.jsx`)
- 7단계 프로세스 네비게이션 (Step 1~7)
- 단계별 아이콘, 완료/잠금 상태 표시
- 세션 정보(sessionData)에 따른 step 활성화/비활성화 제어
- Step 1 이동 시 확인 다이얼로그 표시

**CostReductionLayout** (`components/layout/CostReductionLayout.jsx`)
- 비용 절감 대시보드 전용 레이아웃
- 독립 헤더 (프로젝트 목록 이동 버튼 + 타이틀)
- `CostReductionSidebar` (5단계: Long List, Short List, Able 과제 등록/관리, 완료 과제 관리)
- `ViewerModeOverlay` 포함

**NewServiceLayout** (`components/layout/NewServiceLayout.jsx`)
- 레거시 Preview용 레이아웃
- 독립 헤더 + `NewServiceSidebar`
- 인증 불필요, 마크업 확인용

**AdminLayout** (`pages/admin/AdminLayout.jsx`)
- 관리자 전용 레이아웃
- `Outlet`을 사용한 중첩 라우팅

### 7.3 Navbar

- 좌측: Finance Tool 로고 + 제목 (클릭 시 `/projects` 이동)
- 우측: 관리자 버튼 (ADMIN만 표시), 사용자 드롭다운 메뉴
- 드롭다운: 프로필 설정, 로그아웃
- 프로필 설정 Dialog: 기본 정보(이름, 아바타 색상) + 비밀번호 변경 탭

---

## 8. 주요 기능 모듈

### 8.1 인증 (Login / Register)

**로그인 흐름:**
1. 이메일 + 비밀번호 입력
2. `POST /api/auth/login` → Access Token + Refresh Token 반환
3. `localStorage`에 토큰 및 사용자 정보 저장
4. ADMIN 역할이면 `/admin`, 일반 사용자면 `/projects`로 이동
5. 이미 인증된 사용자는 자동 리다이렉트

**회원가입 흐름:**
1. 이름, 이메일, 비밀번호 입력
2. `POST /api/auth/register` → 계정 생성
3. 관리자 승인 대기 (PENDING 상태)

**세션 만료 처리:**
- `SessionExpiredToast`: 로그인 페이지에서 세션 만료 알림 표시
- `sessionStorage.sessionExpired` 플래그로 만료 상태 전달

### 8.2 파일 업로드 (Step 1: MultiFileUploadPage)

**업로드 흐름:**
1. **Presigned URL 요청**: `POST /api/projects/{projectId}/upload/presigned-url`
2. **S3 직접 업로드**: XMLHttpRequest로 Presigned URL에 PUT (진행률 추적)
3. **업로드 완료 처리**: `POST /api/projects/{projectId}/upload/files` (MongoDB 등록)
4. **Lambda 처리 대기**: 1초마다 폴링으로 진행 상태 확인

**기능:**
- Drag & Drop 멀티 파일 업로드 (react-dropzone)
- Excel 파일 파싱 (xlsx)
- 계정명/금액 컬럼 설정
- 파티션 분석 (계정명별 그룹핑)
- 세션 생성/일괄 생성/병합/삭제
- 파일 재분석 (Lambda 재트리거)
- 편집자 잠금 (`useUploadPageLock`)

### 8.3 데이터 처리 파이프라인 (Step 2~7)

**Step 2 - Start Analysis (계정 분석 시작):**
- 세션 데이터 로드, 컬럼 매핑, 가시성 설정
- 데이터 행 숨김/원복, 표준화
- process_data 생성 (Step 3 진입 준비)

**Step 3 - Preprocessing (전처리):**
- 구분자/불용어 기반 키워드 추출
- NLP 기반 형태소 분석 키워드 추출
- 1글자 키워드 제거
- 설정 저장/조회, 진행 상태 폴링

**Step 4 - Data Transform (데이터 변환):**
- 키워드 통계 조회 (group by count + 금액 합산)
- 키워드 검색 (like 검색)
- 키워드 치환 (fromKeywords → toKeyword)
- 원본/검색 데이터 페이징 조회

**Step 5 - Clustering (클러스터링):**
- 클러스터 생성 (공급업체/코스트센터 포함 옵션)
- 미병합/병합 클러스터 조회 및 관리
- 클러스터 병합: 단일 병합, 3-Phase 배치 병합, 필터 기반 전체 선택 병합
- 클러스터 해제: 전체 해제, 부분 해제
- 병합 클러스터 재병합, 추가 병합
- 미정 항목 자동 병합, 클러스터명 변경
- 고급 검색 (컬럼 선택, 완전일치, 제외, 결과내 재검색)
- 키워드 계층 관리 (Lv1/Lv2/Lv3)

**Step 6 - Export (내보내기):**
- 전체 데이터 조회 (클러스터명 + 세부 클러스터명 포함)
- 병합 클러스터 목록 및 상세 데이터 조회
- 클러스터명 수정
- 컬럼 가시성(제거열) 설정
- Excel 내보내기 (선택/전체)
- 세션 완료 처리 (비동기, 진행률 폴링)

**Step 7 - Detail Clustering (상세 클러스터링):**
- Step 5의 병합 클러스터 내부를 세부 클러스터링
- 미병합/병합 세부 클러스터 관리
- 고급 검색, 키워드 계층 관리

### 8.4 원가절감 (비용 절감 대시보드)

**Long List 도출:**
- 트리 구조 데이터 조회
- 통계/차트 조회 (계정명별, 통계ID별)
- 항목 선택/저장 (경량 저장: statisticsIds만 전송)
- 원시 데이터 모달 (RawDataModal)

**Short List 도출:**
- Long List 선택 항목 기반 세부 분석
- 트리/통계/차트/항목 통계 조회
- 선택 저장, 선택 트리 조회

**Able 과제 등록/관리:**
- 과제 CRUD (생성/수정/삭제/초기화)
- 과제 문서 관리 (S3 업로드, 링크 추가, 다운로드)
- 주간 진행 현황 CRUD
- 과제 요약 통계

**완료 과제 관리:**
- 완료된 과제 현황 관리

**대시보드 공통:**
- 대시보드 초기화/상태 조회/페이즈 전환
- 편집자 잠금 (`useEditorLock`)
- 클러스터링 Excel 임포트 (ClusteringImportDialog)
- 대시보드 배치 생성 (세션 기반)

### 8.5 관리자 기능

**사용자 관리:**
- 사용자 목록 조회, 승인/거부, 일괄 승인/거부
- 사용자 정보 수정, 비밀번호 초기화, 삭제

**프로젝트 관리:**
- 전체 프로젝트 목록, 상세 조회
- 멤버 역할 변경, 멤버 추가/삭제

**S3 관리:**
- S3 파일 목록 조회, 고아 파일 탐지
- 파일 삭제, 고아 파일 정리

**세션 모니터링:**
- 전체 세션 목록 조회, 세션 초기화

**감사 로그:**
- 시스템 로그 조회 (필터링)
- 사용자 활동 로그 기록

**시스템 관리:**
- 유지보수 모드 설정 (MaintenanceDialog로 서비스 차단)
- Lambda 상태 초기화

---

## 9. 빌드 및 배포

### 9.1 Vite 빌드 설정

**`vite.config.js` 주요 설정:**

```javascript
{
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }  // @ → src/ 별칭
  },
  server: {
    port: 3000,       // 개발 서버 포트
    host: '0.0.0.0',  // 외부 접근 허용
    open: true         // 브라우저 자동 열기
  },
  build: {
    outDir: 'build',   // 빌드 출력 디렉토리
    sourcemap: false   // 소스맵 비활성화 (프로덕션)
  }
}
```

### 9.2 환경 변수 관리

| 파일 | 환경 | 내용 |
|------|------|------|
| `.env` | 개발 | `VITE_API_BASE_URL=http://finance-alb-*.elb.amazonaws.com` |
| `.env.production` | 프로덕션 | `VITE_API_BASE_URL=` (빈 값 → 상대 경로, CloudFront 프록시) |

**사용 방식:**
```javascript
const API_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';
```

- 개발 환경: ALB 직접 연결 또는 localhost:8080 (백엔드 로컬)
- 프로덕션: 빈 문자열(`""`)이 `baseURL`로 설정되어 상대 경로 요청 → CloudFront에서 같은 도메인으로 프록시

**[Phase 3 피드백 반영] .env.production 폴백 위험:**

`api.js`에서 `??` (Nullish Coalescing) 연산자를 사용하고 있다:
```javascript
const API_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';
```

- `.env.production`에서 `VITE_API_BASE_URL=` (빈 값) → 빈 문자열(`""`)은 `??`에서 null/undefined가 아니므로 폴백이 발생하지 않음 → 상대 경로로 정상 동작
- **위험**: `.env.production` 파일 자체가 누락되거나 `VITE_API_BASE_URL` 키가 없는 경우 → `undefined`가 되어 `http://localhost:8080`으로 폴백 → 프로덕션에서 모든 API 호출 실패
- **권장 조치**: 빌드 스크립트에서 `.env.production` 파일 존재 및 `VITE_API_BASE_URL` 키 존재를 사전 검증하는 로직 추가

### 9.3 배포 인프라

- **빌드 출력**: `frontend/build/` 디렉토리
- **호스팅**: AWS CloudFront + S3 (SPA 정적 파일 배포)
- **배포 스크립트**: `deploy.ps1` (PowerShell)
- **CloudFront 설정**: `cloudfront-config.json`
- **API 프록시**: CloudFront를 통해 ALB(백엔드)로 프록시

### 9.4 상수 정의

**프로세스 단계** (`constants/processSteps.js`):
- 7단계 프로세스 정의 (UPLOAD → FILE_LOAD → PREPROCESSING → TRANSFORM → CLUSTERING → EXPORT → DETAIL_CLUSTERING)
- 단계 검색, 다음/이전 단계, 진행률 계산, 접근 가능 여부 유틸리티

**페이지네이션** (`constants/pagination.js`):
- 페이지 크기 옵션: [100, 500, 1000, 5000, 10000]
- 기본 페이지 크기: 1000

**색상** (`constants/colors.js`):
- C# WinForms FinanceTool 색상 테마 반영
- MUI 버튼 스타일 프리셋 (complete/search/apply/delete/merge/add)

### 9.5 유틸리티

**포매터** (`utils/formatters.js`):
- `formatNumber()` - 한국어 숫자 콤마 포맷
- `formatCurrency()` - 금액 단위 변환 (원/천원/백만원/억원)
- `formatDate()` - 한국어 날짜 포맷
- `formatFileSize()` - 파일 크기 단위 변환
- `formatPercent()` - 백분율 포맷

---

## 10. 인프라 장애 시 프론트엔드 대응 [Phase 3 피드백 반영]

### 10.1 단일 AZ 장애 시 영향 분석

현재 인프라가 단일 AZ에 집중 배치되어 있으므로, AZ 장애 시 프론트엔드에 다음과 같은 영향이 발생한다.

**AZ 2c 장애 시 (DocumentDB + Redis 위치):**
| 영향 범위 | 프론트엔드 증상 | 현재 대응 |
|-----------|---------------|----------|
| 모든 API 호출 실패 | 500 에러 연속 발생 | `api.js` 연속 에러 카운팅 (`consecutiveServerErrors >= 5`) → 콘솔 경고 출력 |
| 편집자 잠금 불가 | `useEditorLock`, `useSessionEditorLock` 잠금 획득 실패 | 에러 처리 로직 존재하나 사용자 대면 알림 부족 |
| 업로드 진행률 조회 불가 | Lambda 처리 상태 확인 불가 | 폴링 실패 시 에러 표시 |

**AZ 2a 장애 시 (NAT Gateway 위치):**
| 영향 범위 | 프론트엔드 증상 | 현재 대응 |
|-----------|---------------|----------|
| Lambda S3/SQS 접근 불가 | Excel 업로드 후 처리가 진행되지 않음 | 폴링 타임아웃 후 에러 표시 |
| ECS 외부 서비스 접근 불가 | 일부 기능 장애 가능 | 개별 에러 핸들링 |

### 10.2 현재 에러 처리 메커니즘

1. **ErrorBoundary** (최상위): React 렌더링 에러 포착, 복구 UI 제공
2. **api.js 연속 에러 감지**: 서버 에러/타임아웃이 5회 연속 발생 시 `console.warn` 출력 (사용자 대면 알림 없음)
3. **CloudFront HTML 응답 감지**: 프록시 타임아웃 시 `text/html` content-type 감지 → 서비스 에러 메시지
4. **MaintenanceDialog**: 유지보수 모드 시 전체 서비스 차단 UI

### 10.3 개선 권장 사항

- 연속 에러 감지 시 사용자 대면 알림 UI(토스트/배너)를 추가하여 "서버 연결 불안정" 상태를 표시
- 네트워크 에러 시 자동 재시도(exponential backoff) 적용 검토
- 서비스 상태 페이지 연동 또는 인라인 서비스 상태 표시 검토

---

## 11. CloudFront SPA 라우팅 정합성 [Phase 3 피드백 반영]

CloudFront Custom Error Response 설정에 의해 React Router의 클라이언트 사이드 라우팅이 지원된다.

| CloudFront 설정 | 값 |
|-----------------|-----|
| HTTP Error Code | 403, 404 |
| Response Page Path | `/index.html` |
| HTTP Response Code | 200 |
| Error Caching TTL | 0초 |

이 설정으로 S3에서 존재하지 않는 경로(예: `/projects/123/upload`)로 직접 접근 시 403/404 대신 `index.html`이 반환되고, React Router가 클라이언트 측에서 라우팅을 처리한다. 프론트엔드의 모든 라우트(`/login`, `/projects`, `/admin/*`, `/projects/:projectId/sessions/:sessionId/*` 등)가 이 설정으로 정상 동작함을 확인했다.

Error Caching TTL이 0초로 설정되어 있어 새로운 정적 자산 배포 후에도 캐시된 에러 응답으로 인한 문제가 발생하지 않는다.
