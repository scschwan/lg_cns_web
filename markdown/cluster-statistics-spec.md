# cluster_statistics 컬렉션 명세

## 1. 개요

`cluster_statistics` 컬렉션은 **세션 완료(세션 완료 버튼 클릭)** 시점에 자동 생성되는 클러스터별 집계 통계 데이터이다.
병합 클러스터 기준으로 코스트센터/공급업체 수, 각 항목별 건수 및 합계 금액을 3단계 계층 구조로 저장한다.

**목적**: 향후 대시보드 화면에서 세션별 클러스터 분석 결과를 시각화하기 위한 데이터 소스로 활용

---

## 2. 컬렉션 스키마

### 2.1 필드 정의

| MongoDB 필드명 | Java 필드명 | 타입 | 설명 |
|---|---|---|---|
| `_id` | `id` | String | MongoDB ObjectId |
| `session_id` | `sessionId` | String | 세션 ID (FileSession.sessionId) |
| `cluster_number` | `clusterNumber` | Integer | 클러스터 번호 (Level 1은 `null`) |
| `parent_cluster_number` | `parentClusterNumber` | Integer | 상위 클러스터 번호 (Level 3에서 사용, Level 1/2는 `null`) |
| `cluster_name` | `clusterName` | String | 클러스터명 (Level 1은 `null`) |
| `account_name` | `accountName` | String | 계정명 (FileSession.accountNames 조합) |
| `level` | `level` | Integer | 계층 레벨 (1, 2, 3) |
| `total_count` | `totalCount` | Integer | 총 데이터 건수 |
| `total_amount` | `totalAmount` | Double | 총 금액 |
| `cost_center_count` | `costCenterCount` | Integer | 코스트센터 수 |
| `supplier_count` | `supplierCount` | Integer | 공급업체 수 |
| `cost_center_breakdown` | `costCenterBreakdown` | List\<BreakdownItem\> | 코스트센터별 상세 집계 |
| `supplier_breakdown` | `supplierBreakdown` | List\<BreakdownItem\> | 공급업체별 상세 집계 |
| `created_at` | `createdAt` | LocalDateTime | 통계 생성 시간 |

### 2.2 BreakdownItem 중첩 구조

| 필드명 | 타입 | 설명 |
|---|---|---|
| `name` | String | 코스트센터명 또는 공급업체명 (`null`이면 "(미지정)") |
| `count` | Integer | 해당 항목에 속하는 데이터 건수 |
| `totalAmount` | Double | 해당 항목의 합계 금액 |

### 2.3 인덱스

| 인덱스명 | 필드 | 용도 |
|---|---|---|
| `session_level_idx` | `{session_id: 1, level: 1}` | 세션 + 레벨 기준 조회 |
| `session_cluster_idx` | `{session_id: 1, cluster_number: 1}` | 세션 + 클러스터 번호 기준 조회 |

---

## 3. 계층 구조 (Level 1 / 2 / 3)

```
Level 1: 세션 전체 통계 (1건)
├── Level 2: 병합 클러스터 A (cluster_number = 100)
│   ├── Level 3: 세부 클러스터 A-1 (parent_cluster_number = 100)
│   └── Level 3: 세부 클러스터 A-2 (parent_cluster_number = 100)
├── Level 2: 병합 클러스터 B (cluster_number = 200)
│   └── Level 3: 세부 클러스터 B-1 (parent_cluster_number = 200)
├── Level 2: 독립 클러스터 C (cluster_number = 5)
└── Level 2: 독립 클러스터 D (cluster_number = 8)
```

### 3.1 Level별 특징

| Level | 구분 | cluster_number | parent_cluster_number | 설명 |
|---|---|---|---|---|
| **1** | 세션 전체 | `null` | `null` | 세션 내 전체 클러스터를 합산한 총계 |
| **2** | 병합/독립 클러스터 | 클러스터 번호 | `null` | 최상위 클러스터 단위 통계 |
| **3** | 세부 클러스터 | 세부 클러스터 번호 | Level 2의 cluster_number | Step 7 세부 병합 내부 통계 |

### 3.2 클러스터 분류 기준 (clustering_results 컬렉션 참조)

- **독립 클러스터**: `cluster_id == null` 또는 `cluster_id == -1`
- **병합 부모 클러스터**: `cluster_id > 0 && cluster_id == cluster_number` (자기 참조)
- **병합 자식 클러스터**: `cluster_id > 0 && cluster_id != cluster_number`
- **세부 병합 부모**: `cluster_sub_id > 0 && cluster_sub_id == cluster_number`
- **세부 병합 자식**: `cluster_sub_id > 0 && cluster_sub_id != cluster_number`
- **미세부병합**: `cluster_sub_id == -1` 또는 `cluster_sub_id == null`

---

## 4. 데이터 생성 흐름

### 4.1 생성 시점

```
사용자가 "세션 완료" 버튼 클릭
  → ExportService.completeSessionWithExport()
    → (필요 시) exportAllClusters() 실행
    → clusterStatisticsService.generateStatistics(sessionId)  ← 여기서 생성
    → completeSession() (is_completed=true 설정)
```

### 4.2 생성 로직 (ClusterStatisticsService.generateStatistics)

1. **기존 통계 삭제**: `deleteBySessionId(sessionId)`
2. **세션 정보 조회**: FileSession에서 `accountNames` 취득
3. **전체 클러스터 조회**: `clustering_results`에서 해당 세션 전체 조회
4. **Level 2 생성**: 최상위 클러스터(독립 + 병합 부모)별로 `process_view_data`에서 `$facet` 집계
5. **Level 3 생성**: 세부 병합 부모별로 동일한 `$facet` 집계
6. **Level 1 생성**: 모든 최상위 클러스터의 dataIndices를 합쳐 세션 전체 집계
7. **일괄 저장**: `saveAll()`

### 4.3 집계 파이프라인 ($facet)

`process_view_data` 컬렉션에서 `raw_data_id` 기준으로 매칭 후, 단일 쿼리로 코스트센터/공급업체를 동시 집계한다:

```javascript
db.process_view_data.aggregate([
  { $match: { session_id: sessionId, raw_data_id: { $in: rawDataIds } } },
  { $addFields: {
      money_num: { $cond: [
        { $eq: [{ $type: "$money" }, "string"] },
        { $toDouble: { $ifNull: ["$money", 0] } },
        { $ifNull: ["$money", 0] }
      ] }
  }},
  { $facet: {
      costCenter: [
        { $group: { _id: "$department", count: { $sum: 1 }, totalAmount: { $sum: "$money_num" } } },
        { $sort: { totalAmount: -1 } }
      ],
      supplier: [
        { $group: { _id: "$supplier", count: { $sum: 1 }, totalAmount: { $sum: "$money_num" } } },
        { $sort: { totalAmount: -1 } }
      ]
  }}
])
```

> **참고**: `money` 필드가 String 타입인 경우가 있어 `$toDouble` 변환이 필요

---

## 5. 세션 완료 자동 취소 메커니즘

세션이 완료된 상태에서 `clustering_results` 또는 `process_view_data`에 CUD(Create/Update/Delete) 작업이 발생하면 세션 완료 상태를 자동 취소한다.

### 5.1 취소 로직 (ClusterStatisticsService.cancelSessionCompletionIfNeeded)

```java
// 세션이 is_completed=true인 경우에만 동작
if (session.getIsCompleted() == true) {
    file_sessions 업데이트:
      - is_completed → false
      - export_path → unset
      - completed_at → unset
      - updated_at → now()

    cluster_statistics 전체 삭제 (해당 sessionId)
}
```

### 5.2 적용된 서비스 / 메서드 목록

| 서비스 | 메서드 | 설명 |
|---|---|---|
| **ClusteringService** | `generateUnmergedClusters()` | 미병합 클러스터 생성 (Step 5) |
| | `mergeClusters()` | 클러스터 병합 |
| | `unmergeClusters()` | 병합 해제 (전체) |
| | `unmergePartialClusters()` | 부분 병합 해제 |
| | `mergeMergedClusters()` | 병합 클러스터끼리 재병합 |
| | `addToMergedCluster()` | 추가 병합 |
| | `updateClusterName()` | 클러스터명 수정 |
| | `autoMergeUndefined()` | Undefined 일괄 병합 |
| **DetailClusteringService** | `mergeClusters()` | 세부 클러스터 병합 (Step 7) |
| | `unmergeClusters()` | 세부 병합 해제 |
| | `unmergePartialClusters()` | 세부 부분 병합 해제 |
| | `mergeMergedClusters()` | 세부 병합 클러스터 재병합 |
| | `addToMergedCluster()` | 세부 추가 병합 |
| | `updateClusterName()` | 세부 클러스터명 수정 |
| **DataTransformService** | `replaceKeywords()` | 키워드 변환 (Step 4) |

---

## 6. 소스 파일 위치

| 유형 | 파일 경로 |
|---|---|
| **모델** | `backend/src/main/java/com/example/finance/model/data/ClusterStatistics.java` |
| **레포지토리** | `backend/src/main/java/com/example/finance/repository/data/ClusterStatisticsRepository.java` |
| **서비스** | `backend/src/main/java/com/example/finance/service/data/ClusterStatisticsService.java` |
| **연동 (생성)** | `backend/src/main/java/com/example/finance/service/data/ExportService.java` (line ~624) |
| **연동 (취소)** | `ClusteringService.java`, `DetailClusteringService.java`, `DataTransformService.java` |

---

## 7. Repository 메서드

```java
public interface ClusterStatisticsRepository extends MongoRepository<ClusterStatistics, String> {

    // 세션 전체 통계 조회
    List<ClusterStatistics> findBySessionId(String sessionId);

    // 특정 레벨의 통계만 조회 (level: 1, 2, 3)
    List<ClusterStatistics> findBySessionIdAndLevel(String sessionId, Integer level);

    // 특정 상위 클러스터의 하위 통계 조회 (Level 3 조회용)
    List<ClusterStatistics> findBySessionIdAndParentClusterNumber(
            String sessionId, Integer parentClusterNumber);

    // 세션 통계 전체 삭제
    void deleteBySessionId(String sessionId);
}
```

---

## 8. JSON 데이터 예시

### Level 1 (세션 전체)

```json
{
  "session_id": "abc-123",
  "cluster_number": null,
  "parent_cluster_number": null,
  "cluster_name": null,
  "account_name": "여비교통비",
  "level": 1,
  "total_count": 1500,
  "total_amount": 850000000.0,
  "cost_center_count": 12,
  "supplier_count": 45,
  "cost_center_breakdown": [
    { "name": "경영지원팀", "count": 320, "totalAmount": 180000000.0 },
    { "name": "연구개발팀", "count": 280, "totalAmount": 150000000.0 },
    { "name": "(미지정)", "count": 50, "totalAmount": 20000000.0 }
  ],
  "supplier_breakdown": [
    { "name": "A전자", "count": 150, "totalAmount": 95000000.0 },
    { "name": "B물산", "count": 120, "totalAmount": 78000000.0 },
    { "name": "(미지정)", "count": 30, "totalAmount": 12000000.0 }
  ],
  "created_at": "2026-02-19T14:30:00"
}
```

### Level 2 (병합 클러스터)

```json
{
  "session_id": "abc-123",
  "cluster_number": 100,
  "parent_cluster_number": null,
  "cluster_name": "출장비_교통비_숙박비",
  "account_name": "여비교통비",
  "level": 2,
  "total_count": 450,
  "total_amount": 250000000.0,
  "cost_center_count": 8,
  "supplier_count": 15,
  "cost_center_breakdown": [
    { "name": "경영지원팀", "count": 120, "totalAmount": 65000000.0 },
    { "name": "영업팀", "count": 95, "totalAmount": 52000000.0 }
  ],
  "supplier_breakdown": [
    { "name": "A항공", "count": 80, "totalAmount": 45000000.0 },
    { "name": "B호텔", "count": 60, "totalAmount": 35000000.0 }
  ],
  "created_at": "2026-02-19T14:30:00"
}
```

### Level 3 (세부 클러스터)

```json
{
  "session_id": "abc-123",
  "cluster_number": 501,
  "parent_cluster_number": 100,
  "cluster_name": "출장비_항공",
  "account_name": "여비교통비",
  "level": 3,
  "total_count": 80,
  "total_amount": 45000000.0,
  "cost_center_count": 5,
  "supplier_count": 3,
  "cost_center_breakdown": [
    { "name": "경영지원팀", "count": 35, "totalAmount": 20000000.0 },
    { "name": "영업팀", "count": 25, "totalAmount": 15000000.0 }
  ],
  "supplier_breakdown": [
    { "name": "A항공", "count": 50, "totalAmount": 30000000.0 },
    { "name": "B항공", "count": 20, "totalAmount": 10000000.0 }
  ],
  "created_at": "2026-02-19T14:30:00"
}
```

---

## 9. 대시보드 활용 가이드

### 9.1 권장 조회 패턴

| 화면/목적 | 조회 방법 |
|---|---|
| **세션 요약 카드** | `findBySessionIdAndLevel(sessionId, 1)` → Level 1 1건 |
| **클러스터 목록 테이블** | `findBySessionIdAndLevel(sessionId, 2)` → Level 2 N건 |
| **특정 클러스터 드릴다운** | `findBySessionIdAndParentClusterNumber(sessionId, clusterNumber)` → Level 3 |
| **전체 트리 조회** | `findBySessionId(sessionId)` → Level 1+2+3 전체 |

### 9.2 대시보드 화면 구성 제안

```
┌─────────────────────────────────────────────────────┐
│  [Level 1] 세션 요약 카드                              │
│  계정명: 여비교통비 | 총 건수: 1,500 | 총 금액: 8.5억    │
│  코스트센터: 12개 | 공급업체: 45개                       │
├─────────────────────────────────────────────────────┤
│  [Level 2] 클러스터별 비교                              │
│  ┌──────────────────┬──────────────────┐              │
│  │  차트: 클러스터별   │  차트: 클러스터별    │              │
│  │  금액 비율 (도넛)   │  건수 비율 (바)     │              │
│  └──────────────────┴──────────────────┘              │
│                                                       │
│  클러스터 목록 (정렬: 금액 내림차순)                       │
│  ┌─────────┬──────┬────────┬────────┬────────┐       │
│  │ 클러스터명│ 건수  │ 금액    │ CC 수  │ 공급업체 │       │
│  ├─────────┼──────┼────────┼────────┼────────┤       │
│  │ 출장비   │ 450  │ 2.5억   │ 8      │ 15     │  [▶] │
│  │ 사무용품 │ 300  │ 1.8억   │ 6      │ 12     │  [▶] │
│  └─────────┴──────┴────────┴────────┴────────┘       │
├─────────────────────────────────────────────────────┤
│  [Level 3] 클러스터 드릴다운 (▶ 클릭 시 표시)            │
│  선택: "출장비" 클러스터                                 │
│  ┌──────────────────────────────────────────┐        │
│  │  코스트센터 Breakdown  │  공급업체 Breakdown │        │
│  │  경영지원팀: 120건/0.65억│  A항공: 80건/0.45억 │       │
│  │  영업팀:     95건/0.52억│  B호텔: 60건/0.35억 │       │
│  └──────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
```

### 9.3 주의사항

- 세션이 `is_completed=true`인 경우에만 `cluster_statistics` 데이터가 존재함
- 클러스터링 데이터(병합/해제/키워드 변환 등)가 변경되면 자동으로 세션 완료가 취소되고 통계가 삭제됨
- 대시보드 조회 시 `is_completed=false`인 세션은 통계 데이터가 없으므로 "통계 미생성" 상태를 표시해야 함
- `BreakdownItem.name`이 `(미지정)`인 항목은 원본 데이터에 코스트센터/공급업체가 없는 경우

### 9.4 관련 컬렉션 참조

| 컬렉션 | 용도 | cluster_statistics와의 관계 |
|---|---|---|
| `file_sessions` | 세션 메타 정보 | `session_id`로 조인, `is_completed` 확인 |
| `clustering_results` | 클러스터링 원본 데이터 | 통계 생성의 소스 데이터 |
| `process_view_data` | 가공 뷰 데이터 | 코스트센터/공급업체 집계의 소스 데이터 |
| `session_data` | 원본 엑셀 데이터 | 직접 참조 없음 (process_view_data 경유) |
