# 비용 절감 대시보드 아키텍처 설계서

> **작성일**: 2026-02-19
> **버전**: v1.0
> **범위**: Long List / Short List / Able 과제 등록 / Able 과제 관리 / 완료 과제 관리

---

## 1. 시스템 개요

기존 7단계 데이터 클러스터링 파이프라인(Multi File Upload → 전처리 → 변환 → 클러스터링 → Export → Detail Clustering) 위에 **비용 절감 분석 대시보드**를 구축한다.

프로젝트 완료(`is_completed=true`) 후, `cluster_statistics` 컬렉션 데이터를 기반으로 다음 5단계 워크플로우를 수행한다:

```
프로젝트 완료 → Long List 도출 → Short List 도출 → Able 과제 등록 → Able 과제 관리 → 완료 과제 관리
```

---

## 2. 전체 시스템 아키텍처

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                       │
│                                                                      │
│  ProjectsPage ──"비용 절감 수행"──→ CostReductionLayout              │
│                                      ├── LongListPage                │
│                                      ├── ShortListPage               │
│                                      ├── AbleTaskRegisterPage        │
│                                      ├── AbleTaskManagePage          │
│                                      └── CompletedTaskManagePage     │
│                                                                      │
│  Custom Hooks: useEditorLock / useDashboardStatus                    │
│  API Client:   costReductionService.js                               │
└─────────────────────────────┬────────────────────────────────────────┘
                              │ REST API (JWT Auth)
┌─────────────────────────────▼────────────────────────────────────────┐
│                     Spring Boot 3.5.9 Backend                        │
│                                                                      │
│  Controller Layer                                                    │
│  ┌──────────────────┐ ┌──────────────┐ ┌────────────────────────┐   │
│  │ DashboardCtrl    │ │ LongListCtrl │ │ AbleTaskCtrl           │   │
│  │ (잠금/단계관리)   │ │ (트리/차트)   │ │ (CRUD/문서/요약/차트)   │   │
│  └────────┬─────────┘ └──────┬───────┘ └────────────┬───────────┘   │
│  ┌────────▼─────────┐ ┌──────▼───────┐ ┌────────────▼───────────┐   │
│  │ DashboardService │ │ LongList     │ │ AbleTaskService        │   │
│  │ ShortListService │ │ Service      │ │ TaskDocumentService    │   │
│  └────────┬─────────┘ └──────┬───────┘ └────────────┬───────────┘   │
│           │                   │                      │               │
└───────────┼───────────────────┼──────────────────────┼───────────────┘
            │                   │                      │
   ┌────────▼─────┐   ┌────────▼────────┐   ┌─────────▼──────┐
   │   Redis      │   │    MongoDB      │   │     S3         │
   │ ElastiCache  │   │   DocumentDB    │   │ finance-excel- │
   │              │   │                 │   │ uploads        │
   │ • Lock TTL   │   │ • dashboards   │   │                │
   │ • Tree Cache │   │ • long_short   │   │ • 과제 첨부파일 │
   │ • Chart Cache│   │ • able_tasks   │   │                │
   └──────────────┘   │ • task_docs    │   └────────────────┘
                      │ • cluster_stats│
                      │ • session_data │
                      └────────────────┘
```

---

## 3. 페이지 진입 흐름

### 3.1 프로젝트 완료 처리

```
MultiFileUploadPage "프로젝트 완료" 버튼 클릭
  → POST /api/projects/{projectId}/complete (기존 API)
  → projects.is_completed = true
  → ProjectsPage에서 해당 프로젝트 카드에 "비용 절감 수행" 버튼 표시
```

**프로젝트 카드 변경 사항:**
- `is_completed === true`일 때 CardFooter에 "비용 절감 수행" 버튼 추가
- 카드 컨텐츠 크기 유지: `min-h-[180px]` 등 고정 높이 적용하여 완료/미완료 카드 동일 크기
- "비용 절감 수행" 클릭 → `/projects/{projectId}/longlist`로 이동

### 3.2 대시보드 진입 시 초기화

```
사용자가 /projects/{projectId}/longlist 진입
  → CostReductionLayout 마운트
  → POST /api/projects/{projectId}/dashboard/init
    → cost_reduction_dashboards 문서 생성 (없으면)
    → 편집자 잠금 시도 (Redis SET NX)
  → isEditor=true → 편집 모드 (체크박스 활성화)
  → isEditor=false → 뷰어 모드 (체크박스 비활성화, 조회만 가능)
```

---

## 4. 신규 MongoDB 컬렉션 설계

### 4.1 `cost_reduction_dashboards` (대시보드 상태 관리)

**목적:** 프로젝트별 대시보드 상태(현재 단계, 편집자 잠금, 목록 잠금)를 관리

```javascript
{
  "_id": ObjectId,
  "project_id": "uuid-xxx",              // unique
  "current_phase": "LONG_LIST",          // LONG_LIST | SHORT_LIST | ABLE_REGISTER | ABLE_MANAGE | COMPLETED_MANAGE
  "is_list_locked": false,               // Able 과제 등록 시 true → Long/Short List 수정 불가
  "editor_user_id": "user-001",          // 현재 편집자 (null = 편집자 없음)
  "editor_user_name": "홍길동",
  "editor_acquired_at": ISODate,
  "editor_heartbeat_at": ISODate,
  "created_at": ISODate,
  "updated_at": ISODate
}
```

**Java 모델:**
```java
@Document(collection = "cost_reduction_dashboards")
@CompoundIndex(name = "project_idx", def = "{'project_id': 1}", unique = true)
public class CostReductionDashboard {
    @Id private String id;
    @Indexed(unique = true) @Field("project_id") private String projectId;
    @Field("current_phase") private String currentPhase;
    @Field("is_list_locked") private Boolean isListLocked;
    @Field("editor_user_id") private String editorUserId;
    @Field("editor_user_name") private String editorUserName;
    @Field("editor_acquired_at") private LocalDateTime editorAcquiredAt;
    @Field("editor_heartbeat_at") private LocalDateTime editorHeartbeatAt;
    @Field("created_at") private LocalDateTime createdAt;
    @Field("updated_at") private LocalDateTime updatedAt;
}
```

**인덱스:**

| 인덱스명 | 필드 | 용도 |
|---|---|---|
| `project_idx` | `{project_id: 1}` (unique) | 프로젝트별 1:1 조회 |

---

### 4.2 `long_short_lists` (Long List / Short List 선택 항목)

**목적:** 프로젝트별 Long List, Short List에서 체크된 항목을 저장/관리

```javascript
{
  "_id": ObjectId,
  "project_id": "uuid-xxx",              // unique
  "long_list_items": [                    // Long List 체크 항목
    {
      "statistics_id": "stat-001",        // ClusterStatistics._id 참조
      "session_id": "session-abc",
      "account_name": "여비교통비",
      "cluster_number": 100,
      "cluster_name": "출장비_교통비",
      "level": 2,                         // 2=병합클러스터, 3=세부클러스터
      "parent_cluster_number": null,
      "total_amount": 250000000.0,
      "total_count": 450
    }
    // ...
  ],
  "short_list_items": [                   // Short List 체크 항목 (Long List의 부분집합)
    // 동일한 ListItem 구조
  ],
  "is_locked": false,                     // Able 과제 등록 후 true
  "locked_at": null,
  "locked_by": null,
  "created_at": ISODate,
  "updated_at": ISODate
}
```

**Java 모델:**
```java
@Document(collection = "long_short_lists")
@CompoundIndex(name = "project_idx", def = "{'project_id': 1}", unique = true)
public class LongShortList {
    @Id private String id;
    @Indexed(unique = true) @Field("project_id") private String projectId;
    @Field("long_list_items") private List<ListItem> longListItems;
    @Field("short_list_items") private List<ListItem> shortListItems;
    @Field("is_locked") private Boolean isLocked;
    @Field("locked_at") private LocalDateTime lockedAt;
    @Field("locked_by") private String lockedBy;
    @Field("created_at") private LocalDateTime createdAt;
    @Field("updated_at") private LocalDateTime updatedAt;

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class ListItem {
        @Field("statistics_id") private String statisticsId;
        @Field("session_id") private String sessionId;
        @Field("account_name") private String accountName;
        @Field("cluster_number") private Integer clusterNumber;
        @Field("cluster_name") private String clusterName;
        private Integer level;
        @Field("parent_cluster_number") private Integer parentClusterNumber;
        @Field("total_amount") private Double totalAmount;
        @Field("total_count") private Integer totalCount;
    }
}
```

**인덱스:**

| 인덱스명 | 필드 | 용도 |
|---|---|---|
| `project_idx` | `{project_id: 1}` (unique) | 프로젝트별 1:1 조회 |

**설계 근거:**
- 프로젝트당 1개 문서로 관리 (클러스터 항목 수가 수백~수천 수준 → 16MB 제한 내)
- 원자적 저장/로드 가능 (트랜잭션 불필요)
- Short List는 Long List의 부분집합이므로 동일 문서에서 관리

---

### 4.3 `able_tasks` (Able 과제)

**목적:** 비용 절감 과제의 CRUD 및 상태 관리

```javascript
{
  "_id": ObjectId,
  "project_id": "uuid-xxx",
  "task_id": "task-uuid-001",            // unique
  "task_name": "출장비 절감 과제",
  "related_accounts": ["여비교통비", "간접비"],    // 관련 대계정명
  "related_clusters": ["출장비_교통비", "숙박비"],  // 관련 클러스터명
  "short_list_item_ids": ["stat-001", "stat-002"], // Short List 항목 참조
  "department": "구매팀",
  "manager": "박영호",
  "consultant": "이민수",
  "base_amount": 2500000000.0,           // 모수 금액 (자동 합산)
  "expected_saving_rate": 3.5,           // 예상 절감율 (%)
  "expected_saving_amount": 87500000.0,  // 예상 절감액
  "actual_saving_amount": 0.0,           // 실제 절감액 (완료 시)
  "progress": 65,                         // 진척율 (0-100)
  "status": "IN_PROGRESS",              // IN_PROGRESS | UNDER_REVIEW | ON_HOLD | COMPLETED
  "rating": null,                         // A+, A, B+, B (완료 시)
  "completed_at": null,
  "created_by": "user-001",
  "created_at": ISODate,
  "updated_at": ISODate
}
```

**Java 모델:**
```java
@Document(collection = "able_tasks")
@CompoundIndex(name = "project_task_idx", def = "{'project_id': 1, 'task_id': 1}", unique = true)
@CompoundIndex(name = "project_status_idx", def = "{'project_id': 1, 'status': 1}")
public class AbleTask {
    @Id private String id;
    @Indexed @Field("project_id") private String projectId;
    @Indexed(unique = true) @Field("task_id") private String taskId;
    @Field("task_name") private String taskName;
    @Field("related_accounts") private List<String> relatedAccounts;
    @Field("related_clusters") private List<String> relatedClusters;
    @Field("short_list_item_ids") private List<String> shortListItemIds;
    @Field("department") private String department;
    @Field("manager") private String manager;
    @Field("consultant") private String consultant;
    @Field("base_amount") private Double baseAmount;
    @Field("expected_saving_rate") private Double expectedSavingRate;
    @Field("expected_saving_amount") private Double expectedSavingAmount;
    @Field("actual_saving_amount") private Double actualSavingAmount;
    @Field("progress") private Integer progress;
    @Field("status") private String status;
    @Field("rating") private String rating;
    @Field("completed_at") private LocalDateTime completedAt;
    @Field("created_by") private String createdBy;
    @Field("created_at") private LocalDateTime createdAt;
    @Field("updated_at") private LocalDateTime updatedAt;
}
```

**인덱스:**

| 인덱스명 | 필드 | 용도 |
|---|---|---|
| `project_task_idx` | `{project_id: 1, task_id: 1}` (unique) | 프로젝트 내 과제 고유 식별 |
| `project_status_idx` | `{project_id: 1, status: 1}` | 상태별 필터 조회 |
| `task_id` | `{task_id: 1}` (unique) | 과제 ID 기반 직접 조회 |

---

### 4.4 `task_documents` (과제 첨부 자료)

**목적:** 과제별 링크 및 파일 첨부 자료 관리

```javascript
{
  "_id": ObjectId,
  "task_id": "task-uuid-001",
  "project_id": "uuid-xxx",
  "document_type": "FILE",               // LINK | FILE
  "label": "분석 보고서",
  "url": "https://example.com",          // LINK 타입일 때
  "s3_key": "projects/uuid-xxx/tasks/task-uuid-001/documents/a1b2c3_report.xlsx",  // FILE 타입일 때
  "file_name": "report.xlsx",            // FILE 타입일 때
  "file_size": 1048576,                  // FILE 타입일 때 (bytes)
  "created_by": "user-001",
  "created_at": ISODate
}
```

**Java 모델:**
```java
@Document(collection = "task_documents")
@CompoundIndex(name = "task_doc_idx", def = "{'task_id': 1, 'created_at': -1}")
public class TaskDocument {
    @Id private String id;
    @Indexed @Field("task_id") private String taskId;
    @Indexed @Field("project_id") private String projectId;
    @Field("document_type") private String documentType;
    @Field("label") private String label;
    @Field("url") private String url;
    @Field("s3_key") private String s3Key;
    @Field("file_name") private String fileName;
    @Field("file_size") private Long fileSize;
    @Field("created_by") private String createdBy;
    @Field("created_at") private LocalDateTime createdAt;
}
```

**인덱스:**

| 인덱스명 | 필드 | 용도 |
|---|---|---|
| `task_doc_idx` | `{task_id: 1, created_at: -1}` | 과제별 자료 목록 (최신순) |
| `project_id` | `{project_id: 1}` | 프로젝트별 전체 자료 조회 |

---

## 5. Long List 트리 구조 설계

### 5.1 트리 구성 원칙

하나의 프로젝트에 여러 세션(계정)이 존재할 수 있으므로, **계정명(account_name) 단위로 통합**하여 3레벨 트리를 구성한다.

```
계정명 (대분류) ─ account_name 기준 그룹핑
├── 클러스터 (중분류) ─ Level 2 (병합/독립 클러스터)
│   ├── 세부클러스터 (소분류) ─ Level 3
│   └── 세부클러스터 (소분류) ─ Level 3
├── 클러스터 (중분류) ─ Level 2
└── 클러스터 (중분류) ─ Level 2
```

### 5.2 트리 데이터 조립 로직

```java
// LongListService.getTreeData(projectId)

1. 프로젝트의 모든 완료 세션 ID 조회
   → fileSessionRepository.findByProjectIdAndIsCompleted(projectId, true)

2. cluster_statistics에서 Level 2, Level 3 데이터 조회
   → clusterStatisticsRepository.findBySessionIdIn(sessionIds)
   → level == 2: 병합/독립 클러스터
   → level == 3: 세부 클러스터

3. account_name 기준으로 그룹핑
   → Map<String, List<ClusterStatistics>> groupByAccountName
   → 동일 계정명의 세션이 여러 개면 합산

4. 트리 구조 변환
   Level 1 (대분류): account_name별 합산 통계
     ├── Level 2 (중분류): 각 병합/독립 클러스터
     │     ├── Level 3 (소분류): 세부 클러스터들
     │     └── Level 3 (소분류)
     └── Level 2 (중분류)
```

### 5.3 트리 노드 응답 구조

```json
{
  "tree": [
    {
      "id": "account_여비교통비",
      "name": "여비교통비",
      "level": 1,
      "totalCount": 1500,
      "totalAmount": 850000000.0,
      "costCenterCount": 12,
      "supplierCount": 45,
      "children": [
        {
          "id": "stat-001",
          "statisticsId": "stat-001",
          "name": "출장비_교통비_숙박비",
          "level": 2,
          "clusterNumber": 100,
          "sessionId": "session-abc",
          "totalCount": 450,
          "totalAmount": 250000000.0,
          "costCenterCount": 8,
          "supplierCount": 15,
          "children": [
            {
              "id": "stat-010",
              "statisticsId": "stat-010",
              "name": "출장비_항공",
              "level": 3,
              "clusterNumber": 501,
              "parentClusterNumber": 100,
              "sessionId": "session-abc",
              "totalCount": 80,
              "totalAmount": 45000000.0,
              "costCenterCount": 5,
              "supplierCount": 3,
              "children": []
            }
          ]
        }
      ]
    }
  ]
}
```

### 5.4 체크박스 동작 규칙

| 대상 | 체크 시 | 해제 시 |
|---|---|---|
| **대분류** (계정명) | 하위 모든 중분류/소분류 자동 체크 | 하위 모든 항목 해제 |
| **중분류** (클러스터) | 해당 클러스터와 하위 소분류 체크, 상위 대분류 indeterminate/checked 반영 | 해당 클러스터와 하위 해제, 상위 반영 |
| **소분류** (세부클러스터) | 해당 항목 체크, 상위 중분류/대분류 indeterminate/checked 반영 | 해당 항목 해제, 상위 반영 |

**Long List 저장 대상:** Level 2, Level 3 항목만 저장 (Level 1은 계산된 그룹이므로 저장 불필요)

---

## 6. 차트 기능 설계

### 6.1 항목 클릭 시 차트 표시

트리에서 계정명 또는 클러스터명 클릭 시 하단에 **공급업체별 / 코스트센터별** Bar + Pie 차트를 표시한다.

**데이터 소스:** `cluster_statistics.supplier_breakdown` / `cluster_statistics.cost_center_breakdown`

### 6.2 차트 구성

```
┌─────────────────────────────────────────────────────┐
│  선택: "출장비_교통비_숙박비"                          │
│                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │ 공급업체별 금액 비교   │  │ 공급업체별 금액 비율   │ │
│  │ (Bar Chart - 가로)    │  │ (Pie Chart - 도넛)    │ │
│  │ Top 5 / Top 10 선택   │  │ 자세히 보기 버튼       │ │
│  └──────────────────────┘  └──────────────────────┘ │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │ 코스트센터별 금액비교  │  │ 코스트센터별 금액비율  │ │
│  │ (Bar Chart - 가로)    │  │ (Pie Chart - 도넛)    │ │
│  │ Top 5 / Top 10 선택   │  │ 자세히 보기 버튼       │ │
│  └──────────────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 6.3 Top N 필터링

- API 레벨에서 `?top=5` 또는 `?top=10` 파라미터로 상위 N개만 반환
- 나머지 항목은 "기타"로 합산하여 별도 항목으로 추가

### 6.4 Pie 차트 범례 토글

- "자세히 보기" 모달에서 범례 항목 클릭 시 해당 항목을 Pie 차트에서 일시적으로 제외/포함
- **프론트엔드 로컬 상태**로 관리 (서버 호출 없음)

```javascript
const [excludedItems, setExcludedItems] = useState(new Set());
const filteredData = chartData.filter(item => !excludedItems.has(item.name));
```

---

## 7. 편집자 잠금 (Single User Edit) 설계

### 7.1 잠금 메커니즘

```
                    ┌──────────┐
                    │  Redis   │
                    │ SET NX   │
                    │ TTL 60s  │
                    └────┬─────┘
                         │
  사용자 진입 ───────────►│ 잠금 시도
                         │
  ┌──────────────┐  Yes  │  No
  │ 편집자 모드   │◄──────┤──────► 뷰어 모드
  │ (checkbox ○) │       │        (checkbox ✕)
  └──────┬───────┘       │
         │ 30초마다       │
         │ heartbeat ────►│ EXPIRE 갱신
         │               │
  이탈/로그아웃 ──────────►│ DEL
                         │
  비정상 종료 ────────────►│ TTL 만료 (60초)
```

### 7.2 Redis 키 구조

| 키 | 값 | TTL |
|---|---|---|
| `dashboard:lock:{projectId}` | `{"userId":"...","userName":"...","acquiredAt":"..."}` | 60초 |

### 7.3 잠금 획득 로직 (CostReductionDashboardService)

```java
public boolean acquireEditorLock(String projectId, String userId, String userName) {
    String lockKey = "dashboard:lock:" + projectId;
    String lockValue = buildLockJson(userId, userName);

    // 1. Redis SET NX (원자적 획득)
    Boolean acquired = redisTemplate.opsForValue()
        .setIfAbsent(lockKey, lockValue, Duration.ofSeconds(60));

    if (Boolean.TRUE.equals(acquired)) {
        updateDashboardEditor(projectId, userId, userName);  // MongoDB 저장
        return true;
    }

    // 2. 기존 잠금이 본인 것인지 확인 (재진입 허용)
    String existing = (String) redisService.get(lockKey);
    if (existing != null && existing.contains(userId)) {
        redisService.expire(lockKey, Duration.ofSeconds(60));
        return true;
    }

    return false;
}
```

### 7.4 프론트엔드 훅 (useEditorLock)

```javascript
function useEditorLock(projectId) {
    const [isEditor, setIsEditor] = useState(false);

    useEffect(() => {
        // 마운트: 잠금 획득
        costReductionService.acquireLock(projectId).then(res => {
            setIsEditor(res.isEditor);
        });

        // 30초 하트비트
        const interval = setInterval(() => {
            if (isEditor) costReductionService.heartbeat(projectId);
        }, 30000);

        // 언마운트/이탈: 잠금 해제
        const release = () => costReductionService.releaseLock(projectId);
        window.addEventListener('beforeunload', release);

        return () => {
            clearInterval(interval);
            window.removeEventListener('beforeunload', release);
            release();
        };
    }, [projectId]);

    return { isEditor };
}
```

### 7.5 편집자 권한 인계 규칙

1. 편집자 A가 로그아웃 또는 페이지 이탈 → Redis 키 삭제 + MongoDB 편집자 정보 삭제
2. 뷰어 B가 이미 접속 중이더라도 → **새로고침(페이지 재진입) 시에만** 편집자 잠금 시도
3. 비정상 종료(네트워크 끊김 등) → 60초 TTL 만료 후 자동 해제

---

## 8. 단계 전환 (Phase Transition) 설계

### 8.1 전환 흐름

```
LONG_LIST ──"Short List 도출"──→ SHORT_LIST ──"Able 과제 등록"──→ ABLE_REGISTER ──"과제 등록"──→ ABLE_MANAGE ──"과제 완료"──→ COMPLETED_MANAGE
```

### 8.2 전환 규칙

| 현재 단계 | 대상 단계 | 전환 조건 | 부수 효과 |
|---|---|---|---|
| `LONG_LIST` | `SHORT_LIST` | Long List에 1개 이상 항목 저장 | - |
| `SHORT_LIST` | `ABLE_REGISTER` | Short List에 1개 이상 항목 저장 + **사용자 확인 다이얼로그** | `is_list_locked=true` (Long/Short List 수정 불가) |
| `ABLE_REGISTER` | `ABLE_MANAGE` | 1개 이상 과제 등록 | - |
| `ABLE_MANAGE` | `COMPLETED_MANAGE` | 1개 이상 과제 완료 | - |

### 8.3 잠금 후 동작

`is_list_locked=true` 이후:
- Long List / Short List 페이지 진입 및 조회(차트 포함) **가능**
- 체크박스 클릭 및 항목 수정 **불가**
- "Short List 도출" / "Able 과제 등록" 버튼 **비활성화**

---

## 9. S3 활용 설계

### 9.1 과제 문서 저장

| 구분 | S3 Key 패턴 |
|---|---|
| 과제 첨부파일 | `projects/{projectId}/tasks/{taskId}/documents/{uuid8}_{fileName}` |
| Excel Export (기존) | `projects/{projectId}/sessions/{sessionId}/exports/...` |

**예시:** `projects/abc-123/tasks/task-456/documents/d1e2f3a4_분석보고서.xlsx`

### 9.2 Presigned URL 흐름

```
Frontend                 Backend                    S3
   │                        │                        │
   │ 1. POST upload-url     │                        │
   │   {fileName, fileSize} │                        │
   │ ──────────────────────►│                        │
   │                        │ 2. Generate PUT URL    │
   │                        │ ───────────────────────►│
   │ 3. {presignedUrl,      │                        │
   │     s3Key}             │                        │
   │ ◄──────────────────────│                        │
   │                        │                        │
   │ 4. PUT file directly   │                        │
   │ ─────────────────────────────────────────────────►│
   │                        │                        │
   │ 5. POST upload-complete│                        │
   │   {s3Key, fileName,    │                        │
   │    label, fileSize}    │                        │
   │ ──────────────────────►│                        │
   │                        │ 6. Save TaskDocument   │
   │ 7. {documentId}        │                        │
   │ ◄──────────────────────│                        │
```

### 9.3 다운로드

- `GET /documents/{documentId}/download` → 15분 유효 Presigned GET URL 반환

### 9.4 삭제

- 과제 삭제 시 S3 폴더 전체 삭제: `S3Service.deleteFolder("projects/{projectId}/tasks/{taskId}/documents/")`
- 개별 문서 삭제 시 해당 S3 key 삭제

---

## 10. Redis 캐시 전략

| 키 패턴 | TTL | 용도 | 무효화 조건 |
|---|---|---|---|
| `dashboard:lock:{projectId}` | 60초 | 편집자 잠금 | 해제 시 DEL / TTL 만료 |
| `longlist:tree:{projectId}` | 30분 | Long List 트리 데이터 | Long List 저장 시 삭제 |
| `longlist:chart:{statisticsId}:{top}` | 30분 | 차트 데이터 (top5/10) | 변경 없음 (읽기 전용) |
| `shortlist:tree:{projectId}` | 30분 | Short List 트리 데이터 | Short List 저장 시 삭제 |

---

## 11. Backend API 전체 명세

### 11.1 대시보드 관리 (`/api/projects/{projectId}/dashboard`)

| Method | Endpoint | 설명 | Request Body | Response |
|---|---|---|---|---|
| `POST` | `/init` | 대시보드 초기화 | - | `{ projectId, currentPhase, isEditor, editorInfo }` |
| `GET` | `/status` | 상태 조회 | - | `{ currentPhase, isListLocked, isEditor, editorUserId, editorUserName }` |
| `POST` | `/lock/acquire` | 편집 잠금 획득 | - | `{ isEditor, editorUserId, editorUserName }` |
| `POST` | `/lock/heartbeat` | 하트비트 | - | `{ success }` |
| `POST` | `/lock/release` | 잠금 해제 | - | `{ success }` |
| `POST` | `/transition` | 단계 전환 | `{ targetPhase }` | `{ currentPhase, isListLocked }` |

### 11.2 Long List (`/api/projects/{projectId}/longlist`)

| Method | Endpoint | 설명 | Params | Response |
|---|---|---|---|---|
| `GET` | `/tree` | 트리 데이터 | - | `{ tree: [TreeNode...] }` |
| `GET` | `/stats` | 요약 통계 | - | `{ rawDataRows, accountCount, mainClusterCount, subClusterCount, totalAmount }` |
| `GET` | `/chart/{statisticsId}` | 차트 데이터 | `?top=5\|10` | `{ supplierBreakdown, costCenterBreakdown }` |
| `GET` | `/item-stats/{statisticsId}` | 선택 항목 카드 | - | `{ rawDataRows, supplierCount, costCenterCount, totalAmount, ratioToTotal }` |
| `POST` | `/save` | 선택 저장 | `{ items: [...] }` | `{ savedCount }` |
| `GET` | `/selections` | 선택 조회 | - | `{ items: [...] }` |

### 11.3 Short List (`/api/projects/{projectId}/shortlist`)

| Method | Endpoint | 설명 | Params | Response |
|---|---|---|---|---|
| `GET` | `/tree` | 트리 데이터 (필터) | - | `{ tree: [TreeNode...] }` |
| `POST` | `/save` | 선택 저장 | `{ items: [...] }` | `{ savedCount }` |
| `GET` | `/selections` | 선택 조회 | - | `{ items: [...] }` |
| `GET` | `/summary` | 레벨 요약 | - | `{ longList: {count, amount}, shortList: {count, amount} }` |

### 11.4 Able 과제 (`/api/projects/{projectId}/tasks`)

| Method | Endpoint | 설명 |
|---|---|---|
| `POST` | `/` | 과제 생성 |
| `GET` | `/` | 목록 조회 (`?status=&search=&page=&size=`) |
| `GET` | `/{taskId}` | 상세 조회 |
| `PUT` | `/{taskId}` | 수정 |
| `DELETE` | `/{taskId}` | 삭제 |
| `POST` | `/{taskId}/complete` | 완료 처리 (`{ actualSavingAmount, rating }`) |
| `GET` | `/summary` | 요약 카드 |
| `GET` | `/chart/status` | 상태별 차트 |
| `GET` | `/chart/consultant` | 컨설턴트별 차트 |
| `GET` | `/completed/summary` | 완료 과제 요약 |
| `GET` | `/completed/chart/monthly` | 월별 추이 |
| `GET` | `/completed/chart/department` | 부서별 차트 |

### 11.5 과제 문서 (`/api/projects/{projectId}/tasks/{taskId}/documents`)

| Method | Endpoint | 설명 |
|---|---|---|
| `POST` | `/link` | 링크 추가 |
| `POST` | `/upload-url` | Presigned URL 생성 |
| `POST` | `/upload-complete` | 업로드 완료 확인 |
| `GET` | `/` | 자료 목록 |
| `DELETE` | `/{documentId}` | 자료 삭제 |
| `GET` | `/{documentId}/download` | 다운로드 URL |

---

## 12. Frontend 구조 변경

### 12.1 라우트 변경

**기존 (Mock):**
```
/longlist → LongListPage (인증 없음, NewServiceLayout)
/shortlist → ShortListPage
/able-register → AbleTaskRegisterPage
/able-manage → AbleTaskManagePage
/completed-manage → CompletedTaskManagePage
```

**변경 (프로젝트 스코프 + 인증):**
```
/projects/:projectId/longlist → PrivateRoute + CostReductionLayout + LongListPage
/projects/:projectId/shortlist → PrivateRoute + CostReductionLayout + ShortListPage
/projects/:projectId/able-register → PrivateRoute + CostReductionLayout + AbleTaskRegisterPage
/projects/:projectId/able-manage → PrivateRoute + CostReductionLayout + AbleTaskManagePage
/projects/:projectId/completed-manage → PrivateRoute + CostReductionLayout + CompletedTaskManagePage
```

### 12.2 신규 파일

| 경로 | 설명 |
|---|---|
| `frontend/src/components/layout/CostReductionLayout.jsx` | 대시보드 전용 레이아웃 |
| `frontend/src/components/layout/CostReductionSidebar.jsx` | 프로젝트 스코프 사이드바 |
| `frontend/src/services/costReductionService.js` | API 클라이언트 |
| `frontend/src/hooks/useEditorLock.js` | 편집자 잠금 훅 |
| `frontend/src/hooks/useDashboardStatus.js` | 대시보드 상태 훅 |

### 12.3 수정 파일

| 경로 | 변경 내용 |
|---|---|
| `frontend/src/App.jsx` | 라우트 프로젝트 스코프로 변경 |
| `frontend/src/pages/project/ProjectsPage.jsx` | "비용 절감 수행" 버튼 추가 |
| `frontend/src/pages/longlist/LongListPage.jsx` | Mock → API 연동 |
| `frontend/src/pages/shortlist/ShortListPage.jsx` | Mock → API 연동 |
| `frontend/src/pages/abletask/AbleTaskRegisterPage.jsx` | Mock → API 연동 |
| `frontend/src/pages/abletaskmanage/AbleTaskManagePage.jsx` | Mock → API 연동 |
| `frontend/src/pages/completedtask/CompletedTaskManagePage.jsx` | Mock → API 연동 |

---

## 13. 기존 컬렉션 참조 관계

```
projects (is_completed)
    │
    ├── file_sessions (session_id, is_completed, account_names)
    │       │
    │       └── cluster_statistics (session_id, level, cluster_number, account_name)
    │               │                   ├── supplier_breakdown
    │               │                   └── cost_center_breakdown
    │               │
    │               └── clustering_results (session_id, cluster_number, data_indices)
    │                       │
    │                       └── session_data (raw_data_id)  ← Raw Data 보기
    │
    ├── cost_reduction_dashboards (project_id) ← NEW
    │
    ├── long_short_lists (project_id) ← NEW
    │
    └── able_tasks (project_id) ← NEW
            │
            └── task_documents (task_id) ← NEW
```

---

## 14. 보안 설정 변경

### SecurityConfig 추가 경로

```java
// 기존
.requestMatchers("/api/projects/**").authenticated()

// 신규 경로도 /api/projects/** 하위이므로 별도 추가 불필요
// 단, CORS 설정에 신규 프론트엔드 경로 패턴 확인 필요
```

모든 신규 API는 기존 `/api/projects/{projectId}/` 하위 경로이므로 인증/인가가 자동 적용된다.
