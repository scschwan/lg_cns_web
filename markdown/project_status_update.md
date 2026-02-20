# LG CNS 비용 절감 대시보드 - 개발 현황 (2026-02-20 기준)

> JSON 원본: [project_status_update.json](./project_status_update.json)

---

## 전체 진행률 요약

| Phase | 기간 | 상태 | 진행률 |
|-------|------|------|--------|
| Phase 1 - 대시보드 기반 + 편집자 잠금 | 02/19 ~ 02/20 | **완료** | 100% |
| Phase 2 - Long List 백엔드 + 프론트엔드 | 02/20 ~ 02/23 | **진행중** | 90% |
| Phase 3 - Short List + 단계 전환 | 02/21 ~ 02/23 | **진행중** | 85% |
| Phase 4 - Able 과제 등록 | 02/22 ~ 02/25 | **진행중** | 70% |
| Phase 5 - 과제 관리 + 완료 과제 관리 | 02/23 ~ 02/25 | **진행중** | 35% |
| Phase 6 - 버그수정 및 UX 개선 | 02/20 ~ 02/23 | **진행중** | 85% |
| Phase 7 - 클러스터링 파일 업로드 | 02/24 ~ 02/25 | **예정** | 0% |

---

## 1. WBS 진행 현황

### Phase 1: 대시보드 기반 (100% 완료)
> 16개 태스크 전체 완료 (02/19 ~ 02/20)

### Phase 2: Long List (90% 진행중)

| WBS | 제목 | 상태 | 진행률 | 종료일 |
|-----|------|------|--------|--------|
| 2.1~2.6 | 백엔드 API + DTO + 서비스 | 완료 | 100% | 02/21 |
| **2.7** | **LongListPage.jsx 리팩터링** | **진행중** | **85%** | **02/23** |
| 2.8 | 선택 항목 카드 | 완료 | 100% | 02/21 |
| **2.9** | **차트 top5/top10 + Pie 범례 토글** | **진행중** | **80%** | **02/23** |
| 2.10 | Short List 도출 버튼 | 완료 | 100% | 02/22 |

### Phase 3: Short List (85% 진행중)

| WBS | 제목 | 상태 | 진행률 | 종료일 |
|-----|------|------|--------|--------|
| 3.1~3.5 | 백엔드 API + DTO | 완료 | 100% | 02/22 |
| **3.6** | **ShortListPage.jsx 리팩터링** | **진행중** | **80%** | **02/23** |
| 3.7 | Able 과제 등록 버튼 + 다이얼로그 | 완료 | 100% | 02/22 |

### Phase 4: Able 과제 등록 (70% 진행중)

| WBS | 제목 | 상태 | 진행률 | 종료일 |
|-----|------|------|--------|--------|
| 4.1~4.3 | AbleTask/TaskDocument 모델 + Repository | 완료 | 100% | 02/22 |
| **4.4** | **AbleTaskService (CRUD + 완료처리)** | **진행중** | **80%** | **02/24** |
| 4.5 | TaskDocumentService | 완료 | 100% | 02/23 |
| **4.6** | **S3 Presigned URL 메서드** | **진행중** | **85%** | **02/24** |
| 4.7~4.9 | Controller + DTO + API 클라이언트 | 완료 | 100% | 02/23 |
| **4.10** | **AbleTaskRegisterPage.jsx 리팩터링** | **진행중** | **75%** | **02/25** |
| **4.11** | **레벨 네비게이션 구현** | **진행중** | **60%** | **02/25** |

### Phase 5: 과제 관리 + 완료 과제 관리 (35% 진행중)

| WBS | 제목 | 상태 | 진행률 | 종료일 |
|-----|------|------|--------|--------|
| **5.1** | **과제 요약/차트 엔드포인트** | **진행중** | **60%** | **02/25** |
| **5.2** | **완료 과제 요약/차트 엔드포인트** | **예정** | **0%** | **02/25** |
| **5.3** | **과제 삭제 S3 파일 정리** | **진행중** | **40%** | **02/25** |
| 5.4 | TaskSummaryResponse DTO | 완료 | 100% | 02/23 |
| **5.5** | **AbleTaskManagePage.jsx 리팩터링** | **진행중** | **50%** | **02/25** |
| **5.6** | **CompletedTaskManagePage.jsx** | **예정** | **0%** | **02/25** |

### Phase 6: 버그수정 및 UX 개선 (85% 진행중, 코드 수정 14건 완료)
> Round 1~5 버그수정 3건 + 개선 11건 코드 반영 완료, Long/Short List 통합 테스트 연동 확인 중

### Phase 7: 사용자 클러스터링 파일 업로드 (예정)

| WBS | 제목 | 상태 | 종료일 |
|-----|------|------|--------|
| 7.1 | ClusteringImportService (Excel/CSV → cluster_statistics) | 예정 | 02/25 |
| 7.2 | ClusteringImportController (업로드/미리보기/적용) | 예정 | 02/25 |
| 7.3 | S3Service 클러스터링 경로 추가 | 예정 | 02/24 |
| 7.4 | Long/Short List + Redis 캐시 연쇄 초기화 | 예정 | 02/25 |
| 7.5 | ClusteringUploadDialog 컴포넌트 | 예정 | 02/25 |
| 7.6 | 업로드 진입점 UI 추가 | 예정 | 02/25 |

---

## 2. 요구사항 현황

| 코드 | 분류 | 제목 | 상태 |
|------|------|------|------|
| REQ-CR-001 | 편집자 잠금 | Redis SET NX 기반 편집자 잠금 | **개발완료** |
| REQ-CR-002 | Long List/성능 | Redis 캐싱 (TTL 30분) | **테스트중** |
| REQ-CR-003 | Long List/데이터구조 | 3단계 트리 구조 | **테스트중** |
| REQ-CR-004 | Long List/차트 | Top N + 계정명 차트 + 파이차트 토글 | **개발완료** |
| REQ-CR-005 | Short List/단계전환 | 리스트 잠금 + 잠금 해제 | **테스트중** |
| REQ-CR-006 | Able 과제/파일 | S3 Presigned URL 업로드/다운로드 | **개발중** |
| REQ-CR-007 | Able 과제/자동화 | 모수 금액 자동합산 + 예상 절감액 자동계산 | **개발완료** |
| REQ-CR-008 | Able 과제/삭제 | 과제 삭제 시 S3 연동 삭제 | **개발중** |
| REQ-CR-009 | 완료 과제/관리 | 과제 완료 처리 (절감액, 달성율) | **개발중** |
| REQ-CR-010 | 단계관리 | 5단계 순차 전환 + 선행 조건 검증 | **개발완료** |
| REQ-CR-011 | Short List/UX | Short List 재도출 확인 다이얼로그 | **개발완료** |
| REQ-CR-012 | UX | 단계 네비게이션 바 (동적 갱신) | **개발완료** |
| REQ-CR-013 | 데이터보호 | 과제 등록 항목 체크해제 방지 | **개발완료** |
| REQ-CR-014 | Able 과제/UX | 과제 등록 트리 5컬럼 개선 | **개발완료** |
| REQ-CR-015 | 데이터관리 | 사용자 클러스터링 파일 업로드 + 대시보드 적용 | **개발전** |

---

## 3. 마일스톤 현황

| Phase | 제목 | 마감일 | 상태 |
|-------|------|--------|------|
| Phase 1 | 대시보드 기반 + 편집자 잠금 | 02/20 | **완료** |
| Phase 2 | Long List API 연동 | 02/23 | **진행중** |
| Phase 3 | Short List + 단계 전환 | 02/23 | **진행중** |
| Phase 4 | Able 과제 등록 | 02/25 | **진행중** |
| Phase 5 | 과제 관리 + 완료 과제 | 02/25 | **진행중** |
| Phase 6 | 버그수정 및 UX 개선 | 02/23 | **진행중** |
| Phase 7 | 클러스터링 파일 업로드 | 02/25 | **예정** |
| Release | 전체 완료 | 02/25 | **예정** |

---

## 4. Phase 7 - 클러스터링 파일 업로드 구현 방안

### 배경
사용자가 별도로 생성한 클러스터링 결과 파일(Excel/CSV)을 프로젝트에 업로드하여 대시보드의 `cluster_statistics` 데이터를 대체하는 기능 필요.

### 기존 인프라 재활용 가능 항목
| 기존 컴포넌트 | 재활용 방법 |
|---------------|------------|
| `ExcelParserService` | XSSFWorkbook 기반 Excel 파싱 |
| `ExcelStreamingParser` | SAX 기반 대용량 파일 스트리밍 파싱 |
| `S3Service.generatePresignedUrl()` | 클러스터링 파일 S3 업로드 |
| `ClusterStatisticsRepository.saveAll()` | 변환된 데이터 벌크 저장 |
| `ClusterStatisticsRepository.deleteBySessionId()` | 기존 데이터 삭제 |

### 구현 플로우
```
[사용자] → 파일 업로드 → [S3] → Presigned URL
                              ↓
[Backend] ← 파싱 요청 ← [Frontend 미리보기 확인]
    ↓
ExcelStreamingParser로 파싱
    ↓
cluster_statistics로 변환 (Level 1/2/3)
    ↓
기존 cluster_statistics 삭제 → 신규 데이터 saveAll()
    ↓
Redis 캐시 초기화 (longlist:tree, shortlist:tree, etc.)
    ↓
Long/Short List shortListItems 초기화 (재도출 필요)
    ↓
Dashboard currentPhase → LONG_LIST로 리셋
```

### 핵심 고려사항
1. **파일 포맷 매핑**: 사용자 Excel 컬럼 → ClusterStatistics 필드 매핑 (미리보기에서 확인)
2. **연쇄 초기화**: cluster_statistics 변경 시 Long List/Short List/Able 과제 전체 영향
3. **트랜잭션 안전성**: 기존 삭제 + 신규 저장이 원자적으로 수행되어야 함
4. **S3 경로**: `projects/{projectId}/clustering/{fileName}` (과제 문서와 분리)

---

## 5. 클라우드 서비스 현황 (월 $305)

| 서비스 | 유형 | 스펙 | 비용 |
|--------|------|------|------|
| ECS Fargate | compute | 1 vCPU / 2GB, Tasks: 2 | $80 |
| DocumentDB | database | db.r5.large, 16GB | $180 |
| ElastiCache Redis | cache | cache.t3.medium | $30 |
| S3 | storage | Standard + Presigned URL | $10 |
| ECR | registry | Standard | $5 |
