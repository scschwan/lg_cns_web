# Finance Tool 유지보수 내역서

> **작성일**: 2026-04-03
> **작업자**: 개발팀
> **브랜치**: `feature/stage1-ui-improvements`
> **커밋 범위**: `bcbfac7` ~ `a5eb0b2`

---

## 1. 작업 개요

사용자 피드백(계정원장 분석 Tool 질문 사전취합) 기반으로 총 9개 개선 항목을 3단계로 나누어 구현 완료.

| 단계 | 항목 | 상태 |
|------|------|------|
| 1단계 | 항목 1, 3, 7, 8 (UI 개선) | 완료 |
| 2단계 | 항목 4, 5, 6 (클러스터링 핵심) | 완료 |
| 3단계 | 항목 2, 9 (전처리 설정, Excel 다운로드) | 완료 |
| 추가 | 세목 열 자동 매핑 | 완료 |

---

## 2. 피드백 항목별 수정 내역

---

### 계정원장 분석

#### 2.1 Multi File 업로드

**피드백**: 생성된 세션 목록에 세로 스크롤바 추가 필요
**상태**: 개발팀 검토 후 내용 전달 예정

---

#### 2.2 Start Analysis

**피드백 1**: 오른쪽 하단 필수 항목 설정 세목 열 데이터에 "세목"열 선택되게 변경(현재는 목으로 매핑 됨)
**상태**: 완료
**수정 내용**:
- 파일: `frontend/src/pages/startAnalysis/StartAnalysisPage.jsx`
- 필수 항목 자동 매핑 로직에서 '세목' 컬럼명을 `fileInfo.accountColumnName`(업로드 시 지정된 '목')보다 **우선 매핑**하도록 변경
- 컬럼 목록에서 '세목' 정확 일치 → 부분 일치 순으로 검색, 없을 때만 기존 accountColumnName 폴백
- 커밋: `a5eb0b2`

**피드백 2**: 원본 데이터 창 크기 늘리기(크기 조절이 되면 베스트, 안된다면 가공이랑 반반씩 하면 되지 않을까 함)
**상태**: 완료 (크기 조절 + 반반 모두 구현)
**수정 내용**:
- 파일: `frontend/src/pages/startAnalysis/StartAnalysisPage.jsx`
- `react-resizable-panels` 라이브러리(v4.8.0) 도입하여 원본/가공 데이터 테이블 간 **드래그 리사이즈** 구현
- 기본 비율: 50:50, 사용자가 드래그로 자유롭게 조절 가능
- 원본 데이터 **접기/펼치기** 기능 추가: 헤더 클릭으로 원본 테이블을 접으면 가공 테이블이 전체 높이 사용
- 헤더는 PanelGroup 바깥에 배치하여 접힌 상태에서도 항상 표시
- 커밋: `b616c56`, `0eb2889`

---

#### 2.3 Preprocessing (전처리)

**피드백**: 구분자 변환, 불용어 제거는 사용자 계정 내에서 모든 세션에 동일하게 적용되게 수정 필요
**상태**: 완료
**수정 내용**:
- **Backend 신규 파일**:
  - `UserPreprocessingConfigDocument.java`: `user_preprocessing_config` MongoDB 컬렉션 모델 (userId unique index)
  - `UserPreprocessingConfigRepository.java`: findByUserId, deleteByUserId
  - `UserPreprocessingConfigController.java`: GET/PUT `/api/preprocessing/user-config`
- **Backend 수정 파일**:
  - `PreprocessingService.java`: `getUserConfig()`, `saveUserConfig()` 메서드 추가, `getOrCreateConfig()` 오버로드하여 새 세션 생성 시 사용자 설정 자동 적용
  - `PreprocessingController.java`: getConfig에서 userId 전달
- **Frontend 수정 파일**:
  - `preprocessingService.js`: `getUserConfig()`, `saveUserConfig()` API 메서드 추가
  - `PreprocessingPage.jsx`: "현재 설정을 사용자 기본값으로 저장" 버튼 추가
- **동작 방식**: 사용자가 구분자/불용어를 설정 후 "사용자 기본값으로 저장" 클릭 → 이후 모든 프로젝트의 새 세션에서 해당 설정이 기본값으로 자동 로드
- 커밋: `1043f01`

---

#### 2.4 Data Transform

**피드백**: 원본 데이터 크기 늘리기(크기 조절이 되면 베스트)
**상태**: 완료 (크기 조절 + 반반 모두 구현)
**수정 내용**:
- 파일: `frontend/src/pages/transform/DataTransformPage.jsx`
- Start Analysis와 동일하게 `react-resizable-panels` 적용 (원본 데이터 / 검색 결과 데이터 50:50 드래그 리사이즈)
- 접기/펼치기 기능 동일 적용
- `MultiSelectCheckList` 컴포넌트 내부에 잘못 배치된 useEffect 버그 수정 (`isOriginalCollapsed` ReferenceError 해소)
- 커밋: `b616c56`, `0eb2889`

---

#### 2.5 Clustering (클러스터링)

**피드백 1**: 추천 키워드는 프로젝트 내 모든 사용자에게 동일하게 보일 수 있도록 연동되어야 함
**상태**: 완료
**수정 내용**:
- **Backend**: `SearchKeywordHierarchy` 모델에 `projectId` 필드 추가, compound index를 `project_level_idx`, `project_parent_idx`로 변경
- **Backend**: `SearchKeywordHierarchyRepository`에 `findByProjectId*` 쿼리 메서드 추가
- **Backend**: `ClusteringService`의 키워드 계층 관련 메서드에서 sessionId 대신 projectId 기반으로 조회/저장
- **Frontend**: `clusteringService.js`, `detailClusteringService.js`의 keyword-hierarchy URL에서 sessionId 경로 유지 (Controller @RequestMapping 호환)하되 내부적으로 projectId 사용
- 커밋: `3060dad`

**피드백 2**: 클러스터링 단계에서 추천 키워드/공급업체 클릭 시 미병합 클러스터에 연동
**상태**: 기존 구현 완료 (안내)
**설명**: '자세히' 버튼을 누르면 해당 키워드/공급업체의 클러스터가 조회되도록 이미 구현되어 있음

**피드백 3**: 추가 병합 시 수정했던 클러스터명이 다시 바뀌는 현상 발생
**상태**: 완료
**수정 내용**:
- **Backend**: `ClusteringResult` 모델에 `customName` 필드 추가 (@Field("custom_name"))
- **Backend**: `ClusteringService.addToMergedCluster()`, `mergeFinalize()`에서 기존 customName 보존 로직 추가
- **Backend**: `DetailClusteringService`에도 동일 적용
- 커밋: `3060dad`

**피드백 4**: 병합 버튼 클릭 시 클러스터링 이름 입력하는 팝업에서 작성 후 등록
**상태**: 완료
**수정 내용**:
- **Frontend**: `ClusteringPage.jsx`, `DetailClusteringPage.jsx`에 병합 시 클러스터명 입력 Dialog 추가
- 수동 병합: 선택 항목 병합 시 클러스터명 입력 팝업 표시 후 확인 시 등록
- 자동 클러스터링: 체크된 키워드/공급업체 **항목별 개별 클러스터명** 입력 가능 (빈 값이면 항목명으로 자동 설정)
- **Backend**: `ClusteringController`, `DetailClusteringController`에서 `customMergeName` 파라미터 추출, Service에서 우선 적용
- 커밋: `3060dad`, `48b23dc`

---

### 대시보드

#### 2.6 클러스터명 열 길이 조정

**피드백**: 클러스터명 열 길이 좀 줄이면 좋을 것 같음
**상태**: 완료
**수정 내용**:
- Long List 도출, Short List 도출, Able 과제 등록 페이지의 '데이터(비용유형분류)' 컬럼에 `w-[50%]` 적용하여 데이터 컬럼 비율 확대
- 파일: `LongListPage.jsx`, `ShortListPage.jsx`, `AbleTaskRegisterPage.jsx`
- 커밋: `3060dad`

#### 2.7 상단 분석 히스토리 UI 변경

**피드백**: 상단 분석 히스토리 UI 변경 필요(지금 텍스트로만 되어 있음)
**상태**: 완료
**수정 내용**:
- 4개 메뉴 화면(Short List 도출, Able 과제 등록, 완료 과제 관리, Able 과제 관리) 모두에서 PhaseNavigationBar를 **카드 스타일 UI**로 변경
- `Card > CardContent` 구조, 색상 아이콘 배경 (ClipboardList, ListFilter, FilePlus, Settings, CircleCheckBig)
- 각 페이지의 Phase 수에 맞춰 `grid-cols-2/3/4/5` 레이아웃 적용
- 파일: `ShortListPage.jsx`, `AbleTaskRegisterPage.jsx`, `CompletedTaskManagePage.jsx`, `AbleTaskManagePage.jsx`
- 커밋: `3060dad`

#### 2.8 Able 과제 목록 Excel 다운로드

**피드백**: Able과제 목록에서 이슈랑 진척사항 반영된 전체 테이블 데이터 다운로드 기능
**상태**: 완료
**수정 내용**:
- **Backend**:
  - `AbleTaskService.java`: `exportTasksToExcel()` 메서드 추가 (SXSSFWorkbook, 20개 컬럼)
  - 포함 컬럼: No, 과제명, 대계정, 클러스터명, 세부클러스터명, 담당부서, 담당자명, 컨설턴트, 모수금액, 절감액, 실제절감액, 진척율(%), 상태, 등급, **이슈**, **진행사항**, 고객후속조치, 실행항목, 등록시간, 수정시간
  - `AbleTaskController.java`: `GET /api/projects/{projectId}/tasks/export/excel?status=` 엔드포인트 추가
- **Frontend**:
  - `costReductionService.js`: `exportTasksExcel()` API 메서드 추가
  - `AbleTaskManagePage.jsx`: CardHeader에 "Excel" 다운로드 버튼 추가 (전체 과제)
  - `CompletedTaskManagePage.jsx`: CardHeader에 "Excel" 다운로드 버튼 추가 (완료 과제 필터)
- 커밋: `1043f01`

---

## 3. 수정 파일 목록

### 3.1 신규 생성 파일

| 파일 경로 | 설명 |
|-----------|------|
| `backend/.../model/data/UserPreprocessingConfigDocument.java` | 사용자별 전처리 설정 모델 |
| `backend/.../repository/data/UserPreprocessingConfigRepository.java` | 사용자별 전처리 설정 Repository |
| `backend/.../controller/data/UserPreprocessingConfigController.java` | 사용자 전처리 설정 API Controller |

### 3.2 Backend 수정 파일

| 파일 경로 | 주요 변경 |
|-----------|-----------|
| `ClusteringResult.java` | customName 필드 추가 |
| `SearchKeywordHierarchy.java` | projectId 필드, compound index 추가 |
| `SearchKeywordHierarchyRepository.java` | findByProjectId* 쿼리 메서드 추가 |
| `ClusteringController.java` | customMergeName 파라미터 추출 |
| `ClusteringService.java` | customName 보존, projectId 기반 키워드계층 |
| `DetailClusteringController.java` | customMergeName 파라미터 추출 |
| `DetailClusteringService.java` | customName 보존, projectId 기반 키워드계층 |
| `PreprocessingService.java` | getUserConfig, saveUserConfig, getOrCreateConfig 오버로드 |
| `PreprocessingController.java` | getConfig에 userId 전달 |
| `AbleTaskService.java` | exportTasksToExcel 메서드 추가 |
| `AbleTaskController.java` | GET /export/excel 엔드포인트 추가 |

### 3.3 Frontend 수정 파일

| 파일 경로 | 주요 변경 |
|-----------|-----------|
| `StartAnalysisPage.jsx` | 드래그 리사이즈, 접기/펼치기, 세목 자동 매핑 |
| `DataTransformPage.jsx` | 드래그 리사이즈, 접기/펼치기, useEffect 버그 수정 |
| `ClusteringPage.jsx` | 병합 이름 Dialog, 항목별 개별 클러스터명 |
| `DetailClusteringPage.jsx` | 병합 이름 Dialog, 항목별 개별 클러스터명 |
| `LongListPage.jsx` | 데이터 컬럼 w-[50%] |
| `ShortListPage.jsx` | 데이터 컬럼 w-[50%], PhaseNavigationBar 카드 UI |
| `AbleTaskRegisterPage.jsx` | 데이터 컬럼 w-[50%], PhaseNavigationBar 카드 UI |
| `AbleTaskManagePage.jsx` | PhaseNavigationBar 카드 UI, Excel 다운로드 버튼 |
| `CompletedTaskManagePage.jsx` | PhaseNavigationBar 카드 UI, Excel 다운로드 버튼 |
| `PreprocessingPage.jsx` | 사용자 기본값 저장 버튼 |
| `clusteringService.js` | customMergeName, keyword-hierarchy URL |
| `detailClusteringService.js` | customMergeName, keyword-hierarchy URL |
| `preprocessingService.js` | getUserConfig, saveUserConfig |
| `costReductionService.js` | exportTasksExcel |
| `package.json` | react-resizable-panels 의존성 추가 |

### 3.4 DB 변경사항

| 컬렉션 | 변경 유형 | 내용 |
|--------|----------|------|
| `user_preprocessing_config` | **신규** | userId (unique), separators, stopwords, createdAt, updatedAt |
| `search_keyword_hierarchy` | **인덱스 변경** | projectId 필드 추가, project_level_idx / project_parent_idx compound index |
| `clustering_results` | **필드 추가** | custom_name 필드 (사용자 지정 클러스터명) |

---

## 4. 커밋 이력

| 커밋 | 설명 |
|------|------|
| `bcbfac7` | 세션 유휴 타임아웃, StartAnalysis 로딩/데이터 누락 수정 |
| `3060dad` | 1단계(UI)+2단계(클러스터링) 통합 구현 |
| `48b23dc` | 항목1 접기/스크롤 및 항목5 개별 클러스터명 수정 |
| `b616c56` | 항목1 접기/펼치기 근본 구조 변경 - 헤더를 PanelGroup 밖으로 분리 |
| `0eb2889` | 원본 테이블 가로/세로 스크롤바 표시 수정 |
| `1043f01` | 단계3 - 항목2(사용자 전처리 설정) + 항목9(Excel 다운로드) 구현 |
| `c2ee735` | 세목 열 자동 매핑 - '세목' 컬럼명 자동 인식 |
| `a5eb0b2` | 세목 열 자동 매핑 - '세목' 컬럼을 fileInfo.accountColumnName보다 우선 매핑 |
