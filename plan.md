# Finance Tool 서비스 개선 계획서

## 개요

- **작성일**: 2026-04-02
- **목적**: 사용자 피드백 기반 Finance Tool UI/UX 및 기능 개선
- **범위**: Frontend 7건, Backend 5건 (총 9개 개선 항목, Clustering/Detail Clustering 일괄 적용)
- **기준 브랜치**: `master`

---

## 개선 항목 목록

---

### 1. Start Analysis 원본/가공 데이터 테이블 높이 50/50 비율 조정 + 리사이즈 기능

- **요구사항**: Start Analysis 페이지의 원본데이터 테이블과 가공데이터 테이블의 **높이값**을 50:50 비율로 조정하고, 사용자가 드래그로 높이를 조절할 수 있도록 개선
- **현재 상태**:
  - `frontend/src/pages/startAnalysis/StartAnalysisPage.jsx`
  - 좌측 패널(`xl:col-span-8`) 내부에 두 테이블이 **수직으로 쌓여있음**:
    - **원본 데이터 테이블** (Line 782~823): `flex-shrink-0` + `maxHeight="250px"` → 고정 높이 약 250px
    - **가공 데이터 테이블** (Line 825~): `flex-1 flex flex-col min-h-0` → 남은 공간 전체 차지
  - 현재 비율: 약 **1:3~1:4** (원본 250px 고정, 가공이 나머지 전부)
- **수정 계획**:
  - **Frontend 변경 (1차 - 높이 50:50 기본값 적용)**:
    - 파일: `frontend/src/pages/startAnalysis/StartAnalysisPage.jsx`
    - 원본 테이블 Card: `flex-shrink-0` → `flex-1` 변경, `maxHeight="250px"` 제거
    - 가공 테이블 Card: `flex-1` 유지
    - 두 테이블 모두 `flex-1`로 설정하여 **동일 높이(50:50)** 분배
    - `min-h-0`을 양쪽 모두 추가하여 flex overflow 처리
  - **Frontend 변경 (2차 - 리사이즈 기능)**:
    - `react-resizable-panels` 라이브러리 설치 (`npm install react-resizable-panels`)
    - 현재 `package.json`에 **미설치** 상태
    - 두 테이블을 `PanelGroup(direction="vertical")` > `Panel` > `PanelResizeHandle` > `Panel` 구조로 래핑
    - 기본 비율: `defaultSize={50}` (각 패널 50%)
    - 최소 비율: `minSize={20}` (각 패널 최소 20%)
    - 리사이즈 핸들: 가로줄 + 드래그 커서 스타일
  - **Backend 변경**: 없음
- **우선순위**: MEDIUM
- **예상 난이도**: 중 (라이브러리 도입 시)
- **의존성**: 항목 3과 동일 패턴, 함께 구현 권장


---

### 2. Preprocessing 사용자 설정 (구분자/불용어 사용자 레벨 저장)

- **요구사항**: 현재 세션 단위로만 저장되는 구분자/불용어 설정을 사용자 레벨로 저장하여, 새 세션 생성 시 사용자 기본 설정을 자동 로드
- **현재 상태**:
  - **Frontend**:
    - `frontend/src/services/preprocessingService.js` Line 36-52: `getConfig()`/`saveConfig()` API가 세션 기반 (`/api/projects/{projectId}/sessions/{sessionId}/preprocessing/config`)
    - `frontend/src/pages/preprocessing/PreprocessingPage.jsx` Line 219-277: `useEffect`에서 세션별 config 로드, `saveConfigToServer()`에서 세션별 저장
  - **Backend**:
    - `backend/src/main/java/com/example/finance/model/data/PreprocessingConfigDocument.java`: `sessionId`에 `@Indexed(unique = true)` (Line 25-26)
    - `backend/src/main/java/com/example/finance/repository/data/PreprocessingConfigRepository.java`: `findBySessionId()`, `deleteBySessionId()` 메서드만 존재
    - `backend/src/main/java/com/example/finance/controller/data/PreprocessingController.java`: 모든 API가 `/{sessionId}/preprocessing/` 경로
- **수정 계획**:
  - **Backend 변경 (신규 파일 생성 필요)**:
    1. 신규 Model: `UserPreprocessingConfigDocument.java`
       - 위치: `backend/src/main/java/com/example/finance/model/data/`
       - 필드: `id`, `userId` (unique index), `separators`, `stopwords`, `createdAt`, `updatedAt`
       - 컬렉션명: `user_preprocessing_config`
    2. 신규 Repository: `UserPreprocessingConfigRepository.java`
       - 위치: `backend/src/main/java/com/example/finance/repository/data/`
       - 메서드: `findByUserId(String userId)`, `deleteByUserId(String userId)`
    3. Service 수정: `PreprocessingService.java`
       - `getUserConfig(String userId)` 메서드 추가
       - `saveUserConfig(String userId, List<ConfigItem> separators, List<ConfigItem> stopwords)` 메서드 추가
       - 기존 `getOrCreateConfig(sessionId)` 수정: 세션 config가 없을 때 사용자 config를 기본값으로 사용
    4. Controller 수정: `PreprocessingController.java`
       - `GET /api/preprocessing/user-config` - 사용자 설정 조회
       - `PUT /api/preprocessing/user-config` - 사용자 설정 저장
       - 기존 세션 config API는 그대로 유지 (하위 호환)
  - **Frontend 변경**:
    1. `preprocessingService.js`에 추가:
       ```javascript
       getUserConfig: async () => {
           const response = await api.get('/api/preprocessing/user-config');
           return response.data;
       },
       saveUserConfig: async ({ separators, stopwords }) => {
           const response = await api.put('/api/preprocessing/user-config', { separators, stopwords });
           return response.data;
       },
       ```
    2. `PreprocessingPage.jsx` 수정:
       - 세션 config 로드 시 (Line 222-238), 세션 config가 비어있으면 `getUserConfig()` 호출하여 기본값 세팅
       - "사용자 기본값으로 저장" 버튼 추가 (설정 패널 하단)
  - **DB 변경사항**: `user_preprocessing_config` 컬렉션 신규 생성 (userId unique index)
- **우선순위**: MEDIUM
- **예상 난이도**: 중
- **의존성**: 없음

---

### 3. Data Transform 원본/검색결과 데이터 테이블 높이 50/50 비율 조정 + 리사이즈 기능

- **요구사항**: Data Transform 페이지의 원본데이터 테이블과 검색결과 데이터 테이블의 **높이값**을 50:50 비율로 조정하고, 사용자가 드래그로 높이를 조절할 수 있도록 개선
- **현재 상태**:
  - `frontend/src/pages/transform/DataTransformPage.jsx`
  - 좌측 패널(`xl:col-span-8`) 내부에 두 테이블이 **수직으로 쌓여있음**:
    - **원본 데이터 테이블** (Line 655~): `flex-shrink-0` + `maxHeight="250px"` → 고정 높이 약 250px
    - **검색결과 데이터 테이블** (Line 700~): `flex-1 flex flex-col min-h-0` → 남은 공간 전체 차지
  - 현재 비율: 약 **1:3~1:4** (StartAnalysisPage와 동일한 구조)
- **수정 계획**:
  - **Frontend 변경 (1차 - 높이 50:50 기본값 적용)**:
    - 파일: `frontend/src/pages/transform/DataTransformPage.jsx`
    - 원본 테이블 Card: `flex-shrink-0` → `flex-1` 변경, `maxHeight="250px"` 제거
    - 검색결과 테이블 Card: `flex-1` 유지
    - 두 테이블 모두 `flex-1`로 설정하여 **동일 높이(50:50)** 분배
  - **Frontend 변경 (2차 - 리사이즈 기능)**:
    - 항목 1과 동일하게 `react-resizable-panels` 적용
    - `PanelGroup(direction="vertical")` > `Panel(defaultSize={50})` > `PanelResizeHandle` > `Panel(defaultSize={50})`
  - **Backend 변경**: 없음
- **우선순위**: MEDIUM
- **예상 난이도**: 중 (라이브러리 도입 시)
- **의존성**: 항목 1과 동일 패턴, 함께 구현 권장
 
 
 
---

### 4. Clustering 추천 키워드 공유 범위 변경 (세션 → 프로젝트)

- **요구사항**: 클러스터링 단계의 추천 키워드 계층(Lv1/Lv2/Lv3)을 세션 단위가 아닌 프로젝트 단위로 공유하여, 같은 프로젝트 내 다른 세션에서도 동일한 추천 키워드를 사용할 수 있도록 변경
- **현재 상태**:
  - **Backend Model**: `SearchKeywordHierarchy.java`
    - `sessionId` 필드 기반 (Line 35-36)
    - Compound Index: `session_level_idx`, `session_parent_idx` (Line 27-28)
  - **Backend Repository**: `SearchKeywordHierarchyRepository.java`
    - 모든 쿼리 메서드가 `findBySessionId*` 패턴
  - **Frontend Service**: `clusteringService.js` Line 254-259
    - `getKeywordHierarchy(projectId, sessionId)` → `GET .../sessions/{sessionId}/clustering/keyword-hierarchy`
  - **상세 클러스터링**도 동일 패턴: `detailClusteringService.js`의 `getKeywordHierarchy`
- **수정 계획**:
  - **Backend 변경**:
    1. Model 수정: `SearchKeywordHierarchy.java`
       - `projectId` 필드 추가
       - 인덱스 변경: `session_level_idx` → `project_level_idx` (`project_id` + `level`)
       - 인덱스 변경: `session_parent_idx` → `project_parent_idx` (`project_id` + `parent_id`)
       - `sessionId` 필드는 하위 호환을 위해 유지 (nullable)
    2. Repository 수정: `SearchKeywordHierarchyRepository.java`
       - `findByProjectIdOrderByLevelAscDisplayOrderAsc(String projectId)` 추가
       - `findByProjectIdAndLevelOrderByDisplayOrderAsc(String projectId, Integer level)` 추가
       - `findByProjectIdAndParentIdOrderByDisplayOrderAsc(String projectId, String parentId)` 추가
       - `deleteByProjectId(String projectId)` 추가
       - 기존 `findBySessionId*` 메서드는 마이그레이션 완료 후 제거
    3. Controller/Service 수정:
       - 키워드 계층 API의 조회/추가/삭제 로직을 `sessionId` 기반에서 `projectId` 기반으로 변경
       - ClusteringController, DetailClusteringController 모두 수정 필요
  - **Frontend 변경**:
    1. `clusteringService.js` Line 254-259:
       - `getKeywordHierarchy` URL을 `/api/projects/${projectId}/clustering/keyword-hierarchy`로 변경
       - 또는 기존 URL 유지하면서 백엔드에서 projectId 기반 조회하도록 변경 (후자 권장 - URL 변경 최소화)
    2. `detailClusteringService.js`도 동일하게 수정
  - **DB 변경사항**: `search_keyword_hierarchy` 컬렉션의 인덱스 변경, 기존 데이터에 `projectId` 필드 추가 마이그레이션 필요
- **우선순위**: HIGH
- **예상 난이도**: 중
- **의존성**: 없음

---

### 5. Clustering 병합 시 사용자 지정 클러스터명 지원

- **요구사항**: 클러스터 병합 시 자동 생성되는 클러스터명(키워드 연결) 대신 사용자가 직접 클러스터명을 입력할 수 있도록 다이얼로그 추가
- **현재 상태**:
  - **Backend**: `ClusteringService.java`
    - `doMergeClusters()` Line 820-821: `String.join("_", allKeywords)`로 자동 생성 후 100자 초과 시 truncate
    - `mergeFinalize()` Line 1088-1092: 동일한 방식으로 이름 재생성 (배치 병합 시)
    - `customMergeName` 파라미터 미존재 (Grep 결과 확인)
  - **Frontend**: `ClusteringPage.jsx`
    - `handleMerge()` Line 832-940: `window.confirm`으로 단순 확인만 받고 병합 실행
    - `autoMergeConfirm` 다이얼로그 (Line 2278+)가 참고할 만한 Dialog 패턴으로 존재
    - `addToMergedCluster` (clusteringService.js Line 193-200): 기존 병합 클러스터에 추가 시에도 이름이 자동 재생성됨
- **수정 계획**:
  - **Backend 변경**:
    1. `ClusteringService.java` 수정:
       - `mergeClusters()` 메서드에 `customMergeName` 파라미터 추가
       - `doMergeClusters()` Line 820: `customMergeName`이 있으면 해당 값 사용, 없으면 기존 로직
       - `mergeFinalize()` Line 1088: `customMergeName` 파라미터 추가, 있으면 해당 값 사용
       - `addToMergedCluster` 관련 로직: 기존 병합 클러스터에 항목 추가 시 기존 `clusterName`을 보존 (현재는 재계산하여 덮어씀)
    2. `ClusteringController.java` Line 148-171 수정:
       - merge API body에서 `customMergeName` 필드 파싱 추가
       - `mergeFinalize` API에도 `customMergeName` 전달
    3. `DetailClusteringService.java` / `DetailClusteringController.java`에도 동일 적용
  - **Frontend 변경**:
    1. `ClusteringPage.jsx` 수정:
       - 병합 전 "클러스터명 입력" 다이얼로그 추가 (autoMergeConfirm 다이얼로그 패턴 참조)
       - 다이얼로그에 텍스트 입력 필드 + "자동 생성" 체크박스
       - `handleMerge()` 수정: 다이얼로그에서 입력받은 이름을 `clusteringService.mergeClusters`에 전달
       - `handleAddToMerged()` 수정: 기존 이름 보존 옵션
    2. `clusteringService.js` 수정:
       - `mergeClusters` API 호출 시 `customMergeName` 필드 추가
       - `mergeFinalize` API 호출 시 `customMergeName` 필드 추가
    3. `DetailClusteringPage.jsx`에도 동일 적용 (handleMerge at Line 491+)
    4. `detailClusteringService.js`에도 동일 적용
- **우선순위**: HIGH
- **예상 난이도**: 중
- **의존성**: 없음

---

### 6. Clustering / Detail Clustering addToMergedCluster 시 기존 클러스터명 보존

- **요구사항**: 기존 병합 클러스터에 미병합 항목을 추가할 때, 기존에 설정된 클러스터명이 자동 재생성으로 덮어쓰이지 않도록 보존. **Clustering 및 Detail Clustering 모두 적용**
- **현재 상태**:
  - **Clustering**:
    - `clusteringService.js` Line 193-200: `addToMergedCluster` API 호출
    - 백엔드에서 추가 병합 시 부모 클러스터의 키워드/이름을 재계산하여 기존 사용자 지정 이름이 손실됨
  - **Detail Clustering**:
    - `detailClusteringService.js` Line 122-131: `addToMergedCluster` API 호출
    - `DetailClusteringPage.jsx` Line 513, 534, 543, 602, 636: addToMergedCluster 호출 위치
    - `DetailClusteringService.java` Line 690-710+: 백엔드 addToMergedCluster 로직
    - `DetailClusteringController.java` Line 172-185: API 엔드포인트
    - 3-Phase 배치 병합(mergeStart/mergeFinalize)은 Detail Clustering에 미구현 (단순 merge만 지원)
- **수정 계획**:
  - **Backend 변경 (Clustering)**:
    1. `ClusteringResult` 모델에 `customName` 필드 추가 (사용자 지정 이름 여부 플래그)
    2. `ClusteringService.java`의 `addToMergedCluster` 관련 로직 수정:
       - 부모 클러스터에 `customName`이 설정되어 있으면 `clusterName`을 재생성하지 않음
       - `keywords`, `count`, `totalAmount`, `dataIndices`만 갱신
    3. `mergeFinalize()` Line 1088-1092 수정: `parent.getCustomName() != null`이면 이름 보존
  - **Backend 변경 (Detail Clustering)**:
    1. `DetailClusteringService.java` Line 690-710+: 동일하게 `customName` 체크 로직 추가
       - addToMergedCluster 시 부모 클러스터의 `customName`이 설정되어 있으면 이름 재생성 건너뜀
    2. `DetailClusteringController.java`: 필요 시 `customMergeName` 파라미터 전달 지원
  - **Frontend 변경**: API 변경 없음 (백엔드 로직 수정만으로 해결)
- **우선순위**: HIGH
- **예상 난이도**: 중
- **의존성**: 항목 5와 함께 구현 권장 (customName 필드 공유)

---

### 7. Dashboard(Able 과제 관리) 테이블 컬럼 폭 조정

- **요구사항**: Able 과제 관리 테이블에서 클러스터명 컬럼을 축소하고 데이터 관련 컬럼(모수금액, 절감액 등)의 비율을 확대
- **현재 상태**:
  - `frontend/src/pages/abletaskmanage/AbleTaskManagePage.jsx`
  - Line 775-786: TableHeader 정의
    - `w-[50px]` (No), 클러스터명에 `max-w-[120px]`, 세부클러스터명에 `max-w-[120px]`, 진척율에 `w-[120px]`, 관리에 `w-[130px]`
    - 모수금액/절감액 컬럼에는 별도 width 미지정
- **수정 계획**:
  - **Frontend 변경**:
    - 파일: `frontend/src/pages/abletaskmanage/AbleTaskManagePage.jsx`
    - Line 779: 클러스터명 `max-w-[120px]` → `max-w-[80px]` 또는 `w-[80px]`
    - Line 779: 세부클러스터명 `max-w-[120px]` → `max-w-[80px]` 또는 `w-[80px]`
    - Line 780-781: 모수 금액/절감액 컬럼에 `w-[15%]` 등 비율 지정
    - Line 794-795: TableCell에도 동일하게 max-width 축소 적용
  - **Backend 변경**: 없음
- **우선순위**: LOW
- **예상 난이도**: 하
- **의존성**: 없음

---

### 8. Dashboard PhaseNavigationBar 카드 스타일 UI 변경

- **요구사항**: 현재 수평 네비게이션 바 형태의 PhaseNavigationBar를 Summary Cards와 유사한 카드 기반 UI로 변경
- **현재 상태**:
  - `frontend/src/pages/abletaskmanage/AbleTaskManagePage.jsx`
  - `PhaseNavigationBar` 컴포넌트 (Line 518-585):
    - 4개 Phase를 수평 `flex` 레이아웃으로 배치
    - 각 Phase가 `button` 요소로 구성 (클릭 시 페이지 네비게이션)
    - `bg-blue-600` (활성), `bg-blue-50` (과거), `bg-muted/50` (미래) 스타일
  - Summary Cards (Line 728-733):
    - `grid grid-cols-4 gap-4` 레이아웃
    - 각 카드에 아이콘 + 레이블 + 값 구조
    - 색상이 있는 아이콘 배경 (`bg-blue-500`, `bg-purple-500` 등)
- **수정 계획**:
  - **Frontend 변경**:
    - 파일: `frontend/src/pages/abletaskmanage/AbleTaskManagePage.jsx`
    - `PhaseNavigationBar` 컴포넌트 리팩토링:
      - `flex items-center gap-1.5` → `grid grid-cols-4 gap-4` 레이아웃
      - 각 Phase를 `Card > CardContent` 구조로 변경
      - Summary Cards (Line 728-733)의 디자인 패턴 참조:
        - 좌측 색상 아이콘 + 우측 텍스트 정보
        - 활성 Phase에 파란색 강조 (border 또는 배경)
      - ArrowRight 아이콘 제거, 카드 하단 또는 좌측에 Phase 진행 상태 표시
    - 다른 페이지(LongListPage, ShortListPage, AbleTaskRegisterPage)에서도 동일 컴포넌트 사용하고 있으므로 PhaseNavigationBar 변경 시 모든 페이지에 자동 적용됨
  - **Backend 변경**: 없음
- **우선순위**: LOW
- **예상 난이도**: 중
- **의존성**: 없음

---

### 9. Able 과제 / 완료 과제 Excel 다운로드 (이슈/진행사항 포함)

- **요구사항**: **Able 과제 관리** 및 **완료 과제 관리** 페이지 모두에서 과제 목록을 Excel로 다운로드하는 기능 추가. 각 과제의 이슈(issues) 및 진행사항(progressDetails) 필드를 포함
- **현재 상태**:
  - **Backend Model**: `AbleTask.java`
    - `progressDetails` (Line 82-83): String 필드
    - `issues` (Line 85-86): String 필드
  - **Backend Controller**: `AbleTaskController.java`
    - Excel export 관련 API 엔드포인트 없음
    - 기존 `GET /api/projects/{projectId}/tasks` API는 목록 조회만 제공
  - **Frontend - Able 과제**: `AbleTaskManagePage.jsx`
    - Excel 다운로드 버튼 없음
  - **Frontend - 완료 과제**: `CompletedTaskManagePage.jsx`
    - Line 304-309: `costReductionService.getTasks()`로 전체 과제 조회 후 `status === '완료'` 필터링
    - Excel 다운로드 버튼 없음
  - **참고**: `exportService.js` Line 181-189에 `downloadExcel()` 유틸리티 함수 이미 존재 (재사용 가능)
- **수정 계획**:
  - **Backend 변경 (신규 메서드 추가)**:
    1. `AbleTaskService.java`에 `exportTasksToExcel(String projectId, String statusFilter)` 메서드 추가:
       - `statusFilter` 파라미터로 전체/진행중/완료 구분
       - 프로젝트 내 과제 조회 (상태별 필터링)
       - Apache POI (`SXSSFWorkbook`)를 사용하여 Excel 생성
       - 포함 컬럼: 과제명, 대계정, 클러스터명, 세부클러스터명, 담당부서, 담당자명, 컨설턴트, 모수금액, 절감액, 진척율, 상태, **이슈(issues)**, **진행사항(progressDetails)**, 등록시간, 수정시간
       - S3에 업로드 후 Presigned URL 반환, 또는 byte[] 직접 스트리밍 반환
    2. `AbleTaskController.java`에 추가:
       ```java
       @GetMapping("/export/excel")
       public ResponseEntity<byte[]> exportExcel(
               @PathVariable String projectId,
               @RequestParam(required = false) String status,
               @CurrentUser UserPrincipal userPrincipal) {
           // status: null=전체, "진행중"=Able과제, "완료"=완료과제
       }
       ```
  - **Frontend 변경**:
    1. `costReductionService.js`에 추가:
       ```javascript
       exportTasksExcel: async (projectId, status) => {
           const params = status ? `?status=${status}` : '';
           const response = await api.get(
               `/api/projects/${projectId}/tasks/export/excel${params}`,
               { responseType: 'blob' }
           );
           return response.data;
       },
       ```
    2. `AbleTaskManagePage.jsx` 수정:
       - "과제 목록" CardHeader (Line 764) 영역에 "Excel 다운로드" 버튼 추가
       - 클릭 시 `costReductionService.exportTasksExcel(projectId)` 호출
       - 기존 `exportService.downloadExcel()` 유틸리티 재사용 또는 Blob → 다운로드 링크 변환
    3. **`CompletedTaskManagePage.jsx` 수정** (신규 적용):
       - 과제 목록 영역에 "Excel 다운로드" 버튼 추가
       - 클릭 시 `costReductionService.exportTasksExcel(projectId, '완료')` 호출
       - AbleTaskManagePage와 동일한 다운로드 로직 적용
  - **DB 변경사항**: 없음 (기존 모델의 필드 활용)
- **우선순위**: MEDIUM
- **예상 난이도**: 중
- **의존성**: 없음

---

## 구현 순서

의존성과 우선순위를 고려한 최적 구현 순서:

| 순서 | 항목 | 이유 |
|------|------|------|
| **1** | 항목 1, 3 (테이블 높이 50:50 + 리사이즈) | Frontend 변경, `react-resizable-panels` 라이브러리 도입 |
| **2** | 항목 7 (테이블 컬럼 폭) | Frontend만 변경, 즉시 적용 가능, 난이도 하 |
| **3** | 항목 5, 6 (병합 클러스터명 지정/보존) | HIGH 우선순위, Backend + Frontend 동시 변경 필요. Clustering + Detail Clustering 모두 적용. 항목 5의 `customName` 필드를 항목 6에서도 사용하므로 함께 구현 |
| **4** | 항목 4 (추천 키워드 프로젝트 공유) | HIGH 우선순위, DB 인덱스 변경 + 데이터 마이그레이션 필요 |
| **5** | 항목 2 (전처리 사용자 설정) | 신규 컬렉션 생성 필요, Backend + Frontend 변경 |
| **6** | 항목 8 (PhaseNavigationBar 리팩토링) | UI 리팩토링, 기능 변경 없음 |
| **7** | 항목 9 (Excel 다운로드) | 신규 기능 추가, Able 과제 + 완료 과제 모두 적용, Backend 서비스 메서드 + API 엔드포인트 신규 생성 |

---

## 신규 생성 파일 목록

| 파일 경로 | 설명 |
|-----------|------|
| `backend/src/main/java/com/example/finance/model/data/UserPreprocessingConfigDocument.java` | 사용자별 전처리 설정 모델 |
| `backend/src/main/java/com/example/finance/repository/data/UserPreprocessingConfigRepository.java` | 사용자별 전처리 설정 Repository |

---

## DB 변경사항 요약

| 컬렉션 | 변경 유형 | 내용 |
|--------|----------|------|
| `user_preprocessing_config` | **신규 생성** | `userId` (unique index), `separators`, `stopwords`, `createdAt`, `updatedAt` |
| `search_keyword_hierarchy` | **인덱스 변경** | `session_level_idx` → `project_level_idx` (`project_id` + `level`), `session_parent_idx` → `project_parent_idx` (`project_id` + `parent_id`). `projectId` 필드 추가 |
| `search_keyword_hierarchy` | **데이터 마이그레이션** | 기존 레코드에 `projectId` 값 채워넣기 (sessionId → FileSession → projectId 매핑) |
| `clustering_results` | **필드 추가** | `custom_name` (String, nullable) - 사용자 지정 클러스터명 플래그/값 |

---

## 주의사항 및 리스크

### 1. 키워드 계층 마이그레이션 (항목 4)
- `search_keyword_hierarchy` 컬렉션의 기존 데이터에 `projectId`를 채워넣는 마이그레이션 스크립트 필요
- `sessionId` → `file_sessions` 컬렉션에서 `projectId` 조회 → `search_keyword_hierarchy`에 `projectId` 업데이트
- 마이그레이션 완료 전까지 기존 `findBySessionId` 메서드 유지 필요

### 2. 인덱스 변경 시 DocumentDB 주의 (항목 4)
- DocumentDB에서 Compound Index 변경 시 기존 인덱스 삭제 후 재생성 필요
- 운영 환경에서는 Background Index Build 사용 권장
- 인덱스 변경 중 쿼리 성능 저하 가능성 있음

### 3. 병합 클러스터명 보존 (항목 5, 6)
- `mergeFinalize()`에서 이름 재생성 로직이 핵심 — `customName` 필드가 있을 때 이름 재생성을 건너뛰도록 조건 분기 필요
- `addToMergedCluster` 호출 시에도 부모의 `customName` 보존 확인
- 기존 병합된 클러스터 데이터에는 `customName`이 null이므로 기존 동작에 영향 없음

### 4. Excel Export 파일 크기 (항목 9)
- 과제 수가 많을 경우 (수백건 이상) Excel 파일 크기가 커질 수 있음
- 메모리 사용량 고려하여 Apache POI의 `SXSSFWorkbook` (Streaming) 방식 사용 권장
- CloudFront Response timeout (360초) 내에 완료되어야 함

### 5. 하위 호환성
- 모든 API 변경은 기존 요청 형식과 하위 호환 유지
- `customMergeName`은 optional 파라미터로 추가 (없으면 기존 자동 생성 로직 사용)
- 세션 기반 전처리 config API는 그대로 유지 (사용자 설정은 별도 엔드포인트)

### 6. 테스트 범위
- 항목 1, 3: 원본/가공 테이블 높이 50:50 확인, 리사이즈 핸들 드래그 동작 확인
- 항목 7: 시각적 확인 (브라우저 테스트)
- 항목 2: 새 세션 생성 시 사용자 기본값 로드 확인
- 항목 4: 같은 프로젝트 내 다른 세션에서 키워드 공유 확인
- 항목 5, 6: Clustering + Detail Clustering 모두에서 병합 → 이름 지정 → 추가 병합 → 이름 보존 확인
- 항목 8: 모든 비용절감 페이지에서 PhaseNavigationBar 정상 렌더링 확인
- 항목 9: Able 과제 + 완료 과제 양쪽 모두 Excel 다운로드 → 파일 열기 → 이슈/진행사항 데이터 정합성 확인
