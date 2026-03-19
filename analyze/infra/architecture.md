# Finance Tool AWS 인프라 아키텍처

> **최종 수정일: 2026-03-19 (Phase 4 피드백 반영 완료)**

> **작성일**: 2026-03-19
> **리전**: ap-northeast-2 (서울)
> **AWS 계정**: 659002796326

---

## 1. 인프라 개요

Finance Tool은 AWS 클라우드 기반의 3-Tier 웹 애플리케이션으로, 금융 데이터 관리 및 Excel 대용량 처리를 위한 인프라를 구성하고 있다.

### 핵심 아키텍처 구성

| 계층 | 서비스 | 역할 |
|------|--------|------|
| **CDN/정적 호스팅** | CloudFront + S3 | React SPA 프론트엔드 서빙, API 프록시 |
| **로드밸런싱** | ALB (internet-facing) | 백엔드 API 트래픽 분산 |
| **컴퓨팅** | ECS Fargate (2 Task) | Spring Boot 백엔드 API 서버 |
| **비동기 처리** | SQS + Lambda (Java 21) | Excel 대용량 파일 비동기 처리 |
| **데이터베이스** | DocumentDB 5.0 | MongoDB 호환 문서형 DB |
| **캐시** | ElastiCache Redis 7.1 | 세션/캐시/처리 상태 관리 |
| **스토리지** | S3 | Excel 파일 업로드 저장소 |
| **컨테이너 레지스트리** | ECR | Docker 이미지 저장소 |

### 전체 아키텍처 다이어그램

```
+------------------------------------------------------------------+
|                         사용자 (Browser)                           |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|  CloudFront (E2WSY238E3ZG9N) - d3ipfpkjg02npk.cloudfront.net     |
|  [HTTPS, WAF 활성화, PriceClass_All]                               |
+------------------------------------------------------------------+
         |                                    |
         | /* (Default)                       | /api/*
         v                                    v
+-------------------+          +-------------------------------+
| S3 Static Website |          | ALB (finance-alb)             |
| lgcns-finance-    |          | internet-facing               |
| frontend-app      |          | Public Subnet 1a, 1c          |
| [React SPA]       |          +-------------------------------+
+-------------------+                         |
                                              v
                              +-------------------------------+
                              | ECS Fargate (finance-api)     |
                              | 2 Tasks x (2vCPU / 4GB)      |
                              | Private Subnet 1a, 1c         |
                              +-------------------------------+
                                 |       |       |       |
                    +------------+   +---+   +---+   +---+
                    v                v       v       v
              +-----------+  +-------+  +-----+  +-----+
              | DocumentDB|  | Redis |  | S3  |  | SQS |
              | db.r8g.lg |  | t4g.s |  |     |  |     |
              +-----------+  +-------+  +-----+  +--+--+
                                                     |
                                                     v
                                              +-------------+
                                              | Lambda       |
                                              | Coordinator  |
                                              | + Worker     |
                                              +-------------+
```

---

## 2. 네트워크 아키텍처

### 2.1 VPC 구성

| 항목 | 값 |
|------|-----|
| VPC Name | finance-vpc |
| VPC ID | `vpc-041b862a78f98462a` |
| CIDR Block | `10.0.0.0/16` (65,536 IPs) |

### 2.2 네트워크 다이어그램

```
+==============================================================================+
|  finance-vpc (vpc-041b862a78f98462a) - 10.0.0.0/16                           |
|                                                                              |
|  +--- Internet Gateway (finance-igw, igw-03f465e4dce4f88dd) ---+            |
|  |                                                              |            |
|  |  +========================+   +========================+    |            |
|  |  | Public Subnet 1a       |   | Public Subnet 1c       |    |            |
|  |  | subnet-0439ae6345851cb05|   | subnet-0d871ae82bab584e3|   |            |
|  |  | 10.0.1.0/24            |   | 10.0.4.0/24            |    |            |
|  |  | AZ: ap-northeast-2a    |   | AZ: ap-northeast-2c    |    |            |
|  |  |                        |   |                        |    |            |
|  |  | [ALB Node]             |   | [ALB Node]             |    |            |
|  |  | [NAT GW: 3.39.210.48] |   |                        |    |            |
|  |  | [Bastion: t2.micro]    |   |                        |    |            |
|  |  +========================+   +========================+    |            |
|  |          |                                                   |            |
|  |  +--- NAT Gateway (nat-0b5fb65fc5616331d, 10.0.1.15) ---+  |            |
|  |  |                                                        |  |            |
|  |  |  +========================+   +========================+ |            |
|  |  |  | Private Subnet 1a      |   | Private Subnet 1c      | |            |
|  |  |  | subnet-0bfa6431b2de4c627|   | subnet-08cdb7f10fd2f72f4| |           |
|  |  |  | 10.0.2.0/24            |   | 10.0.5.0/24            | |            |
|  |  |  | AZ: ap-northeast-2a    |   | AZ: ap-northeast-2c    | |            |
|  |  |  |                        |   |                        | |            |
|  |  |  | [ECS Task]             |   | [ECS Task]             | |            |
|  |  |  | [Lambda ENI]           |   | [Lambda ENI]           | |            |
|  |  |  |                        |   | [DocumentDB]           | |            |
|  |  |  |                        |   | [Redis]                | |            |
|  |  |  +========================+   +========================+ |            |
|  |  +--------------------------------------------------------+  |            |
|  +--------------------------------------------------------------+            |
+==============================================================================+
```

### 2.3 Route Table 구성

**Public Route Table** (`finance-public-rt`, `rtb-016ffa2a43b7f179b`)

| Destination | Target | 설명 |
|-------------|--------|------|
| `10.0.0.0/16` | local | VPC 내부 통신 |
| `0.0.0.0/0` | `igw-03f465e4dce4f88dd` (IGW) | 인터넷 아웃바운드 |

- 연결 Subnet: `finance-public-subnet-1a`, `finance-public-subnet-1c`

**Private Route Table** (`finance-private-rt`, `rtb-021492a36dbdbfb3b`) - Main Route Table

| Destination | Target | 설명 |
|-------------|--------|------|
| `10.0.0.0/16` | local | VPC 내부 통신 |
| `0.0.0.0/0` | `nat-0b5fb65fc5616331d` (NAT GW) | NAT를 통한 인터넷 아웃바운드 |

- 연결 Subnet: `finance-private-subnet-1a`, `finance-private-subnet-1c`

### 2.4 NAT Gateway

| 항목 | 값 |
|------|-----|
| Name | finance-nat-gw |
| ID | `nat-0b5fb65fc5616331d` |
| 위치 | finance-public-subnet-1a (Private IP: `10.0.1.15`) |
| Elastic IP | `3.39.210.48` |
| 유형 | Public (Zonal - AZ 2a에만 배치) |

> **[Phase 3 피드백 반영] NAT Gateway 단일 AZ 위험성**:
> NAT Gateway가 단일 AZ(2a)에만 배치되어 있어, AZ 2a 장애 시 Private Subnet(2a, 2c 모두)에서 인터넷 아웃바운드(S3, SQS 등 AWS 서비스 접근)가 불가능하다. ECS Task와 Lambda가 NAT Gateway를 통해 S3, SQS에 접근하므로, NAT Gateway 장애 시 파일 업로드/다운로드, SQS 메시지 처리가 모두 중단된다.
> - **권장 조치**: AZ 2c에도 NAT Gateway를 추가하고, 각 AZ의 Private Subnet이 해당 AZ의 NAT Gateway를 사용하도록 Route Table을 분리해야 한다.

---

## 3. 컴퓨팅 아키텍처

### 3.1 ECS Cluster

| 항목 | 값 |
|------|-----|
| Cluster Name | `finance-cluster` |
| 상태 | ACTIVE |
| Capacity Provider | FARGATE, FARGATE_SPOT |
| Running Tasks | 2 |
| Active Services | 1 |

### 3.2 ECS Service (finance-api)

| 항목 | 값 |
|------|-----|
| Service Name | `finance-api` |
| Launch Type | Fargate 1.4.0 (Linux) |
| Desired Count | 2 |
| Deployment 전략 | ROLLING (minimumHealthyPercent: 100%, maximumPercent: 200%) |
| Circuit Breaker | 활성화 (자동 rollback 포함) |
| Health Check Grace Period | 120초 |
| 네트워크 | Private Subnet 1a, 1c (awsvpc 모드) |
| Security Group | `finance-ecs-sg` (`sg-0b2f80b067408e320`) |

### 3.3 Task Definition (finance-backend-task)

| 항목 | 값 |
|------|-----|
| Family | `finance-backend-task` |
| 최신 Revision | 257 |
| CPU | 2048 (2 vCPU) |
| Memory | 4096 MB (4 GB) |
| 아키텍처 | X86_64 / LINUX |
| 네트워크 모드 | awsvpc |
| Task Role | `finance-ecs-task-role` |
| Execution Role | `finance-ecs-task-execution-role` |

**컨테이너 정의 (finance-backend)**

| 항목 | 값 |
|------|-----|
| 이미지 | `659002796326.dkr.ecr.ap-northeast-2.amazonaws.com/finance-backend:v1.1.306` |
| 베이스 이미지 | `eclipse-temurin:21-jre-alpine` |
| 컨테이너 포트 | 8080 (TCP) |
| JVM 옵션 | `-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0` |

**환경 변수**

| Key | Value |
|-----|-------|
| SPRING_PROFILES_ACTIVE | `prod` |
| AWS_REGION | `ap-northeast-2` |
| AWS_ACCOUNT_ID | `659002796326` |
| MONGODB_URI | `mongodb://dmillion:***@finance-docdb-cluster.cluster-c1ue6aayyxjn...` |
| REDIS_HOST | `finance-redis-cluster.1kdayr.0001.apn2.cache.amazonaws.com` |
| REDIS_PORT | `6379` |
| S3_BUCKET | `finance-excel-uploads` |

**Health Check 설정**

| 항목 | 값 |
|------|-----|
| Command | `wget --no-verbose --tries=1 --spider http://localhost:8080/actuator/health` |
| Interval | 30초 |
| Timeout | 10초 |
| Retries | 3 |
| Start Period | 120초 |

### 3.4 ALB (Application Load Balancer)

| 항목 | 값 |
|------|-----|
| Name | `finance-alb` |
| DNS | `finance-alb-1506892035.ap-northeast-2.elb.amazonaws.com` |
| Scheme | internet-facing |
| 가용영역 | ap-northeast-2a, ap-northeast-2c |
| Subnet | finance-public-subnet-1a, finance-public-subnet-1c |
| Security Group | `finance-alb-sg` (`sg-03100bb81c51586d0`) |

**Target Group (finance-backend-tg)**

| 항목 | 값 |
|------|-----|
| Protocol | HTTP |
| Port | 8080 |
| Target Type | IP (Fargate awsvpc) |
| Health Check Path | `/actuator/health` |
| Health Check Interval | 30초 |
| Healthy Threshold | 2 |
| Unhealthy Threshold | 2 |

### 3.5 Bastion Host

| 항목 | 값 |
|------|-----|
| Name | `bastion-db` |
| Instance ID | `i-0212c70574aad3c10` |
| Type | t2.micro |
| Subnet | finance-public-subnet-1a |
| Security Group | SSH 접근 제한 (`61.36.232.75/32`) |
| 용도 | DocumentDB/Redis 접근을 위한 SSH 터널링 |

---

## 4. 데이터 계층 아키텍처

### 4.1 DocumentDB (MongoDB 호환)

**Cluster 구성**

| 항목 | 값 |
|------|-----|
| Cluster ID | `finance-docdb-cluster` |
| Engine | Amazon DocumentDB 5.0.0 |
| Writer Endpoint | `finance-docdb-cluster.cluster-c1ue6aayyxjn.ap-northeast-2.docdb.amazonaws.com:27017` |
| Reader Endpoint | `finance-docdb-cluster.cluster-ro-c1ue6aayyxjn.ap-northeast-2.docdb.amazonaws.com:27017` |
| Master User | `dmillion` |
| Multi-AZ | No (단일 인스턴스) |
| Parameter Group | `finance-docdb-no-tls` (TLS 비활성화) |
| Subnet Group | `finance-docdb-subnet-group` (private-1a, private-1c) |
| Security Group | `finance-docdb-sg` (`sg-075dc2556c04c1d72`) |

**Instance 구성**

| 항목 | 값 |
|------|-----|
| Instance Class | `db.r8g.large` (2 vCPU, 16 GB RAM) |
| AZ | ap-northeast-2c |
| Public Access | No |
| Performance Insights | 활성화 |

**보안 및 백업**

| 항목 | 값 |
|------|-----|
| 저장 시 암호화 | KMS 암호화 활성화 |
| 백업 보존 기간 | 7일 |
| 삭제 보호 | 활성화 |
| CloudWatch Logs | audit, profiler |

> **[Phase 3 피드백 반영] DocumentDB Single AZ 가용성 위험**:
> DocumentDB가 Single Instance(db.r8g.large), 단일 AZ(ap-northeast-2c)로 구성되어 있다. AZ 2c에 장애가 발생하면 데이터베이스 접근이 완전히 불가능하다. 백엔드는 20개 이상의 MongoDB 컬렉션을 사용하며 모든 비즈니스 로직이 DocumentDB에 의존하므로, DB 장애 시 전체 서비스가 중단된다. 현재 데이터에는 프로젝트, 사용자, 파일 세션, raw_data, 클러스터링 결과 등 복구가 어려운 업무 데이터가 저장되어 있다.
> - **권장 조치**: 최소 1개의 Reader Replica를 다른 AZ(ap-northeast-2a)에 추가하여 Multi-AZ 구성을 확보해야 한다. 자동 Failover가 지원되어 Writer 장애 시 Reader가 Writer로 승격된다.

### 4.2 ElastiCache Redis

| 항목 | 값 |
|------|-----|
| Cluster ID | `finance-redis-cluster` |
| Engine | Redis 7.1.0 |
| Node Type | `cache.t4g.small` (2 vCPU, 1.37 GB) |
| Node 수 | 1 |
| AZ | ap-northeast-2c |
| Endpoint | `finance-redis-cluster.1kdayr.0001.apn2.cache.amazonaws.com:6379` |
| Subnet Group | `finance-redis-cluster-subnet` |
| Security Group | `finance-redis-sg` (`sg-02b0bb92322a14665`) |
| 전송 중 암호화 | 비활성화 |
| 저장 시 암호화 | 비활성화 |
| Auth Token | 비활성화 |

> **[Phase 3 피드백 반영] Redis 단일 노드 구성 및 인증 미적용 위험**:
> ElastiCache Redis가 단일 노드(cache.t4g.small), 단일 AZ(ap-northeast-2c)로 구성되어 있으며, Auth Token(비밀번호), 전송 중 암호화, 저장 시 암호화가 모두 비활성화 상태이다. Redis는 단순 캐시 이상의 역할을 수행한다:
> - **편집자 잠금 (Distributed Lock)**: Redis TTL 기반 하트비트(30초 간격, TTL 60초). Redis 장애 시 다중 사용자 동시 편집 충돌 발생 가능.
> - **업로드/분석 진행률 상태**: Lambda가 Redis에 처리 상태를 기록하고 프론트엔드가 폴링. Redis 장애 시 진행 상태 확인 불가.
> - **세션 데이터 캐시**: 세션별 데이터 조회 결과 캐시. Redis 장애 시 DocumentDB 직접 조회로 부하 증가.
> - VPC 내부 어떤 자원에서든 인증 없이 Redis에 접근 가능하다.
> - **권장 조치**:
>   - Cluster Mode 또는 최소 Automatic Failover가 있는 Replication Group으로 전환하여 가용성 확보.
>   - 최소한 Redis AUTH 토큰을 설정하고, 전송 중 암호화(TLS)를 활성화할 것을 권장한다.

### 4.3 데이터 계층 연결 다이어그램

```
+-------------------+     TCP 27017     +----------------------------+
| ECS Fargate Tasks |------------------>| DocumentDB                 |
| (finance-ecs-sg)  |     TCP 6379      | (finance-docdb-sg)         |
|                   |-----+             | db.r8g.large, AZ: 2c       |
+-------------------+     |             +----------------------------+
                          |
                          |             +----------------------------+
                          +------------>| ElastiCache Redis          |
                                        | (finance-redis-sg)         |
+-------------------+     TCP 6379      | cache.t4g.small, AZ: 2c    |
| Lambda Functions  |-----+----------->|                            |
| (finance-lambda-sg)|     TCP 27017    +----------------------------+
|                   |------------------>| DocumentDB                 |
+-------------------+                   +----------------------------+
```

> **참고**: DocumentDB와 Redis 모두 단일 AZ(2c)에 배치되어 있으며, Multi-AZ 구성이 아니므로 AZ 2c 장애 시 데이터 계층 전체에 영향이 발생한다.

---

## 5. CDN 및 정적 호스팅

### 5.1 CloudFront Distribution

| 항목 | 값 |
|------|-----|
| Distribution ID | `E2WSY238E3ZG9N` |
| Domain | `d3ipfpkjg02npk.cloudfront.net` |
| 상태 | Deployed |
| HTTP 버전 | HTTP/2 |
| SSL | CloudFront 기본 인증서 (redirect-to-https) |
| WAF | 활성화 (CreatedByCloudFront WAF ACL) |
| Price Class | PriceClass_All (전 세계 엣지) |
| Default Root Object | `index.html` |

### 5.2 Origin 구성

| Origin ID | 도메인 | 용도 |
|-----------|--------|------|
| Default (S3) | `lgcns-finance-frontend-app.s3-website.ap-northeast-2.amazonaws.com` | React SPA 정적 파일 |
| /api/* (ALB) | `finance-alb-1506892035.ap-northeast-2.elb.amazonaws.com` | 백엔드 API 프록시 |

> **[Phase 3 피드백 반영] CloudFront -> ALB 구간 HTTP 통신 위험**:
> CloudFront에서 ALB Origin으로의 통신이 HTTP(비암호화)로 이루어지고 있다. CloudFront -> ALB 구간은 AWS 네트워크 내부이지만, JWT 토큰과 사용자 데이터가 평문으로 전달된다. 금융 데이터를 다루는 애플리케이션 특성상 HTTPS 적용이 필요하다.
> - **권장 조치**: ALB에 ACM 인증서를 적용하고 CloudFront Origin Protocol Policy를 HTTPS로 변경하는 것을 권장한다.

### 5.3 Cache Behavior

| 경로 패턴 | Origin | 허용 Method | 캐시 정책 |
|-----------|--------|-------------|-----------|
| Default (`*`) | S3 (Frontend) | GET, HEAD, OPTIONS | Compress 활성화, DefaultTTL: 86400s |
| `/api/*` | ALB (Backend) | GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE | API 요청 전달 (캐시 비활성화) |

### 5.4 Custom Error Response (SPA 라우팅 지원)

| Error Code | Response Page | Response Code | Cache TTL |
|------------|---------------|---------------|-----------|
| 403 | `/index.html` | 200 | 0초 |
| 404 | `/index.html` | 200 | 0초 |

> React SPA의 클라이언트 사이드 라우팅을 지원하기 위해 403/404 에러를 `index.html`로 리다이렉트한다.

### 5.5 S3 정적 호스팅 버킷

| 항목 | 값 |
|------|-----|
| 버킷 이름 | `lgcns-finance-frontend-app` |
| 호스팅 타입 | Static Website Hosting |
| 생성일 | 2026-03-05 |

**S3 CORS 설정** (finance-excel-uploads):

| 항목 | 값 |
|------|-----|
| Allowed Origins | `https://d3ipfpkjg02npk.cloudfront.net`, `http://localhost:3000` |
| Allowed Methods | PUT, GET, HEAD |
| Allowed Headers | Content-Type, x-amz-* |
| Expose Headers | ETag |
| MaxAge | 3600초 |

---

## 6. 메시지 큐 아키텍처

### 6.1 SQS 큐 구성

**Processing Queue**

| 항목 | 값 |
|------|-----|
| Queue Name | `finance-excel-processing-queue` |
| ARN | `arn:aws:sqs:ap-northeast-2:659002796326:finance-excel-processing-queue` |
| Visibility Timeout | 1800초 (30분) |
| Max Message Size | 1 MB |
| Message Retention | 86400초 (1일) |
| DLQ 연결 | `finance-excel-processing-dlq` (maxReceiveCount: 3) |

**Dead Letter Queue (DLQ)**

| 항목 | 값 |
|------|-----|
| Queue Name | `finance-excel-processing-dlq` |
| Visibility Timeout | 300초 (5분) |
| Message Retention | 1209600초 (14일) |

### 6.2 Lambda 함수

**ExcelCoordinator**

| 항목 | 값 |
|------|-----|
| Function Name | `ExcelCoordinator` |
| Runtime | Java 21 |
| Handler | `com.example.lambda.coordinator.ExcelCoordinatorHandler::handleRequest` |
| Memory | 1024 MB |
| Timeout | 900초 (15분) |
| JVM 옵션 | `-Xmx1536m` |
| VPC | finance-vpc (private-subnet-1a, private-subnet-1c) |
| Security Group | `finance-lambda-sg` (`sg-03f87eab294fd8eb8`) |

> **[Phase 3 피드백 반영] JVM 옵션과 Lambda 메모리 불일치**: ExcelCoordinator의 JVM 옵션이 `-Xmx1536m`(1536MB)으로 설정되어 있으나 Lambda 메모리는 1024MB이다. `-Xmx` 값이 Lambda 할당 메모리를 초과하므로 Lambda 런타임에서 JVM이 실제 가용 메모리 내에서 자동 조정된다. 그러나 의도하지 않은 OOM 발생 가능성이 있으므로, `-Xmx` 값을 Lambda 메모리에 맞추어 `-Xmx768m` 수준으로 조정하거나 Lambda 메모리를 1536MB 이상으로 상향하는 것을 권장한다. ExcelWorker에 대해서도 동일 설정인지 확인이 필요하다.

**ExcelWorker**

| 항목 | 값 |
|------|-----|
| Function Name | `ExcelWorker` |
| Runtime | Java 21 |
| Handler | `com.example.lambda.worker.ExcelWorkerHandler::handleRequest` |
| Memory | 1024 MB |
| Timeout | 900초 (15분) |
| BATCH_SIZE | 20000 |
| VPC | finance-vpc (private-subnet-1a, private-subnet-1c) |
| Security Group | `finance-lambda-sg` (`sg-03f87eab294fd8eb8`) |

**[Phase 3 피드백 반영] AccountAnalysisHandler (AWS 미배포)**

> 백엔드 아키텍처에서 `AccountAnalysisHandler` Lambda 함수를 명시하고 있으나, 현재 AWS에 배포되어 있지 않다. 이 Lambda는 계정 분석(raw_data -> session_data 변환)을 수행하는 핵심 기능으로, 미배포 상태에서는 Step 2(계정 분석 시작) 기능이 동작하지 않으며 전체 데이터 처리 파이프라인이 중단된다.

| 항목 | 값 (예상) |
|------|-----------|
| Function Name | `AccountAnalysisHandler` |
| Runtime | Java 21 |
| Handler | `com.example.lambda.analysis.AccountAnalysisHandler::handleRequest` |
| Memory | 1024 MB (예상) |
| Timeout | 900초 (15분, 예상) |
| Trigger | SQS (`ANALYSIS_QUEUE_URL` - 별도 큐 필요 여부 확인 필요) |
| 배포 상태 | **미배포** - 인프라 프로비저닝 및 배포 필요 |

**Lambda 공통 환경 변수**

| Key | Value |
|-----|-------|
| MONGODB_URI | `mongodb://dmillion:***@finance-docdb-cluster.cluster-(...):27017/...` |
| REDIS_HOST | `finance-redis-cluster.1kdayr.0001.apn2.cache.amazonaws.com` |
| REDIS_PORT | `6379` |
| S3_BUCKET | `finance-excel-uploads` |
| SQS_QUEUE_URL | `https://sqs.ap-northeast-2.amazonaws.com/659002796326/finance-excel-processing-queue` |

### 6.3 비동기 처리 흐름

```
[사용자] Excel 업로드 요청
    |
    v
+------------------+
| ECS (Upload API) |
+------------------+
    |
    |-- (1) S3에 Excel 파일 업로드 (finance-excel-uploads)
    |
    |-- (2) SQS에 처리 메시지 전송
    |       (finance-excel-processing-queue)
    |
    v
+-------------------------------+
| SQS Trigger                   |
| Visibility Timeout: 30분      |
+-------------------------------+
    |
    v
+-------------------------------+
| ExcelCoordinator (Lambda)     |
| - 메시지 수신                  |
| - 작업 분배                    |
+-------------------------------+
    |
    v
+-------------------------------+
| ExcelWorker (Lambda)          |
| - BATCH_SIZE: 20,000건         |
| - S3에서 Excel 다운로드         |
| - 데이터 파싱 및 변환           |
+-------------------------------+
    |
    |-- (3) DocumentDB에 데이터 저장
    |-- (4) Redis에 처리 상태 업데이트
    |
    v
[처리 완료 - 프론트엔드에서 상태 폴링]

실패 시:
+-------------------------------+
| 3회 실패 → DLQ 이동            |
| finance-excel-processing-dlq  |
| 보존 기간: 14일                |
+-------------------------------+
```

---

## 7. 배포 파이프라인

### 7.1 Backend 배포 (deploy.ps1)

Backend 배포는 PowerShell 스크립트(`backend/deploy.ps1`)를 통해 14단계로 진행된다.

```
[개발자 로컬]
    |
    | (1) Git Commit & Push (자동 버전 Patch 증가)
    v
[빌드 단계]
    |
    | (2) Gradle Build (Spring Boot + Lambda 동시 빌드, 테스트 스킵)
    |     .\gradlew clean build -x test
    v
[Spring Boot 배포]
    |
    | (3) Docker Build (eclipse-temurin:21-jre-alpine 기반)
    | (4) ECR Login
    | (5) Docker Tag (finance-backend:v{version})
    | (6) ECR Push
    | (7) Task Definition 새 Revision 등록 (task-def-template.json 사용)
    |     - PLACEHOLDER_IMAGE → 실제 이미지 URI 치환
    | (8) ECS Service 업데이트 (Rolling, --force-new-deployment)
    |     - Health Check Grace Period: 120초
    v
[Lambda 배포]
    |
    | [Phase 3 피드백 반영] 배포 단계 번호 수정 (기존 11, 13번 누락 오류 수정)
    | (9)  Lambda ZIP 확인 (lambda/build/distributions/finance-lambda.zip)
    | (10) ExcelCoordinator 코드 배포 → wait
    | (11) ExcelCoordinator 구성 업데이트 (1024MB, 900s)
    | (12) ExcelWorker 코드 배포 → wait
    | (13) ExcelWorker 구성 업데이트 (1024MB, 900s)
    v
[검증]
    |
    | (14) ECS 배포 상태 확인 (30초 간격, 최대 10회 폴링)
    |      Running Count == Desired Count 확인
    v
[완료]
```

**버전 관리**: `version.txt` 파일을 통해 Semantic Versioning (Major.Minor.Patch) 관리. 배포 시 Patch 자동 증가.

**ECR 이미지 태그 형식**: `v{Major}.{Minor}.{Patch}` (예: `v1.1.306`)

### 7.2 Frontend 배포 (deploy.ps1)

Frontend 배포는 PowerShell 스크립트(`frontend/deploy.ps1`)를 통해 5단계로 진행된다.

```
[개발자 로컬]
    |
    | (1) npm run build (React 빌드)
    v
[S3 업로드]
    |
    | (2) 정적 자산 업로드 (index.html 제외)
    |     aws s3 sync ./build s3://lgcns-finance-frontend-app --delete
    |     Cache-Control: public, max-age=31536000, immutable
    |
    | (3) index.html 별도 업로드
    |     Cache-Control: no-cache, no-store, must-revalidate
    v
[CDN 캐시 무효화]
    |
    | (4) CloudFront Invalidation (/*)
    |     Distribution: E2WSY238E3ZG9N
    v
[완료]
```

> **캐시 전략**: 정적 자산(JS/CSS/이미지)은 1년 캐시 + immutable 플래그로 장기 캐싱. `index.html`만 no-cache로 항상 최신 버전 제공. 이는 React의 Content Hash 기반 파일명과 결합하여 효율적인 캐시 무효화를 구현한다.

---

## 8. 보안 아키텍처

### 8.1 Security Group 트래픽 흐름

```
[Internet]
    |
    | TCP 80, 443 (0.0.0.0/0)
    v
+---------------------------+
| finance-alb-sg            |
| sg-03100bb81c51586d0      |
+---------------------------+
    |
    | TCP 8080 (Source: finance-alb-sg)
    v
+---------------------------+
| finance-ecs-sg            |
| sg-0b2f80b067408e320      |
+---------------------------+
    |                    |
    | TCP 27017          | TCP 6379
    v                    v
+------------------+  +------------------+
| finance-docdb-sg |  | finance-redis-sg |
| sg-075dc2556c...  |  | sg-02b0bb92322...|
| Source:           |  | Source:          |
|  - finance-ecs-sg|  |  - finance-ecs-sg|
|  - 10.0.0.0/16   |  |  - finance-      |
+------------------+  |    lambda-sg     |
                      |  - 10.0.0.0/16   |
                      +------------------+
                           ^
                           | TCP 6379
+---------------------------+
| finance-lambda-sg         |
| sg-03f87eab294fd8eb8      |
| Inbound: 없음 (Outbound만)|
+---------------------------+

[관리자 IP: 61.36.232.75]
    |
    | TCP 22
    v
+---------------------------+
| finance-bastion-sg        |
| sg-023b749d4e88b2f44      |
+---------------------------+
    |
    | TCP 22 (Source: finance-bastion-sg)
    v
+---------------------------+
| finance-private-sg        |
| sg-0cc2365c9de779e15      |
| + ICMP ← 10.0.0.0/16     |
+---------------------------+
```

### 8.2 IAM Role

| Role | 용도 | 주요 권한 |
|------|------|-----------|
| `finance-ecs-task-execution-role` | ECS Task 실행 (ECR 이미지 Pull, CloudWatch Logs) | ECR 읽기, CloudWatch Logs 쓰기 |
| `finance-ecs-task-role` | ECS Task 런타임 (애플리케이션 레벨) | S3 접근, SQS 메시지 전송 |

### 8.3 암호화 설정

| 서비스 | 저장 시 암호화 | 전송 중 암호화 |
|--------|---------------|---------------|
| DocumentDB | KMS 암호화 활성화 | TLS 비활성화 (`finance-docdb-no-tls`) |
| ElastiCache Redis | 비활성화 | 비활성화 |
| ECR | AES256 | HTTPS (기본) |
| S3 | 기본 SSE | HTTPS (기본) |
| CloudFront | N/A | HTTPS (redirect-to-https) |
| ALB | N/A | HTTP (CloudFront → ALB 구간) |

> **보안 주의사항**:
> - DocumentDB의 TLS가 비활성화되어 있어 VPC 내부에서도 평문 통신이 이루어진다.
> - Redis의 암호화 및 인증이 모두 비활성화 상태이다.
> - Task Definition에 MONGODB_URI 환경 변수로 DB 자격증명이 평문으로 포함되어 있다. AWS Secrets Manager 사용을 권장한다.

> **[Phase 3 피드백 반영] DB 비밀번호 평문 노출 - Secrets Manager 이관 권장**:
> ECS Task Definition과 Lambda 환경 변수에 `MONGODB_URI`가 평문으로 포함되어 있으며, 이 URI에 DocumentDB 자격증명(dmillion:비밀번호)이 포함되어 있다. AWS 콘솔, CLI, CloudTrail 로그 등에서 이 값이 노출될 수 있다. 또한 `application.yml` prod 프로파일에도 비밀번호가 하드코딩되어 Git 저장소에 비밀 키가 노출된 상태이다.
> - **권장 조치**: AWS Secrets Manager 또는 SSM Parameter Store(SecureString)를 사용하여 DB 자격증명을 관리하고, ECS Task Definition에서는 `valueFrom`으로 Secrets Manager ARN을 참조하도록 변경해야 한다. JWT Secret도 동일하게 Secrets Manager로 관리할 것을 권장한다.

> **[Phase 3 피드백 반영] ALB 직접 접근 가능 - SG 제한 권장**:
> ALB가 internet-facing으로 구성되어 있고 Security Group(`finance-alb-sg`)에서 `0.0.0.0/0`으로 80/443을 허용하고 있어, CloudFront를 거치지 않고 ALB DNS(`finance-alb-1506892035.ap-northeast-2.elb.amazonaws.com`)로 직접 접근이 가능하다. 이 경우 CloudFront WAF가 우회되어 보안 위협에 노출된다.
> - **권장 조치**: ALB SG의 Inbound를 CloudFront의 Managed Prefix List(`com.amazonaws.global.cloudfront.origin-facing`)로 제한하거나, ALB에 커스텀 헤더 검증을 추가하여 CloudFront 경유 요청만 허용해야 한다.

---

## 9. 모니터링 및 로깅

### 9.1 CloudWatch Logs

| Log Group | 소스 | 설명 |
|-----------|------|------|
| `/ecs/finance-backend-task` | ECS Fargate | Spring Boot 애플리케이션 로그 (Stream Prefix: `ecs`) |
| `/aws/lambda/ExcelCoordinator` | Lambda | Excel 처리 Coordinator 로그 |
| `/aws/lambda/ExcelWorker` | Lambda | Excel 처리 Worker 로그 |
| DocumentDB audit log | DocumentDB | 감사 로그 |
| DocumentDB profiler log | DocumentDB | 프로파일러 로그 |

### 9.2 Health Check 구성

**ECS Container Health Check**

| 항목 | 값 |
|------|-----|
| Endpoint | `http://localhost:8080/actuator/health` |
| 방식 | `wget --no-verbose --tries=1 --spider` |
| Interval | 30초 |
| Timeout | 10초 |
| Retries | 3 |
| Start Period | 120초 (JVM 워밍업 대기) |

**ALB Target Group Health Check**

| 항목 | 값 |
|------|-----|
| Path | `/actuator/health` |
| Interval | 30초 |
| Healthy Threshold | 2 |
| Unhealthy Threshold | 2 |

> Spring Boot Actuator의 `/actuator/health` 엔드포인트를 ECS 컨테이너 레벨과 ALB Target Group 레벨 모두에서 사용하여 이중 Health Check를 구성하고 있다.

### 9.3 DocumentDB 모니터링

| 항목 | 설정 |
|------|------|
| Performance Insights | 활성화 |
| CloudWatch Logs 내보내기 | audit, profiler |

---

## 10. 네트워크 트래픽 흐름도

### 10.1 프론트엔드 정적 파일 요청 흐름

```
[사용자 브라우저]
    |
    | HTTPS 요청: d3ipfpkjg02npk.cloudfront.net
    v
+-----------------------------------------------+
| CloudFront Edge Location                       |
| Distribution: E2WSY238E3ZG9N                   |
| WAF 검사 → 캐시 확인                            |
+-----------------------------------------------+
    |
    | Cache HIT → 즉시 응답
    | Cache MISS ↓
    v
+-----------------------------------------------+
| S3 Static Website Hosting                      |
| lgcns-finance-frontend-app                     |
| .s3-website.ap-northeast-2.amazonaws.com       |
+-----------------------------------------------+
    |
    | index.html, JS/CSS/이미지 반환
    v
[사용자 브라우저에 React SPA 로드]
```

### 10.2 API 요청 흐름 (동기)

```
[사용자 브라우저]
    |
    | HTTPS 요청: d3ipfpkjg02npk.cloudfront.net/api/*
    v
+-----------------------------------------------+
| CloudFront Edge Location                       |
| Cache Behavior: /api/* → ALB Origin            |
| 허용 Method: GET,HEAD,OPTIONS,PUT,POST,         |
|              PATCH,DELETE                       |
+-----------------------------------------------+
    |
    | HTTP 요청 전달
    v
+-----------------------------------------------+
| ALB (finance-alb)                              |
| Public Subnet (2a, 2c)                         |
| finance-alb-sg: TCP 80,443 ← 0.0.0.0/0       |
+-----------------------------------------------+
    |
    | HTTP:8080 (Target Group: finance-backend-tg)
    | Target Type: IP (라운드 로빈)
    v
+-----------------------------------------------+
| ECS Fargate Task (finance-api)                 |
| Private Subnet (2a 또는 2c)                     |
| finance-ecs-sg: TCP 8080 ← finance-alb-sg     |
| Spring Boot (Java 21, 2vCPU/4GB)              |
+-----------------------------------------------+
    |            |            |
    | TCP 27017  | TCP 6379   | HTTPS (AWS SDK)
    v            v            v
+----------+ +--------+ +-----------+
|DocumentDB| | Redis  | | S3 / SQS  |
|Private   | |Private | | (via NAT  |
|Subnet 2c | |Sub. 2c | |  Gateway) |
+----------+ +--------+ +-----------+
```

### 10.3 Excel 비동기 처리 전체 흐름

```
[사용자]
    |
    | (1) POST /api/excel/upload
    v
+-------------------+     (2) PutObject      +---------------------+
| ECS Fargate       |----------------------->| S3                  |
| (finance-api)     |                        | finance-excel-      |
|                   |     (3) SendMessage     | uploads             |
|                   |---+                    +---------------------+
+-------------------+   |
                        v
              +---------------------+
              | SQS                  |
              | finance-excel-       |
              | processing-queue     |
              | VT: 30분             |
              +---------------------+
                        |
                        | (4) SQS Trigger
                        v
              +---------------------+
              | Lambda               |
              | ExcelCoordinator     |
              | (Java 21, 1024MB)    |
              | Private Subnet       |
              +---------------------+
                        |
                        | (5) Invoke
                        v
              +---------------------+
              | Lambda               |
              | ExcelWorker          |     (6) GetObject     +--------+
              | (Java 21, 1024MB)    |--------------------->| S3     |
              | BATCH_SIZE: 20000    |                      +--------+
              +---------------------+
                   |           |
                   |           | (7) 처리 상태 저장
                   |           v
                   |     +----------+
                   |     | Redis    |
                   |     +----------+
                   |
                   | (8) 데이터 저장
                   v
              +----------+
              |DocumentDB |
              +----------+

실패 경로:
              +---------------------+      3회 실패      +------------------+
              | Processing Queue    |-------------------->| DLQ              |
              |                     |                     | 보존: 14일        |
              +---------------------+                     +------------------+
```

### 10.4 관리자 접근 흐름 (Bastion)

```
[관리자 PC: 61.36.232.75]
    |
    | SSH (TCP 22)
    v
+------------------------+
| Bastion Host           |
| bastion-db (t2.micro)  |
| Public Subnet 1a       |
| finance-bastion-sg     |
+------------------------+
    |
    | SSH Tunnel / 직접 접근
    | TCP 22 (finance-private-sg)
    | TCP 27017 (DocumentDB)
    v
+------------------------+
| Private Subnet 리소스   |
| - DocumentDB           |
| - Redis                |
+------------------------+
```

---

## 부록: 자원 종합 요약표

| 서비스 | 자원명 | 스펙 | 수량 | AZ |
|--------|--------|------|------|----|
| ECS Fargate | finance-api Task | 2 vCPU / 4 GB | 2 | 2a, 2c |
| DocumentDB | finance-docdb-cluster | db.r8g.large | 1 | 2c |
| ElastiCache | finance-redis-cluster | cache.t4g.small | 1 | 2c |
| Lambda | ExcelCoordinator | 1024 MB / 15분 | 1 | 2a, 2c (VPC) |
| Lambda | ExcelWorker | 1024 MB / 15분 | 1 | 2a, 2c (VPC) |
| Lambda | AccountAnalysisHandler | 1024 MB / 15분 (예상) | **미배포** | - |
| EC2 | bastion-db | t2.micro | 1 | 2a |
| ALB | finance-alb | internet-facing | 1 | 2a, 2c |
| CloudFront | E2WSY238E3ZG9N | PriceClass_All | 1 | Global |
| S3 | finance-excel-uploads | - | 1 | ap-northeast-2 |
| S3 | lgcns-finance-frontend-app | Static Website | 1 | ap-northeast-2 |
| SQS | processing-queue | VT: 30분 | 1 | ap-northeast-2 |
| SQS | processing-dlq | 보존: 14일 | 1 | ap-northeast-2 |
| ECR | finance-backend | Scan on Push | 1 | ap-northeast-2 |
| NAT Gateway | finance-nat-gw | Zonal (Public) | 1 | 2a |
