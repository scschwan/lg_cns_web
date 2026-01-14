# 2. 구축 시스템 내 서비스 아키텍처

## 목차
- [전체 시스템 구성도](#전체-시스템-구성도)
- [각 서비스별 상세 설명](#각-서비스별-상세-설명)
- [서비스 간 통신 흐름](#서비스-간-통신-흐름)
- [데이터 흐름](#데이터-흐름)

---

## 전체 시스템 구성도

```
┌──────────────────────────────────────────────────────────────┐
│                        사용자 (브라우저)                      │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTPS
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  CloudFront CDN (전 세계 엣지)                                │
│  - 정적 파일 캐싱 (HTML, JS, CSS, 이미지)                    │
│  - HTTPS 인증서 (AWS Certificate Manager)                    │
│  - DDoS 보호 (AWS Shield)                                    │
│  비용: $5/월                                                  │
└────────────────────────────┬─────────────────────────────────┘
                             │
                  ┌──────────┴──────────┐
                  │                     │
                  ▼                     ▼
┌──────────────────────────┐  ┌────────────────────────────────┐
│  S3 Bucket (Frontend)    │  │  Application Load Balancer     │
│  - React/Vue 빌드 파일   │  │  - SSL Termination             │
│  - index.html            │  │  - Health Check                │
│  - static/js, css        │  │  - Sticky Session (Redis)      │
│  비용: $1/월             │  │  비용: $18/월                  │
└──────────────────────────┘  └───────────┬────────────────────┘
                                          │
                              ┌───────────┴───────────┐
                              │                       │
                              ▼                       ▼
                    ┌─────────────────┐    ┌─────────────────┐
                    │  ECS Fargate 1  │    │  ECS Fargate 2  │
                    │  Spring Boot    │    │  Spring Boot    │
                    │  0.5vCPU, 1GB   │    │  0.5vCPU, 1GB   │
                    │                 │    │                 │
                    │  REST API:      │    │  REST API:      │
                    │  /api/upload    │    │  /api/upload    │
                    │  /api/data      │    │  /api/data      │
                    │  /api/process   │    │  /api/process   │
                    │  비용: $18/월   │    │  비용: $18/월   │
                    └────┬───────┬────┘    └────┬───────┬────┘
                         │       │              │       │
           ┌─────────────┘       └──────┬───────┘       └─────┐
           │                            │                     │
           ▼                            ▼                     ▼
┌────────────────────┐    ┌──────────────────────┐  ┌──────────────────┐
│  ElastiCache Redis │    │  S3 (Excel Storage)  │  │  SQS Queue       │
│  t4g.small         │    │  - 업로드 파일       │  │  - Processing    │
│  - 세션 저장       │    │  - TTL 7일           │  │  - DLQ           │
│  - 페이징 캐시     │    │  비용: $2/월         │  │  비용: $0.5/월   │
│  비용: $24/월      │    └──────────┬───────────┘  └────┬─────────────┘
└────────────────────┘               │                   │
                                     │ S3 Event          │
                                     ▼                   ▼
                          ┌────────────────────────────────────────┐
                          │  Lambda Function (Excel Parser)        │
                          │  - Coordinator: 메타데이터 분석        │
                          │  - Worker: 청크별 파싱                 │
                          │  - 동시 실행: 최대 10개               │
                          │  비용: $15/월                          │
                          └───────────────┬────────────────────────┘
                                          │
                                          ▼
                          ┌────────────────────────────────────────┐
                          │  DocumentDB (MongoDB 호환)             │
                          │  t4g.medium (2vCPU, 4GB)              │
                          │  - raw_data                            │
                          │  - process_data                        │
                          │  - clustering_results                  │
                          │  비용: $73/월                          │
                          └────────────────────────────────────────┘
```

---

## 각 서비스별 상세 설명

### 1. CloudFront (CDN)

```
역할: 전 세계 사용자에게 빠른 콘텐츠 전달

특징:
─────────────────────────────────────────
✅ 200+ 엣지 로케이션
✅ 자동 HTTPS (무료 인증서)
✅ DDoS 방어 (AWS Shield)
✅ 캐시 정책 설정 가능

동작 방식:
─────────────────────────────────────────
1. 사용자 요청 → 가장 가까운 엣지 서버
2. 캐시 HIT → 즉시 응답 (10ms)
3. 캐시 MISS → S3에서 가져와 캐싱
4. 다음 요청부터 캐시 응답

캐시 정책:
─────────────────────────────────────────
- HTML: 5분 (자주 변경)
- JS/CSS: 1일 (버전 관리)
- 이미지: 7일 (거의 안 변경)
```

### 2. S3 (Frontend 호스팅)

```
역할: React 앱의 정적 파일 원본 저장

저장 파일:
─────────────────────────────────────────
/index.html                    (엔트리포인트)
/static/js/main.[hash].js      (React 번들)
/static/css/main.[hash].css    (스타일)
/static/media/logo.png         (이미지)

정적 웹사이트 호스팅 설정:
─────────────────────────────────────────
Index document: index.html
Error document: index.html (SPA 라우팅)

버킷 정책:
─────────────────────────────────────────
CloudFront만 접근 가능 (OAI 설정)
직접 S3 접근 차단
```

### 3. Route 53 (DNS)

```
역할: 도메인을 AWS 리소스로 연결

레코드 설정:
─────────────────────────────────────────
A 레코드:
  finance-tool.com → CloudFront (Alias)

A 레코드:
  api.finance-tool.com → ALB (Alias)

CNAME:
  www.finance-tool.com → finance-tool.com

MX (이메일, 옵션):
  finance-tool.com → 이메일 서버

TTL 설정:
─────────────────────────────────────────
일반 레코드: 300초 (5분)
자주 변경: 60초 (1분)
```

### 4. Application Load Balancer (ALB)

```
역할: 트래픽을 ECS Fargate 태스크에 분산

리스너 규칙:
─────────────────────────────────────────
HTTPS:443
  - 모든 요청 → Target Group (ECS)
  - Health Check: GET /actuator/health
  - 간격: 30초
  - 실패 임계값: 2회

HTTP:80
  - HTTPS로 리다이렉트

Sticky Session:
─────────────────────────────────────────
사용 안 함 (Redis 세션 사용)

Connection Draining:
─────────────────────────────────────────
300초 (배포 시 기존 연결 유지)
```

### 5. ECS Fargate (Backend API)

```
역할: Spring Boot API 서버 실행

클러스터 설정:
─────────────────────────────────────────
클러스터: finance-cluster
서비스: finance-api
태스크 수: 2개 (고가용성)

태스크 정의:
─────────────────────────────────────────
CPU: 0.5 vCPU (512 단위)
메모리: 1GB
컨테이너 이미지: ECR 레지스트리
포트 매핑: 8080

환경 변수:
─────────────────────────────────────────
SPRING_PROFILES_ACTIVE=prod
MONGODB_URI=mongodb://documentdb:27017/finance
REDIS_HOST=redis.cache.amazonaws.com
REDIS_PORT=6379
AWS_REGION=ap-northeast-2

Auto Scaling:
─────────────────────────────────────────
최소: 2개
최대: 10개
Target Metric: CPU 70%

배포 전략:
─────────────────────────────────────────
Rolling Update:
  1. 새 태스크 시작
  2. Health Check 통과 대기
  3. 구 태스크 종료
  4. 무중단 배포 완료
```

### 6. DocumentDB (MongoDB)

```
역할: 메인 데이터베이스

인스턴스 설정:
─────────────────────────────────────────
인스턴스 클래스: t4g.medium
vCPU: 2
메모리: 4GB
스토리지: 100GB SSD (자동 확장)

클러스터 구성:
─────────────────────────────────────────
Primary: 1개 (읽기/쓰기)
Replica: 0개 (비용 절감)
※ 프로덕션에서는 Replica 1개 추천

백업 설정:
─────────────────────────────────────────
자동 백업: 매일
보존 기간: 7일
백업 시간: 03:00-04:00 (트래픽 낮은 시간)

컬렉션 구조:
─────────────────────────────────────────
raw_data:           업로드된 원본 데이터
process_data:       처리된 데이터
clustering_results: 클러스터링 결과
sessions:           세션 정보 (옵션)
```

### 7. ElastiCache Redis

```
역할: 고속 캐시 및 세션 저장소

노드 설정:
─────────────────────────────────────────
노드 타입: cache.t4g.small
메모리: 0.5GB
복제: 없음 (단일 노드)

사용 사례:
─────────────────────────────────────────
1. 세션 저장 (로그인 정보)
   키: session:{sessionId}
   TTL: 2시간

2. 페이징 캐시
   키: session:{id}:page:{page}
   TTL: 30분

3. API 응답 캐시
   키: api:data:{hash}
   TTL: 10분

4. Excel 처리 상태
   키: upload:status:{uploadId}
   TTL: 24시간

데이터 구조:
─────────────────────────────────────────
String:  단순 값 (세션, 상태)
Hash:    구조화된 데이터 (처리 상태)
List:    순서 있는 데이터
Set:     중복 없는 집합
```

### 8. S3 (Excel 저장소)

```
역할: 업로드된 Excel 파일 임시 보관

버킷 구조:
─────────────────────────────────────────
finance-excel-uploads/
  ├─ uploads/{sessionId}/{uploadId}/file.xlsx
  ├─ processed/{sessionId}/{uploadId}/
  └─ archive/{date}/

Lifecycle Policy:
─────────────────────────────────────────
uploads/ → 7일 후 삭제
processed/ → 30일 후 Glacier 이동
archive/ → 90일 후 삭제

이벤트 설정:
─────────────────────────────────────────
ObjectCreated:Put → SQS 메시지 발행
파일 업로드 완료 시 자동 처리 트리거
```

### 9. SQS (메시지 큐)

```
역할: Lambda 워커 트리거 및 재시도 관리

큐 설정:
─────────────────────────────────────────
큐 이름: excel-processing-queue
Visibility Timeout: 1800초 (30분)
Message Retention: 24시간
Max Receives: 3회

DLQ (Dead Letter Queue):
─────────────────────────────────────────
실패한 메시지 보관
수동 확인 및 재처리

메시지 구조:
─────────────────────────────────────────
{
  "s3Bucket": "finance-excel-uploads",
  "s3Key": "uploads/session123/abc/file.xlsx",
  "uploadId": "abc-123",
  "sessionId": "session123",
  "startRow": 1,
  "endRow": 100000
}
```

### 10. Lambda (Excel 워커)

```
역할: Excel 파싱 및 MongoDB 삽입

함수 구성:
─────────────────────────────────────────
Coordinator:
  - 메모리: 512MB
  - 타임아웃: 60초
  - 트리거: S3 Event
  - 작업: 메타데이터 분석, 청크 분할

Worker:
  - 메모리: 1024MB
  - 타임아웃: 900초 (15분)
  - 트리거: SQS 메시지
  - 동시 실행: 10개
  - 작업: 청크 파싱, MongoDB 삽입

환경 변수:
─────────────────────────────────────────
MONGODB_URI=mongodb://...
REDIS_HOST=...
S3_BUCKET=finance-excel-uploads
BATCH_SIZE=20000

VPC 설정:
─────────────────────────────────────────
VPC: 동일 VPC
Subnet: Private Subnet
Security Group: DocumentDB/Redis 접근 허용
```

---

## 서비스 간 통신 흐름

### 인증 흐름

```
1. 사용자 로그인 요청
   Browser → CloudFront → ALB → ECS Fargate

2. Spring Boot 인증 처리
   - 사용자 정보 검증 (DocumentDB)
   - JWT 토큰 생성
   - Redis에 세션 저장

3. 응답 전달
   ECS → ALB → CloudFront → Browser

4. 이후 요청
   - 헤더에 JWT 토큰 포함
   - Redis 세션 검증 (2ms)
```

### 데이터 조회 흐름

```
1. 페이징 데이터 요청
   GET /api/data?page=2&size=1000

2. Spring Boot 캐시 확인
   Redis 조회: session:123:page:2

3. 캐시 HIT
   - 즉시 응답 (2ms)
   - 끝

4. 캐시 MISS
   - DocumentDB 조회 (200ms)
   - Redis에 캐싱 (TTL 30분)
   - 응답
```

### Excel 업로드 흐름

```
1. Presigned URL 요청
   POST /api/upload/presigned-url
   → Spring Boot가 S3 URL 생성
   → 클라이언트에 반환

2. 직접 S3 업로드
   Browser → S3 (멀티파트)
   - 100MB씩 병렬 업로드
   - ALB/ECS 우회 (대역폭 절약)

3. S3 Event 발행
   S3 → SQS → Lambda Coordinator

4. 청크 분할
   Coordinator가 10개 청크 메시지 발행

5. 병렬 처리
   10개 Lambda Worker 동시 실행
   - 각자 S3에서 다운로드
   - 자기 범위만 파싱
   - DocumentDB 배치 삽입
   - Redis 진행률 업데이트

6. 진행률 폴링
   Browser → GET /api/upload/status/{uploadId}
   → Redis 조회 (2ms)
   → 1초마다 폴링
```

---

## 데이터 흐름

### 데이터 라이프사이클

```
1. 업로드 단계
─────────────────────────────────────────
Excel 파일
  → S3 (uploads/)
  → Lambda 파싱
  → DocumentDB (raw_data)

2. 처리 단계
─────────────────────────────────────────
DocumentDB (raw_data)
  → Spring Boot 처리
  → DocumentDB (process_data)
  → Redis 캐싱

3. 분석 단계
─────────────────────────────────────────
DocumentDB (process_data)
  → 클러스터링 알고리즘
  → DocumentDB (clustering_results)

4. 조회 단계
─────────────────────────────────────────
DocumentDB
  → Redis 캐싱
  → API 응답
  → Browser 표시

5. 아카이빙
─────────────────────────────────────────
S3 (uploads/) → 7일 후 삭제
S3 (processed/) → 30일 후 Glacier
DocumentDB → 백업 (7일 보관)
```

### 데이터 보안

```
전송 중 (In-Transit):
─────────────────────────────────────────
✅ HTTPS (TLS 1.3)
✅ VPC 내부: TLS/SSL
✅ DocumentDB: TLS 강제

저장 중 (At-Rest):
─────────────────────────────────────────
✅ S3: AES-256 암호화
✅ DocumentDB: 디스크 암호화
✅ Redis: 암호화 옵션 (비활성, 성능 우선)

접근 제어:
─────────────────────────────────────────
✅ IAM 역할 기반
✅ Security Group 화이트리스트
✅ DocumentDB 인증 필수
```

---

## 총 정리

```
서비스 계층 구조:
─────────────────────────────────────────
Layer 1 (Frontend):
  - CloudFront + S3
  - React 앱 전달

Layer 2 (API Gateway):
  - Route 53
  - ALB
  - 트래픽 라우팅

Layer 3 (Application):
  - ECS Fargate
  - Spring Boot API
  - 비즈니스 로직

Layer 4 (Data):
  - DocumentDB (영구 저장)
  - Redis (임시 캐시)
  - S3 (파일 저장)

Layer 5 (Processing):
  - Lambda
  - Excel 파싱
  - 비동기 작업

Layer 6 (Messaging):
  - SQS
  - 작업 큐
```

**핵심: 각 서비스는 독립적으로 확장 가능하며, 장애 시 영향 범위를 최소화하는 마이크로서비스 아키텍처** ✅
