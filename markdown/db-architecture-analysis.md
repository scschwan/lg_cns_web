# DocumentDB 아키텍처 분석 및 개선 전략

> 작성일: 2026-02-19
> 목적: Excel 대량 업로드 시 DocumentDB 병목 현상 근본 해결 방안 검토

---

## 1. 현재 시스템 진단

### 1.1 현재 아키텍처

```
[Frontend]
    │ (Presigned URL로 직접 업로드)
    ▼
[S3: finance-excel-uploads]
    │ (S3 Event)
    ▼
[Lambda: Coordinator]
    │ Excel XML 파싱 → 50,000행 단위 청크 분할
    │ (SQS 메시지 전송)
    ▼
[SQS: finance-excel-processing-queue]
    │ (병렬 소비)
    ▼
[Lambda: Worker ×N]
    │ StreamingReader로 Excel 파싱
    │ delete-before-insert (멱등성)
    │ insertMany 20,000행 배치
    ▼
[DocumentDB: PRIMARY 1대]  ← ★ 병목 지점
    ├── raw_data (원시 데이터, 행 단위 문서)
    ├── file_sessions (세션/파일 메타데이터)
    ├── session_data (정제 데이터)
    ├── process_data (처리 결과)
    ├── process_view_data (뷰 데이터)
    ├── clustering_results (클러스터링)
    ├── preprocessing_results (전처리)
    └── keyword_analysis (키워드 분석)
```

### 1.2 문제 현상 (20개 파일 동시 업로드 시)

| 지표 | 측정값 | 정상 범위 |
|------|--------|----------|
| PRIMARY CPU | **99.83%** | < 70% |
| 동시 DB 연결 | **283개** | < 50 |
| 쓰기 대기 | 급증 | 최소 |
| 조회 서비스 | **장애** | 정상 응답 |

### 1.3 근본 원인

**DocumentDB Instance-based 클러스터의 구조적 한계:**
- **쓰기는 PRIMARY 1대만 가능** (Reader는 읽기 전용)
- 수직 확장(스펙업)만 가능, **수평 확장(샤딩) 미지원**
- 20개 Lambda Worker가 동시에 1대의 PRIMARY에 insertMany 실행
- 쓰기 + 읽기가 동일 PRIMARY에서 경쟁 → 조회 서비스까지 장애 전파

---

## 2. DB 선택지 원론적 분석

### 2.1 프로젝트 특성

이 프로젝트의 데이터 처리 요구사항:
- **가변 스키마**: Excel 파일마다 컬럼 수, 타입, 구조가 다름
- **대량 벌크 인서트**: 1MB~100MB 파일, 1~100개 동시 업로드
- **복합 분석**: 키워드 추출, 클러스터링, 집계, 필터링
- **동적 필드 쿼리**: data 필드 내부의 임의 필드 검색

### 2.2 DB 대안 비교

| DB | 스키마 유연성 | 벌크 인서트 | 분석/집계 | 쓰기 확장 | AWS 네이티브 | 코드 변경량 |
|----|:---:|:---:|:---:|:---:|:---:|:---:|
| **DocumentDB Instance** (현재) | O | 보통 | 보통 | **X** | O | 없음 |
| **DocumentDB Elastic Clusters** | O | 보통 | 보통 | **O (샤딩)** | O | 최소 |
| **MongoDB Atlas** | O | 보통 | **좋음** | O (샤딩) | △ (SaaS) | 최소 |
| **PostgreSQL + JSONB** | O | **최고** (COPY) | **좋음** (SQL) | △ (수직) | O | 대규모 |
| **OpenSearch** | O | 좋음 | **최고** | O (샤딩) | O | 대규모 |
| **S3 + Athena** (Data Lake) | O | **최고** (파일 기반) | 좋음 | **O (무제한)** | O | 대규모 |

### 2.3 각 대안 상세

#### DocumentDB Elastic Clusters
- AWS 네이티브 서비스 (별도 라이선스/계약 불필요)
- Hash 기반 샤딩으로 쓰기 수평 확장 (최대 32 샤드)
- MongoDB 5.0 호환, 기존 코드 대부분 호환
- 기존 VPC/IAM/보안 그룹 그대로 사용 가능
- ⚠️ Instance-based에서 직접 변환 불가 (새 클러스터 생성 + 마이그레이션 필요)

#### MongoDB Atlas
- MongoDB Inc.의 SaaS (AWS 서울 리전에 배포 가능)
- 완전한 MongoDB 기능 지원 (샤딩, Atlas Search, Change Streams)
- 인스턴스 단가가 DocumentDB 대비 약 2배
- 별도 결제/관리 (AWS 빌링과 분리)
- VPC Peering 또는 PrivateLink로 연결 필요

#### PostgreSQL + JSONB
- COPY 명령으로 초당 수십만 행 벌크 인서트 (MongoDB 대비 5~10배)
- SQL 기반 강력한 분석 쿼리 (MongoDB Aggregation보다 표현력 높음)
- GIN 인덱스로 JSONB 내부 필드 검색 가능
- ⚠️ Repository 전면 재작성 필요 (Spring Data JPA로 전환)

#### S3 Data Lake + OpenSearch
- S3에 Parquet 형태로 저장 → 쓰기 병목 완전 제거
- OpenSearch로 검색/분석/집계 (수평 확장 기본 지원)
- 가장 현대적이고 확장성 높은 아키텍처
- ⚠️ 아키텍처 전면 재설계, 개발 비용 최대

---

## 3. DocumentDB Elastic Clusters 상세 검토

### 3.1 기존 코드 호환성 분석 결과

**전체 Aggregation 파이프라인 9개 분석 → 1개만 수정 필요:**

| 위치 | 메서드 | Aggregation 스테이지 | 호환성 |
|------|--------|---------------------|:------:|
| `DataTransformService.java:50` | getKeywordStats() | $match → $addFields → $unwind → $group → $project → $sort | ✅ 호환 |
| `DataTransformService.java:112` | searchKeywords() | `$regex` + `$options` 조합 사용 | **❌ 비호환** |
| `SessionDataService.java:640` | getDistinctValues() | $match → $group → $sort → $limit | ✅ 호환 |
| `SessionDataService.java:729` | getDistinctValuesWithStatus() (visible) | $match → $group → $sort → $limit | ✅ 호환 |
| `SessionDataService.java:752` | getDistinctValuesWithStatus() (hidden) | $match → $group → $sort → $limit | ✅ 호환 |
| `RawDataService.java:81` | extractUniqueFieldValues() | $match → $project → $group → $sort | ✅ 호환 |
| `RawDataService.java:116` | calculateTotalAmount() | $match → $project → $group (sum) | ✅ 호환 |
| `ClusteringService.java:461` | getMergedClusterChildren() | $match → $project → $arrayElemAt | ✅ 호환 |
| `UploadService.java:1390` | 계정 파티션 분석 | $match → $addFields → $cond → $toDouble → $sort | ✅ 호환 |

**비호환 연산자 사용 여부:**

| 연산자/기능 | 사용 여부 | Elastic Clusters 지원 | 영향 |
|------------|:--------:|:-------------------:|------|
| `$regex` + `$options` 동시 사용 | **사용** (1곳) | **미지원** (에러 발생) | 수정 필요 |
| `$elemMatch` | 미사용 | 제한적 (1단계만) | 없음 |
| `$lookup` (크로스 컬렉션 조인) | 미사용 | 제한적 | 없음 |
| `$merge` / `$out` | 미사용 | 미지원 | 없음 |
| Write Concern 0 | 미사용 | 미지원 | 없음 |
| BulkOperations (ordered=false) | **사용** | **지원** | 없음 |
| `insertMany` | **사용** | **지원** | 없음 |

**필요한 코드 수정 (1곳):**

```java
// ❌ 현재 코드 (DataTransformService.java:112)
// Elastic Clusters에서 "Cannot set options in both $regex and $options" 에러 발생
new Document("$regex", keyword).append("$options", "i")

// ✅ 수정 방안: Java Pattern 객체로 대체
Pattern.compile(Pattern.quote(keyword), Pattern.CASE_INSENSITIVE)
```

### 3.2 Shard Key 설계

**대상 컬렉션: `raw_data`** (대량 insert 병목 발생 컬렉션)

Elastic Clusters는 **Hash 기반 단일 필드 샤딩**만 지원합니다.

| Shard Key 후보 | 카디널리티 | 쓰기 분산 | 읽기 효율 | 추천도 |
|---------------|-----------|:--------:|:--------:|:-----:|
| `upload_id` | 높음 (파일당 고유) | **O** (각 파일이 다른 샤드) | △ (session 조회 시 scatter-gather) | **★★★** |
| `session_id` | 중간 (세션당 고유) | △ (같은 세션 파일이 같은 샤드) | **O** (scatter-gather 없음) | ★★ |
| `_id` | 매우 높음 | O (균등 분산) | X (모든 쿼리 scatter-gather) | ★ |

**추천: `upload_id`**

이유:
1. 현재 병목 시나리오(동일 세션 20개 파일 동시 업로드)에서 **쓰기가 샤드별로 분산**
2. Lambda Worker의 `delete-before-insert` 패턴이 `upload_id` 기준 → **단일 샤드 타겟팅으로 효율적**
3. 읽기 시 scatter-gather가 발생하지만, **페이지네이션 쿼리**라 허용 가능
4. Best Practice: 쓰기 부하를 최대한 분산하는 것이 더 중요 (쓰기 병목이 근본 원인이므로)

**나머지 컬렉션은 샤딩 불필요:**
- `file_sessions`, `session_data`, `process_data` 등은 데이터 양이 적어 단일 샤드로 충분
- Elastic Clusters에서 unsharded 컬렉션은 자동으로 단일 샤드에 배치

### 3.3 마이그레이션 절차

```
[현재 상태]                           [목표 상태]
DocumentDB Instance-based             DocumentDB Elastic Clusters
┌──────────────────────┐              ┌──────────────────────────────┐
│  PRIMARY (r5.large)  │              │  Shard 1 (Writer + Reader)   │
│  ├── raw_data        │    DMS/      │  ├── raw_data (upload_id A~) │
│  ├── file_sessions   │  mongodump   │  ├── file_sessions           │
│  ├── session_data    │ ──────────→  │  └── ...                     │
│  ├── process_data    │              │  Shard 2 (Writer + Reader)   │
│  └── ...             │              │  ├── raw_data (upload_id M~) │
└──────────────────────┘              │  └── ...                     │
                                      └──────────────────────────────┘
```

**단계:**
1. Elastic Cluster 생성 (동일 VPC, 서브넷 그룹)
2. 샤딩 컬렉션 사전 생성 + shard key 설정 (`sh.shardCollection("db.raw_data", {"upload_id": "hashed"})`)
3. `mongodump`으로 데이터 덤프 (소스 DB 운영 중 가능)
4. `mongorestore`로 Elastic Cluster에 복원
5. AWS DMS CDC 태스크로 실시간 변경분 동기화
6. 애플리케이션 엔드포인트 전환 (다운타임 최소화)
7. 검증 완료 후 기존 Instance-based 클러스터 삭제

---

## 4. 속도/비용 비교표

### 4.1 쓰기 성능 비교 (20개 파일 동시 업로드 시나리오)

| 구성 | PRIMARY CPU (예상) | 쓰기 처리량 | 동시 연결 처리 | 조회 서비스 영향 |
|------|:-----------------:|:----------:|:------------:|:--------------:|
| **현재** r5.large (1 PRIMARY) | 99.83% ❌ | 1x (기준) | 283개 → 병목 | 장애 발생 |
| **스펙업** r5.xlarge (1 PRIMARY) | ~60-70% ⚠️ | ~2x | 여유 있음 | 지연 가능 |
| **스펙업 + Reader** (1 PRIMARY + 1 Reader) | ~60-70% ⚠️ | ~2x (쓰기) | 읽기 분산 | **정상** |
| **Elastic 2샤드** (2 Writer) | ~30-40% ✅ | **~2x** (분산) | 샤드별 분산 | **정상** |
| **Elastic 4샤드** (4 Writer) | ~15-25% ✅ | **~4x** (분산) | 샤드별 분산 | **정상** |
| **Elastic 2샤드 + Reader** | ~30-40% ✅ | ~2x (쓰기) | 완전 분리 | **최적** |

### 4.2 월 비용 비교 (서울 리전 추정)

| 구성 | 컴퓨팅 비용 | 스토리지 (50GB) | 총 월 비용 | 현재 대비 |
|------|:----------:|:--------------:|:---------:|:--------:|
| **현재** r5.large ×1 | $199 | $15 | **~$214** | 기준 |
| **스펙업** r5.xlarge ×1 | $399 | $15 | **~$414** | +93% |
| **스펙업 + Reader** r5.xlarge + t3.medium | $455 | $15 | **~$470** | +120% |
| **Elastic** 2샤드 × 2vCPU (Writer만) | $467 | $15 | **~$482** | +125% |
| **Elastic** 2샤드 × 2vCPU (Writer+Reader) | $934 | $15 | **~$949** | +343% |
| **Elastic** 4샤드 × 2vCPU (Writer만) | $934 | $15 | **~$949** | +343% |
| **MongoDB Atlas** M40 (4vCPU) | $748 | 포함 | **~$748** | +250% |

> **참고:** Elastic Clusters vCPU 단가: US East $0.132/hr, 서울 리전 ~$0.154~0.165/hr 추정
> DocumentDB 스토리지: $0.30/GB-month (I/O 최적화), $0.10/GB-month (표준)

### 4.3 투자 대비 효과 (ROI) 분석

| 구성 | 월 추가비용 | 쓰기 성능 개선 | 확장성 | 리스크 | 권장 시점 |
|------|:----------:|:------------:|:------:|:-----:|:--------:|
| **스펙업 + Reader** | +$256 | 2배 | 한계 있음 | **낮음** | **즉시** |
| **Elastic 2샤드 (최소)** | +$268 | 2배 (분산) | 높음 | 중간 | 데이터 증가 시 |
| **Elastic 4샤드** | +$735 | 4배 (분산) | **매우 높음** | 중간 | 대규모 확장 시 |

---

## 5. 추천 전략: 단계적 접근

### Phase 1 — 즉시 적용 (1~2일)

**목표:** 현재 장애 해결, 서비스 안정화

| 작업 | 상세 | 다운타임 | 비용 증가 |
|------|------|:--------:|:---------:|
| PRIMARY 스펙업 | r5.large → r5.xlarge | 짧은 재시작 | +$200/월 |
| Reader 추가 | t3.medium 1대 | 없음 | +$56/월 |
| Lambda 동시성 제한 | SQS MaximumConcurrency = 5~10 | 없음 | 없음 |
| 읽기 분산 설정 | secondaryPreferred 설정 | 없음 | 없음 |

**예상 효과:**
- PRIMARY CPU: 99% → 50~60%
- 조회 서비스: Reader로 분산 → 안정적
- 월 비용: $214 → $470 (+$256)

### Phase 2 — Elastic Clusters 전환 (데이터/트래픽 증가 시)

**목표:** 수평 확장으로 근본적 해결

| 작업 | 상세 |
|------|------|
| Elastic Cluster 생성 | 2샤드 × 2vCPU, 동일 VPC |
| Shard Key 설정 | `raw_data` → `upload_id` (hash 기반) |
| 코드 수정 | `DataTransformService.java:112` $regex 패턴 변경 |
| 데이터 마이그레이션 | mongodump/mongorestore + DMS CDC |
| 엔드포인트 전환 | application.yml, Lambda config 변경 |
| 검증 | 20개 파일 동시 업로드 테스트, 전체 aggregation 검증 |

**예상 효과:**
- 쓰기가 2개 샤드에 분산 → CPU 30~40%
- 향후 샤드 추가만으로 무제한 확장 가능

### Phase 3 — 장기 아키텍처 진화 (선택)

**목표:** 대규모 데이터 처리 최적화

| 방향 | 상세 |
|------|------|
| 샤드 확장 | 2 → 4 → 8 샤드 (트래픽 증가에 따라) |
| OpenSearch 연동 | 키워드 검색/분석을 OpenSearch로 분리 |
| S3 Data Lake | 원시 데이터를 Parquet로 S3 저장, Athena 분석 |

---

## 6. 수정 대상 파일 목록

### Phase 1 (인프라만, 코드 변경 없음)
- AWS Console: DocumentDB 인스턴스 수정 (스펙업)
- AWS Console: DocumentDB Reader 인스턴스 추가
- AWS Console: Lambda SQS 트리거 MaximumConcurrency 설정

### Phase 2 (Elastic Clusters 전환 시)

| 파일 | 변경 내용 |
|------|----------|
| `backend/src/main/java/com/example/finance/service/data/DataTransformService.java` (Line 112) | `$regex` + `$options` → `Pattern.compile()` |
| `backend/src/main/java/com/example/finance/config/MongoConfig.java` | Connection string → Elastic Cluster 엔드포인트 |
| `backend/lambda/src/main/java/com/example/lambda/config/MongoDBConfig.java` | Lambda Connection string 변경 |
| `backend/src/main/resources/application.yml` | MongoDB URI 변경 |

---

## 7. 참고 자료

- [DocumentDB Elastic Clusters 동작 원리](https://docs.aws.amazon.com/documentdb/latest/developerguide/elastic-how-it-works.html)
- [DocumentDB 가격](https://aws.amazon.com/documentdb/pricing/)
- [Elastic Clusters Shard Key 선택 가이드](https://aws.amazon.com/blogs/database/choose-shard-keys-to-optimize-amazon-documentdb-elastic-clusters/)
- [Elastic Clusters Best Practices](https://docs.aws.amazon.com/documentdb/latest/developerguide/elastic-best-practices.html)
- [Instance → Elastic Clusters 마이그레이션 가이드](https://aws.amazon.com/blogs/database/a-hybrid-approach-for-homogeneous-migration-to-an-amazon-documentdb-elastic-cluster/)
- [Scale Write Performance on Elastic Clusters](https://aws.amazon.com/blogs/database/scale-write-performance-on-amazon-documentdb-elastic-clusters/)
