# 비용 절감 대시보드 개발 일정

> **작성일**: 2026-02-19
> **참조 문서**: [아키텍처 설계서](./architecture-cost-reduction.md)
> **참조 문서**: [cluster_statistics 명세](./cluster-statistics-spec.md)

---

## 1. 전체 개발 일정 요약

| Phase | 작업 내용 | 주요 산출물 |
|---|---|---|
| **Phase 1** | 프로젝트 완료 + 대시보드 기반 + 편집자 잠금 | Dashboard 컬렉션, 편집자 잠금, 카드 버튼, 레이아웃 |
| **Phase 2** | Long List 백엔드 + 프론트엔드 연동 | 트리 API, 차트 API, Long List 페이지 완성 |
| **Phase 3** | Short List + 단계 전환 | Short List 페이지, 단계 전환 로직, 잠금 확인 |
| **Phase 4** | Able 과제 등록 | 과제 CRUD, 문서 관리, S3 업로드, 등록 폼 |
| **Phase 5** | Able 과제 관리 + 완료 과제 관리 | 관리 테이블 CRUD, 요약/차트, 완료 처리 |

---

## 2. Phase 1: 프로젝트 완료 + 대시보드 기반 + 편집자 잠금

### 2.1 Backend 작업

| # | 작업 내용 | 파일 (신규/수정) | 의존성 |
|---|---|---|---|
| B1-1 | `CostReductionPhase` enum 생성 | `backend/.../enums/CostReductionPhase.java` (신규) | - |
| B1-2 | `CostReductionDashboard` 모델 생성 | `backend/.../model/costreduction/CostReductionDashboard.java` (신규) | B1-1 |
| B1-3 | `CostReductionDashboardRepository` 생성 | `backend/.../repository/costreduction/CostReductionDashboardRepository.java` (신규) | B1-2 |
| B1-4 | `RedisService`에 `setIfAbsent` 추가 | `backend/.../service/common/RedisService.java` (수정) | - |
| B1-5 | `CostReductionDashboardService` 생성 | `backend/.../service/costreduction/CostReductionDashboardService.java` (신규) | B1-3, B1-4 |
| B1-6 | `CostReductionDashboardController` 생성 | `backend/.../controller/costreduction/CostReductionDashboardController.java` (신규) | B1-5 |
| B1-7 | 요청/응답 DTO 생성 | `backend/.../dto/request/costreduction/` (신규) | - |
| B1-8 | `SecurityConfig` 경로 확인 | `backend/.../config/SecurityConfig.java` (확인) | - |

**구현 상세:**

```java
// B1-1: CostReductionPhase.java
public enum CostReductionPhase {
    LONG_LIST,
    SHORT_LIST,
    ABLE_REGISTER,
    ABLE_MANAGE,
    COMPLETED_MANAGE
}
```

```java
// B1-4: RedisService.java 추가 메서드
public Boolean setIfAbsent(String key, String value, Duration timeout) {
    return redisTemplate.opsForValue().setIfAbsent(key, value, timeout);
}
```

```java
// B1-5: CostReductionDashboardService 핵심 메서드
public class CostReductionDashboardService {
    // 대시보드 초기화 (최초 진입)
    public DashboardStatusResponse initDashboard(String projectId, String userId, String userName);

    // 편집자 잠금 획득 (Redis SET NX + MongoDB 저장)
    public LockResponse acquireEditorLock(String projectId, String userId, String userName);

    // 하트비트 (Redis EXPIRE 갱신)
    public void heartbeat(String projectId, String userId);

    // 잠금 해제 (Redis DEL + MongoDB 삭제)
    public void releaseLock(String projectId, String userId);

    // 대시보드 상태 조회
    public DashboardStatusResponse getStatus(String projectId, String userId);

    // 단계 전환 (유효성 검증 + 부수효과)
    public DashboardStatusResponse transitionPhase(String projectId, String userId, CostReductionPhase targetPhase);
}
```

### 2.2 Frontend 작업

| # | 작업 내용 | 파일 (신규/수정) | 의존성 |
|---|---|---|---|
| F1-1 | `ProjectsPage.jsx` 수정: "비용 절감 수행" 버튼 추가 | `frontend/.../pages/project/ProjectsPage.jsx` (수정) | - |
| F1-2 | `CostReductionLayout.jsx` 생성 | `frontend/.../components/layout/CostReductionLayout.jsx` (신규) | - |
| F1-3 | `CostReductionSidebar.jsx` 생성 | `frontend/.../components/layout/CostReductionSidebar.jsx` (신규) | - |
| F1-4 | `costReductionService.js` 생성 (대시보드 API) | `frontend/.../services/costReductionService.js` (신규) | - |
| F1-5 | `useEditorLock.js` 커스텀 훅 생성 | `frontend/.../hooks/useEditorLock.js` (신규) | F1-4 |
| F1-6 | `useDashboardStatus.js` 커스텀 훅 생성 | `frontend/.../hooks/useDashboardStatus.js` (신규) | F1-4 |
| F1-7 | `App.jsx` 라우트 변경 | `frontend/.../App.jsx` (수정) | F1-2 |

**구현 상세:**

```jsx
// F1-1: ProjectsPage.jsx 카드 푸터 변경
// 기존 CardFooter 내에 조건부 버튼 추가
<CardFooter className="flex gap-2">
    <Button className="flex-1" onClick={() => navigate(`/projects/${project.projectId}/upload`)}>
        열기
    </Button>
    {project.isCompleted && (
        <Button
            variant="secondary"
            className="flex-1"
            onClick={(e) => {
                e.stopPropagation();
                navigate(`/projects/${project.projectId}/longlist`);
            }}
        >
            비용 절감 수행
        </Button>
    )}
    <Button variant="outline" size="icon" onClick={...}>
        <Settings className="h-4 w-4" />
    </Button>
</CardFooter>

// 카드 컨텐츠 고정 높이 적용
<CardContent className="space-y-3 min-h-[120px]">
```

```jsx
// F1-5: useEditorLock.js
export function useEditorLock(projectId) {
    const [isEditor, setIsEditor] = useState(false);
    const [editorInfo, setEditorInfo] = useState(null);

    useEffect(() => {
        const acquire = async () => {
            const res = await costReductionService.acquireLock(projectId);
            setIsEditor(res.isEditor);
            setEditorInfo(res);
        };
        acquire();

        const interval = setInterval(() => {
            costReductionService.heartbeat(projectId).catch(() => {});
        }, 30000);

        const release = () => costReductionService.releaseLock(projectId).catch(() => {});
        window.addEventListener('beforeunload', release);

        return () => {
            clearInterval(interval);
            window.removeEventListener('beforeunload', release);
            release();
        };
    }, [projectId]);

    return { isEditor, editorInfo };
}
```

### 2.3 검증 항목

- [ ] 프로젝트 완료 API 호출 → `is_completed=true` 확인
- [ ] ProjectsPage에서 완료 프로젝트에 "비용 절감 수행" 버튼 노출
- [ ] 버튼 클릭 → `/projects/{projectId}/longlist` 이동
- [ ] 대시보드 초기화 → `cost_reduction_dashboards` 문서 생성 확인
- [ ] 유저 A 편집자 잠금 → 유저 B 뷰어 확인
- [ ] 유저 A 이탈 → 60초 후 잠금 해제 확인
- [ ] 미완료 프로젝트 카드와 완료 프로젝트 카드 크기 동일 확인

---

## 3. Phase 2: Long List 백엔드 + 프론트엔드 연동

### 3.1 Backend 작업

| # | 작업 내용 | 파일 (신규/수정) | 의존성 |
|---|---|---|---|
| B2-1 | `LongShortList` 모델 생성 | `backend/.../model/costreduction/LongShortList.java` (신규) | - |
| B2-2 | `LongShortListRepository` 생성 | `backend/.../repository/costreduction/LongShortListRepository.java` (신규) | B2-1 |
| B2-3 | `LongListService` 생성 | `backend/.../service/costreduction/LongListService.java` (신규) | B2-2 |
| B2-4 | `LongListController` 생성 | `backend/.../controller/costreduction/LongListController.java` (신규) | B2-3 |
| B2-5 | 트리/차트 DTO 생성 | `backend/.../dto/response/costreduction/` (신규) | - |
| B2-6 | Redis 캐싱 적용 | `LongListService` 내 (수정) | B2-3 |

**구현 상세:**

```java
// B2-3: LongListService 핵심 로직

public LongListTreeResponse getTreeData(String projectId) {
    // 1. Redis 캐시 확인
    String cacheKey = "longlist:tree:" + projectId;
    String cached = redisService.get(cacheKey);
    if (cached != null) return deserialize(cached);

    // 2. 프로젝트의 모든 완료 세션 조회
    List<FileSession> sessions = fileSessionRepository
        .findByProjectIdAndIsCompleted(projectId, true);
    List<String> sessionIds = sessions.stream()
        .map(FileSession::getSessionId).toList();

    // 3. cluster_statistics에서 Level 2, 3 데이터 조회
    List<ClusterStatistics> stats = clusterStatisticsRepository
        .findBySessionIdInAndLevelIn(sessionIds, List.of(2, 3));

    // 4. account_name 기준 그룹핑 (세션 통합)
    Map<String, List<ClusterStatistics>> byAccount = stats.stream()
        .collect(Collectors.groupingBy(ClusterStatistics::getAccountName));

    // 5. 트리 구조 변환
    List<TreeNode> tree = buildTree(byAccount);

    // 6. Redis 캐시 저장 (30분)
    redisService.set(cacheKey, serialize(tree), Duration.ofMinutes(30));

    return new LongListTreeResponse(tree);
}

private List<TreeNode> buildTree(Map<String, List<ClusterStatistics>> byAccount) {
    List<TreeNode> result = new ArrayList<>();

    for (Map.Entry<String, List<ClusterStatistics>> entry : byAccount.entrySet()) {
        String accountName = entry.getKey();
        List<ClusterStatistics> items = entry.getValue();

        // Level 2 항목 (중분류)
        List<ClusterStatistics> level2Items = items.stream()
            .filter(s -> s.getLevel() == 2).toList();

        // Level 3 항목을 parent_cluster_number 기준으로 그룹핑
        Map<Integer, List<ClusterStatistics>> level3ByParent = items.stream()
            .filter(s -> s.getLevel() == 3)
            .collect(Collectors.groupingBy(ClusterStatistics::getParentClusterNumber));

        // 중분류 → 소분류 트리 구성
        List<TreeNode> children = level2Items.stream().map(l2 -> {
            List<TreeNode> subChildren = level3ByParent
                .getOrDefault(l2.getClusterNumber(), Collections.emptyList())
                .stream().map(l3 -> TreeNode.leaf(l3)).toList();
            return TreeNode.branch(l2, subChildren);
        }).toList();

        // 대분류 노드 (합산 통계)
        TreeNode accountNode = TreeNode.root(accountName, children);
        result.add(accountNode);
    }

    return result;
}
```

```java
// B2-3: 차트 데이터 조회
public ChartDataResponse getChartData(String statisticsId, Integer top) {
    String cacheKey = "longlist:chart:" + statisticsId + ":" + top;
    // Redis 캐시 확인...

    ClusterStatistics stats = clusterStatisticsRepository.findById(statisticsId)
        .orElseThrow(() -> new NotFoundException("통계 데이터를 찾을 수 없습니다."));

    // Top N 필터링 + "기타" 합산
    List<BreakdownItem> suppliers = topNWithOthers(stats.getSupplierBreakdown(), top);
    List<BreakdownItem> costCenters = topNWithOthers(stats.getCostCenterBreakdown(), top);

    // Redis 캐시 저장...
    return new ChartDataResponse(suppliers, costCenters);
}

private List<BreakdownItem> topNWithOthers(List<BreakdownItem> items, Integer top) {
    if (top == null || items.size() <= top) return items;

    List<BreakdownItem> topItems = items.subList(0, top);
    List<BreakdownItem> rest = items.subList(top, items.size());

    int othersCount = rest.stream().mapToInt(BreakdownItem::getCount).sum();
    double othersAmount = rest.stream().mapToDouble(BreakdownItem::getTotalAmount).sum();

    List<BreakdownItem> result = new ArrayList<>(topItems);
    result.add(new BreakdownItem("기타", othersCount, othersAmount));
    return result;
}
```

### 3.2 Frontend 작업

| # | 작업 내용 | 파일 (신규/수정) | 의존성 |
|---|---|---|---|
| F2-1 | `costReductionService.js`에 Long List API 추가 | `frontend/.../services/costReductionService.js` (수정) | - |
| F2-2 | `LongListPage.jsx` 리팩터링: Mock → API | `frontend/.../pages/longlist/LongListPage.jsx` (수정) | F2-1, B2-4 |
| F2-3 | 선택 항목 카드 추가 | `LongListPage.jsx` 내 | F2-2 |
| F2-4 | 차트 top5/top10 선택기 추가 | `LongListPage.jsx` 내 | F2-2 |
| F2-5 | Pie 차트 범례 토글 기능 | `LongListPage.jsx` 내 | F2-2 |
| F2-6 | "Short List 도출" 버튼 + 저장 + 이동 | `LongListPage.jsx` 내 | F2-2 |

**구현 상세:**

```jsx
// F2-2: LongListPage.jsx 리팩터링 핵심

export default function LongListPage() {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const { isEditor } = useEditorLock(projectId);
    const { dashboardStatus } = useDashboardStatus(projectId);

    const [treeData, setTreeData] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [checkedIds, setCheckedIds] = useState(new Set());
    const [selectedItem, setSelectedItem] = useState(null);
    const [chartData, setChartData] = useState(null);
    const [chartTop, setChartTop] = useState(5);
    const [selectedItemStats, setSelectedItemStats] = useState(null);

    // 데이터 로드
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const [treeRes, statsRes, selectionsRes] = await Promise.all([
                costReductionService.getLongListTree(projectId),
                costReductionService.getLongListStats(projectId),
                costReductionService.getLongListSelections(projectId),
            ]);
            setTreeData(treeRes.tree);
            setStats(statsRes);
            // 기존 선택 항목 복원
            if (selectionsRes.items?.length > 0) {
                setCheckedIds(new Set(selectionsRes.items.map(i => i.statisticsId)));
            }
            setLoading(false);
        };
        load();
    }, [projectId]);

    // 항목 클릭 → 차트 데이터 로드
    const handleItemClick = async (item) => {
        if (!item.statisticsId) return;  // Level 1(계정명)은 서버 조회 불필요
        setSelectedItem(item);
        const [chartRes, itemStatsRes] = await Promise.all([
            costReductionService.getLongListChart(projectId, item.statisticsId, chartTop),
            costReductionService.getLongListItemStats(projectId, item.statisticsId),
        ]);
        setChartData(chartRes);
        setSelectedItemStats(itemStatsRes);
    };

    // Short List 도출
    const handleDeriveShortList = async () => {
        const items = buildListItemsFromChecked(treeData, checkedIds);
        await costReductionService.saveLongListSelections(projectId, items);
        navigate(`/projects/${projectId}/shortlist`);
    };

    // 체크박스 비활성화 조건: 뷰어 모드 또는 리스트 잠금 상태
    const isReadOnly = !isEditor || dashboardStatus?.isListLocked;

    return (
        // ... 기존 UI 구조 유지, Mock 데이터를 state 변수로 교체
        // 체크박스에 disabled={isReadOnly} 추가
        // "Short List 도출" 버튼은 체크된 항목이 1개 이상이고 isReadOnly=false일 때만 활성화
    );
}
```

### 3.3 검증 항목

- [ ] Long List 트리 데이터 API 호출 → 계정명 > 클러스터 > 세부클러스터 3레벨 구조 확인
- [ ] 항목 클릭 → 공급업체/코스트센터 Bar+Pie 차트 4개 표시
- [ ] Top 5 → Top 10 전환 시 차트 업데이트
- [ ] Pie 차트 "자세히 보기" → 범례 클릭으로 항목 토글
- [ ] 선택 항목 카드: rawData행, 공급업체수, 코스트센터수, 총금액, 전체대비비율
- [ ] 체크박스 상태 저장 → 페이지 재진입 시 복원
- [ ] "Short List 도출" → 체크 항목 저장 + shortlist 이동
- [ ] 뷰어 모드에서 체크박스 비활성화 확인
- [ ] Redis 캐시 적중 확인 (두 번째 조회 시 빠른 응답)

---

## 4. Phase 3: Short List + 단계 전환

### 4.1 Backend 작업

| # | 작업 내용 | 파일 (신규/수정) | 의존성 |
|---|---|---|---|
| B3-1 | `ShortListService` 생성 | `backend/.../service/costreduction/ShortListService.java` (신규) | B2-2 |
| B3-2 | `ShortListController` 생성 | `backend/.../controller/costreduction/ShortListController.java` (신규) | B3-1 |
| B3-3 | 단계 전환 구현 (DashboardService) | `CostReductionDashboardService.java` (수정) | B1-5 |
| B3-4 | Short List DTO 생성 | `backend/.../dto/response/costreduction/` (신규) | - |

**구현 상세:**

```java
// B3-1: ShortListService 핵심

public LongListTreeResponse getTreeData(String projectId) {
    // 1. Long List 저장된 항목 조회
    LongShortList list = longShortListRepository.findByProjectId(projectId)
        .orElseThrow(() -> new NotFoundException("Long List가 생성되지 않았습니다."));

    // 2. Long List 항목의 statisticsId Set
    Set<String> longListStatIds = list.getLongListItems().stream()
        .map(ListItem::getStatisticsId).collect(Collectors.toSet());

    // 3. 해당 cluster_statistics 데이터만 조회
    List<ClusterStatistics> stats = clusterStatisticsRepository.findAllById(longListStatIds);

    // 4. 트리 구조 변환 (LongListService와 동일 로직)
    return buildTreeResponse(stats);
}

// B3-3: 단계 전환
public DashboardStatusResponse transitionPhase(String projectId, String userId,
        CostReductionPhase targetPhase) {
    CostReductionDashboard dashboard = getDashboard(projectId);

    // 유효성 검증
    switch (targetPhase) {
        case SHORT_LIST:
            validateLongListHasItems(projectId);
            break;
        case ABLE_REGISTER:
            validateShortListHasItems(projectId);
            // ⭐ 리스트 잠금
            lockLists(projectId, userId);
            break;
        case ABLE_MANAGE:
            validateTasksExist(projectId);
            break;
        case COMPLETED_MANAGE:
            validateCompletedTasksExist(projectId);
            break;
    }

    dashboard.setCurrentPhase(targetPhase.name());
    dashboard.setUpdatedAt(LocalDateTime.now());
    dashboardRepository.save(dashboard);

    return buildStatusResponse(dashboard, userId);
}
```

### 4.2 Frontend 작업

| # | 작업 내용 | 파일 (신규/수정) | 의존성 |
|---|---|---|---|
| F3-1 | `costReductionService.js`에 Short List API 추가 | `costReductionService.js` (수정) | - |
| F3-2 | `ShortListPage.jsx` 리팩터링: Mock → API | `ShortListPage.jsx` (수정) | F3-1, B3-2 |
| F3-3 | 레벨 네비게이션 연동 | `ShortListPage.jsx` 내 | F3-2 |
| F3-4 | "Able 과제 등록" 버튼 + 확인 다이얼로그 | `ShortListPage.jsx` 내 | F3-2 |

**구현 상세:**

```jsx
// F3-4: Able 과제 등록 확인 다이얼로그

const [confirmDialog, setConfirmDialog] = useState(false);

const handleAbleRegister = () => {
    setConfirmDialog(true);
};

const confirmTransition = async () => {
    // 1. Short List 저장
    const items = buildListItemsFromChecked(treeData, checkedIds);
    await costReductionService.saveShortListSelections(projectId, items);

    // 2. 단계 전환 (ABLE_REGISTER)
    await costReductionService.transitionPhase(projectId, 'ABLE_REGISTER');

    // 3. 이동
    navigate(`/projects/${projectId}/able-register`);
};

// 확인 다이얼로그
<Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Able 과제 등록으로 이동</DialogTitle>
      <DialogDescription>
        Able 과제 등록으로 이동하면 Long List와 Short List의 체크 항목을 더 이상 수정할 수 없습니다.
        계속하시겠습니까?
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setConfirmDialog(false)}>취소</Button>
      <Button onClick={confirmTransition}>확인</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 4.3 검증 항목

- [ ] Short List 트리: Long List에서 선택된 항목만 표시
- [ ] 레벨 네비게이션: Level 1 클릭 → Long List 이동
- [ ] 레벨 네비게이션에 각 레벨의 항목 수/금액 합계 표시
- [ ] "Able 과제 등록" 클릭 → 확인 다이얼로그 표시
- [ ] 확인 후 `is_list_locked=true` → Long/Short List 체크박스 비활성화
- [ ] 잠금 후 Long List/Short List 조회(차트 포함) 가능 확인

---

## 5. Phase 4: Able 과제 등록

### 5.1 Backend 작업

| # | 작업 내용 | 파일 (신규/수정) | 의존성 |
|---|---|---|---|
| B4-1 | `AbleTask` 모델 생성 | `backend/.../model/costreduction/AbleTask.java` (신규) | - |
| B4-2 | `TaskDocument` 모델 생성 | `backend/.../model/costreduction/TaskDocument.java` (신규) | - |
| B4-3 | `AbleTaskRepository` 생성 | `backend/.../repository/costreduction/AbleTaskRepository.java` (신규) | B4-1 |
| B4-4 | `TaskDocumentRepository` 생성 | `backend/.../repository/costreduction/TaskDocumentRepository.java` (신규) | B4-2 |
| B4-5 | `AbleTaskService` 생성 (CRUD + 완료) | `backend/.../service/costreduction/AbleTaskService.java` (신규) | B4-3 |
| B4-6 | `TaskDocumentService` 생성 | `backend/.../service/costreduction/TaskDocumentService.java` (신규) | B4-4 |
| B4-7 | `S3Service`에 과제 문서 메서드 추가 | `backend/.../service/common/S3Service.java` (수정) | - |
| B4-8 | `AbleTaskController` 생성 | `backend/.../controller/costreduction/AbleTaskController.java` (신규) | B4-5, B4-6 |
| B4-9 | `TaskDocumentController` 생성 | `backend/.../controller/costreduction/TaskDocumentController.java` (신규) | B4-6 |
| B4-10 | 과제 관련 DTO 생성 | `backend/.../dto/` (신규) | - |

**구현 상세:**

```java
// B4-5: AbleTaskService 핵심 메서드
public class AbleTaskService {
    // 과제 생성 (모수 금액 자동 합산)
    public AbleTask createTask(String projectId, String userId, CreateAbleTaskRequest request) {
        // Short List 항목에서 totalAmount 합산
        Double baseAmount = calculateBaseAmount(projectId, request.getShortListItemIds());

        AbleTask task = AbleTask.builder()
            .projectId(projectId)
            .taskId(UUID.randomUUID().toString())
            .taskName(request.getTaskName())
            .relatedAccounts(request.getRelatedAccounts())
            .relatedClusters(request.getRelatedClusters())
            .shortListItemIds(request.getShortListItemIds())
            .department(request.getDepartment())
            .manager(request.getManager())
            .consultant(request.getConsultant())
            .baseAmount(baseAmount)
            .expectedSavingRate(request.getExpectedSavingRate())
            .expectedSavingAmount(request.getExpectedSavingAmount())
            .progress(0)
            .status("IN_PROGRESS")
            .createdBy(userId)
            .createdAt(LocalDateTime.now())
            .updatedAt(LocalDateTime.now())
            .build();

        return ableTaskRepository.save(task);
    }

    // 과제 완료 처리
    public AbleTask completeTask(String projectId, String taskId, CompleteTaskRequest request) {
        AbleTask task = getTask(projectId, taskId);
        task.setStatus("COMPLETED");
        task.setActualSavingAmount(request.getActualSavingAmount());
        task.setRating(request.getRating());
        task.setProgress(100);
        task.setCompletedAt(LocalDateTime.now());
        task.setUpdatedAt(LocalDateTime.now());
        return ableTaskRepository.save(task);
    }
}
```

```java
// B4-7: S3Service 추가 메서드
public String generateTaskDocumentPresignedUrl(String projectId, String taskId, String fileName) {
    String uuid = UUID.randomUUID().toString().substring(0, 8);
    String s3Key = String.format("projects/%s/tasks/%s/documents/%s_%s",
        projectId, taskId, uuid, fileName);

    PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
        .signatureDuration(Duration.ofHours(1))
        .putObjectRequest(PutObjectRequest.builder()
            .bucket(bucketName)
            .key(s3Key)
            .build())
        .build();

    return s3Presigner.presignPutObject(presignRequest).url().toString();
}

public String generateDownloadUrl(String s3Key) {
    GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
        .signatureDuration(Duration.ofMinutes(15))
        .getObjectRequest(GetObjectRequest.builder()
            .bucket(bucketName)
            .key(s3Key)
            .build())
        .build();

    return s3Presigner.presignGetObject(presignRequest).url().toString();
}
```

### 5.2 Frontend 작업

| # | 작업 내용 | 파일 (신규/수정) | 의존성 |
|---|---|---|---|
| F4-1 | `costReductionService.js`에 과제/문서 API 추가 | `costReductionService.js` (수정) | - |
| F4-2 | `AbleTaskRegisterPage.jsx` 리팩터링 | `AbleTaskRegisterPage.jsx` (수정) | F4-1, B4-8 |
| F4-3 | 좌측 트리: Short List 데이터 로드 | `AbleTaskRegisterPage.jsx` 내 | F4-2 |
| F4-4 | 우측 폼: 자동 매핑 연동 | `AbleTaskRegisterPage.jsx` 내 | F4-2 |
| F4-5 | 파일 업로드: S3 Presigned URL 플로우 | `AbleTaskRegisterPage.jsx` 내 | F4-2 |
| F4-6 | 레벨 네비게이션 (Level 1→Long, Level 2→Short, Level 3→현재) | `AbleTaskRegisterPage.jsx` 내 | F4-2 |
| F4-7 | "과제 등록" → API 호출 → able-manage 이동 | `AbleTaskRegisterPage.jsx` 내 | F4-2 |

**구현 상세:**

```jsx
// F4-5: S3 Presigned URL 파일 업로드 플로우

const handleFileUpload = async (files) => {
    for (const file of files) {
        // 1. Presigned URL 요청
        const { presignedUrl, s3Key } = await costReductionService.getUploadUrl(
            projectId, taskId, { fileName: file.name, fileSize: file.size }
        );

        // 2. S3에 직접 업로드
        await fetch(presignedUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });

        // 3. 업로드 완료 확인
        await costReductionService.confirmUpload(projectId, taskId, {
            s3Key,
            fileName: file.name,
            label: file.name,
            fileSize: file.size,
        });
    }

    // 4. 문서 목록 새로고침
    loadDocuments();
};
```

### 5.3 검증 항목

- [ ] 좌측 트리에 Short List 항목만 표시
- [ ] 체크박스 선택 → 우측 "관련 대계정명", "관련 클러스터명" 자동 매핑
- [ ] 체크 항목 변경 → "모수 금액" 자동 합산
- [ ] 파일 업로드 → S3 저장 확인
- [ ] 링크 추가 → task_documents에 LINK 타입 저장
- [ ] "과제 등록" → able_tasks 문서 생성 + able-manage 이동
- [ ] 레벨 네비게이션 동작 확인

---

## 6. Phase 5: Able 과제 관리 + 완료 과제 관리

### 6.1 Backend 작업

| # | 작업 내용 | 파일 (신규/수정) | 의존성 |
|---|---|---|---|
| B5-1 | 과제 요약/차트 엔드포인트 구현 | `AbleTaskController.java` (수정) | B4-5 |
| B5-2 | 완료 과제 요약/차트 엔드포인트 구현 | `AbleTaskController.java` (수정) | B4-5 |
| B5-3 | 과제 삭제 시 S3 정리 로직 | `AbleTaskService.java` (수정) | B4-7 |

**구현 상세:**

```java
// B5-1: 요약 통계
public TaskSummaryResponse getTasksSummary(String projectId) {
    List<AbleTask> tasks = ableTaskRepository.findByProjectId(projectId);

    return TaskSummaryResponse.builder()
        .totalTasks(tasks.size())
        .totalBaseAmount(tasks.stream().mapToDouble(AbleTask::getBaseAmount).sum())
        .totalExpectedSaving(tasks.stream().mapToDouble(AbleTask::getExpectedSavingAmount).sum())
        .averageProgress(tasks.stream().mapToInt(AbleTask::getProgress).average().orElse(0))
        .inProgressCount(tasks.stream().filter(t -> "IN_PROGRESS".equals(t.getStatus())).count())
        .completedCount(tasks.stream().filter(t -> "COMPLETED".equals(t.getStatus())).count())
        .build();
}

// B5-3: 과제 삭제 + S3 정리
public void deleteTask(String projectId, String taskId) {
    AbleTask task = getTask(projectId, taskId);

    // S3 파일 삭제
    String s3Prefix = String.format("projects/%s/tasks/%s/documents/", projectId, taskId);
    s3Service.deleteFolder(s3Prefix);

    // 문서 메타데이터 삭제
    taskDocumentRepository.deleteByTaskId(taskId);

    // 과제 삭제
    ableTaskRepository.delete(task);
}
```

### 6.2 Frontend 작업

| # | 작업 내용 | 파일 (신규/수정) | 의존성 |
|---|---|---|---|
| F5-1 | `AbleTaskManagePage.jsx` 리팩터링 | `AbleTaskManagePage.jsx` (수정) | F4-1, B5-1 |
| F5-2 | 관리 아이콘 기능: 상세보기, 수정, 다운로드, 삭제 | `AbleTaskManagePage.jsx` 내 | F5-1 |
| F5-3 | `CompletedTaskManagePage.jsx` 리팩터링 | `CompletedTaskManagePage.jsx` (수정) | F4-1, B5-2 |
| F5-4 | 관리 아이콘 기능: 상세보기, 수정, 다운로드 | `CompletedTaskManagePage.jsx` 내 | F5-3 |

**관리 아이콘 기능 매핑:**

| 아이콘 | 기능 | API 호출 |
|---|---|---|
| Eye (보기) | 과제 상세 정보 모달 | `GET /tasks/{taskId}` + `GET /tasks/{taskId}/documents` |
| Edit2 (수정) | 과제 정보 수정 모달 | `PUT /tasks/{taskId}` |
| Download (다운로드) | 첨부 파일 다운로드 | `GET /tasks/{taskId}/documents/{docId}/download` |
| Trash2 (삭제) | 과제 삭제 확인 → 삭제 | `DELETE /tasks/{taskId}` |
| CheckCircle2 (완료) | 과제 완료 처리 모달 | `POST /tasks/{taskId}/complete` |

### 6.3 검증 항목

- [ ] Able 과제 관리: 과제 목록 테이블 표시
- [ ] 요약 카드: 총 과제수, 총 모수금액, 총 절감액, 평균 진척율
- [ ] 상태별 Pie 차트, 컨설턴트별 Bar 차트 표시
- [ ] 과제 수정 모달 → 저장 → 목록 새로고침
- [ ] 과제 삭제 → S3 파일 정리 + 목록 제거
- [ ] 과제 완료 → status=COMPLETED + 완료 과제 목록으로 이동
- [ ] 완료 과제 관리: 완료 과제 목록 + 달성율 표시
- [ ] 파일 다운로드 → S3 Presigned GET URL로 다운로드

---

## 7. 전체 신규/수정 파일 체크리스트

### Backend 신규 파일

| Phase | 파일 경로 | 설명 |
|---|---|---|
| 1 | `enums/CostReductionPhase.java` | 단계 enum |
| 1 | `model/costreduction/CostReductionDashboard.java` | 대시보드 모델 |
| 1 | `repository/costreduction/CostReductionDashboardRepository.java` | 대시보드 레포지토리 |
| 1 | `service/costreduction/CostReductionDashboardService.java` | 대시보드 서비스 |
| 1 | `controller/costreduction/CostReductionDashboardController.java` | 대시보드 컨트롤러 |
| 1 | `dto/request/costreduction/TransitionPhaseRequest.java` | 단계 전환 DTO |
| 1 | `dto/response/costreduction/DashboardStatusResponse.java` | 대시보드 상태 응답 DTO |
| 1 | `dto/response/costreduction/LockResponse.java` | 잠금 응답 DTO |
| 2 | `model/costreduction/LongShortList.java` | 선택 목록 모델 |
| 2 | `repository/costreduction/LongShortListRepository.java` | 선택 목록 레포지토리 |
| 2 | `service/costreduction/LongListService.java` | Long List 서비스 |
| 2 | `controller/costreduction/LongListController.java` | Long List 컨트롤러 |
| 2 | `dto/response/costreduction/LongListTreeResponse.java` | 트리 응답 DTO |
| 2 | `dto/response/costreduction/TreeNode.java` | 트리 노드 DTO |
| 2 | `dto/response/costreduction/LongListStatsResponse.java` | 통계 응답 DTO |
| 2 | `dto/response/costreduction/ChartDataResponse.java` | 차트 응답 DTO |
| 2 | `dto/response/costreduction/ItemStatsResponse.java` | 항목 카드 DTO |
| 2 | `dto/request/costreduction/SaveListRequest.java` | 선택 저장 DTO |
| 3 | `service/costreduction/ShortListService.java` | Short List 서비스 |
| 3 | `controller/costreduction/ShortListController.java` | Short List 컨트롤러 |
| 3 | `dto/response/costreduction/ShortListSummaryResponse.java` | 레벨 요약 DTO |
| 4 | `model/costreduction/AbleTask.java` | 과제 모델 |
| 4 | `model/costreduction/TaskDocument.java` | 과제 문서 모델 |
| 4 | `repository/costreduction/AbleTaskRepository.java` | 과제 레포지토리 |
| 4 | `repository/costreduction/TaskDocumentRepository.java` | 문서 레포지토리 |
| 4 | `service/costreduction/AbleTaskService.java` | 과제 서비스 |
| 4 | `service/costreduction/TaskDocumentService.java` | 문서 서비스 |
| 4 | `controller/costreduction/AbleTaskController.java` | 과제 컨트롤러 |
| 4 | `controller/costreduction/TaskDocumentController.java` | 문서 컨트롤러 |
| 4 | `dto/request/costreduction/CreateAbleTaskRequest.java` | 과제 생성 DTO |
| 4 | `dto/request/costreduction/UpdateAbleTaskRequest.java` | 과제 수정 DTO |
| 4 | `dto/request/costreduction/CompleteTaskRequest.java` | 완료 처리 DTO |
| 4 | `dto/request/costreduction/AddLinkRequest.java` | 링크 추가 DTO |
| 4 | `dto/request/costreduction/UploadUrlRequest.java` | 업로드 URL DTO |
| 4 | `dto/request/costreduction/UploadCompleteRequest.java` | 업로드 완료 DTO |
| 4 | `dto/response/costreduction/AbleTaskResponse.java` | 과제 응답 DTO |
| 4 | `dto/response/costreduction/TaskDocumentResponse.java` | 문서 응답 DTO |
| 5 | `dto/response/costreduction/TaskSummaryResponse.java` | 과제 요약 DTO |

### Backend 수정 파일

| Phase | 파일 경로 | 변경 내용 |
|---|---|---|
| 1 | `service/common/RedisService.java` | `setIfAbsent()` 메서드 추가 |
| 4 | `service/common/S3Service.java` | `generateTaskDocumentPresignedUrl()`, `generateDownloadUrl()` 추가 |

### Frontend 신규 파일

| Phase | 파일 경로 | 설명 |
|---|---|---|
| 1 | `components/layout/CostReductionLayout.jsx` | 대시보드 레이아웃 |
| 1 | `components/layout/CostReductionSidebar.jsx` | 프로젝트 스코프 사이드바 |
| 1 | `services/costReductionService.js` | API 클라이언트 |
| 1 | `hooks/useEditorLock.js` | 편집자 잠금 훅 |
| 1 | `hooks/useDashboardStatus.js` | 대시보드 상태 훅 |

### Frontend 수정 파일

| Phase | 파일 경로 | 변경 내용 |
|---|---|---|
| 1 | `App.jsx` | 라우트 프로젝트 스코프로 변경 |
| 1 | `pages/project/ProjectsPage.jsx` | "비용 절감 수행" 버튼 추가, 카드 min-height |
| 2 | `pages/longlist/LongListPage.jsx` | Mock → API 연동, 차트 top N, 항목 카드, 잠금 |
| 3 | `pages/shortlist/ShortListPage.jsx` | Mock → API 연동, 레벨 네비게이션, 잠금 다이얼로그 |
| 4 | `pages/abletask/AbleTaskRegisterPage.jsx` | Mock → API 연동, S3 업로드, 자동 매핑 |
| 5 | `pages/abletaskmanage/AbleTaskManagePage.jsx` | Mock → API 연동, 관리 아이콘 CRUD |
| 5 | `pages/completedtask/CompletedTaskManagePage.jsx` | Mock → API 연동, 관리 아이콘 |
