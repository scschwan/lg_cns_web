# AWS 자원 분석 결과

> **분석일**: 2026-03-19
> **리전**: ap-northeast-2 (서울)
> **계정**: 659002796326 (admin-user)

---

## 1. VPC 네트워크 구성

### 1.1 VPC
| 항목 | 값 |
|------|-----|
| VPC Name | finance-vpc |
| VPC ID | vpc-041b862a78f98462a |
| CIDR | 10.0.0.0/16 |

### 1.2 Subnet 구성

| Subnet Name | Subnet ID | CIDR | AZ | 유형 |
|-------------|-----------|------|----|------|
| finance-public-subnet-1a | subnet-0439ae6345851cb05 | 10.0.1.0/24 | ap-northeast-2a | Public |
| finance-public-subnet-1c | subnet-0d871ae82bab584e3 | 10.0.4.0/24 | ap-northeast-2c | Public |
| finance-private-subnet-1a | subnet-0bfa6431b2de4c627 | 10.0.2.0/24 | ap-northeast-2a | Private |
| finance-private-subnet-1c | subnet-08cdb7f10fd2f72f4 | 10.0.5.0/24 | ap-northeast-2c | Private |

### 1.3 Internet Gateway
| 항목 | 값 |
|------|-----|
| Name | finance-igw |
| ID | igw-03f465e4dce4f88dd |
| 연결 VPC | vpc-041b862a78f98462a |

### 1.4 NAT Gateway
| 항목 | 값 |
|------|-----|
| Name | finance-nat-gw |
| ID | nat-0b5fb65fc5616331d |
| 위치 | finance-public-subnet-1a (10.0.1.15) |
| Public IP | 3.39.210.48 |
| 유형 | public (Zonal) |

### 1.5 Route Table

**finance-public-rt** (rtb-016ffa2a43b7f179b)
| Destination | Target | 연결 Subnet |
|-------------|--------|-------------|
| 10.0.0.0/16 | local | finance-public-subnet-1a, finance-public-subnet-1c |
| 0.0.0.0/0 | igw-03f465e4dce4f88dd (IGW) | |

**finance-private-rt** (rtb-021492a36dbdbfb3b) — Main Route Table
| Destination | Target | 연결 Subnet |
|-------------|--------|-------------|
| 10.0.0.0/16 | local | finance-private-subnet-1a, finance-private-subnet-1c |
| 0.0.0.0/0 | nat-0b5fb65fc5616331d (NAT GW) | |

### 1.6 Security Groups

| SG Name | SG ID | 용도 | Inbound 규칙 |
|---------|-------|------|-------------|
| finance-alb-sg | sg-03100bb81c51586d0 | ALB | TCP 80, 443 ← 0.0.0.0/0 |
| finance-ecs-sg | sg-0b2f80b067408e320 | ECS Task | TCP 8080 ← finance-alb-sg |
| finance-docdb-sg | sg-075dc2556c04c1d72 | DocumentDB | TCP 27017 ← finance-ecs-sg, 10.0.0.0/16 |
| finance-redis-sg | sg-02b0bb92322a14665 | Redis | TCP 6379 ← finance-ecs-sg, finance-lambda-sg, 10.0.0.0/16 |
| finance-lambda-sg | sg-03f87eab294fd8eb8 | Lambda | 없음 (Outbound만) |
| finance-bastion-sg | sg-023b749d4e88b2f44 | Bastion SSH | TCP 22 ← 61.36.232.75/32 |
| finance-private-sg | sg-0cc2365c9de779e15 | Private 인스턴스 | TCP 22 ← finance-bastion-sg, ICMP ← 10.0.0.0/16 |

---

## 2. 컴퓨팅 (ECS Fargate)

### 2.1 ECS Cluster
| 항목 | 값 |
|------|-----|
| Cluster Name | finance-cluster |
| 상태 | ACTIVE |
| Capacity Provider | FARGATE, FARGATE_SPOT |
| Running Tasks | 2 |
| Active Services | 1 |

### 2.2 ECS Service
| 항목 | 값 |
|------|-----|
| Service Name | finance-api |
| Task Definition | finance-backend-task:257 |
| Desired Count | 2 |
| Running Count | 2 |
| Platform | Fargate 1.4.0 (Linux) |
| Deployment 전략 | ROLLING (min 100%, max 200%) |
| Circuit Breaker | 활성화 (rollback 포함) |

### 2.3 Task Definition (finance-backend-task:257)
| 항목 | 값 |
|------|-----|
| CPU | 2048 (2 vCPU) |
| Memory | 4096 MB (4 GB) |
| 아키텍처 | X86_64 |
| 네트워크 모드 | awsvpc |
| 컨테이너 이미지 | 659002796326.dkr.ecr.ap-northeast-2.amazonaws.com/finance-backend:v1.1.306 |
| 컨테이너 포트 | 8080 |
| Task Role | finance-ecs-task-role |
| Execution Role | finance-ecs-task-execution-role |

**환경 변수**:
| Key | Value |
|-----|-------|
| SPRING_PROFILES_ACTIVE | prod |
| AWS_REGION | ap-northeast-2 |
| AWS_ACCOUNT_ID | 659002796326 |
| MONGODB_URI | mongodb://dmillion:***@finance-docdb-cluster.cluster-(...).docdb.amazonaws.com:27017/... |
| REDIS_HOST | finance-redis-cluster.1kdayr.0001.apn2.cache.amazonaws.com |
| REDIS_PORT | 6379 |
| S3_BUCKET | finance-excel-uploads |

**Health Check**:
| 항목 | 값 |
|------|-----|
| Command | `wget --spider http://localhost:8080/actuator/health` |
| Interval | 30초 |
| Timeout | 10초 |
| Retries | 3 |
| Start Period | 120초 |

**로그 설정**:
| 항목 | 값 |
|------|-----|
| Log Driver | awslogs |
| Log Group | /ecs/finance-backend-task |
| Stream Prefix | ecs |

### 2.4 EC2 인스턴스 (Bastion)
| 항목 | 값 |
|------|-----|
| Name | bastion-db |
| Instance ID | i-0212c70574aad3c10 |
| Type | t2.micro |
| State | running |
| Subnet | finance-public-subnet-1a |
| SG | launch-wizard-1 (SSH 61.36.232.75/32) |

---

## 3. 로드밸런서 (ALB)

### 3.1 Application Load Balancer
| 항목 | 값 |
|------|-----|
| Name | finance-alb |
| DNS | finance-alb-1506892035.ap-northeast-2.elb.amazonaws.com |
| Scheme | internet-facing |
| Type | application |
| AZ | ap-northeast-2a, ap-northeast-2c |
| Subnet | finance-public-subnet-1a, finance-public-subnet-1c |
| SG | finance-alb-sg |

### 3.2 Target Group
| 항목 | 값 |
|------|-----|
| Name | finance-backend-tg |
| Protocol | HTTP |
| Port | 8080 |
| Target Type | IP |
| Health Check Path | /actuator/health |
| Health Check Interval | 30초 |
| Healthy Threshold | 2 |
| Unhealthy Threshold | 2 |

---

## 4. CDN (CloudFront)

| 항목 | 값 |
|------|-----|
| Distribution ID | E2WSY238E3ZG9N |
| Domain | d3ipfpkjg02npk.cloudfront.net |
| 상태 | Deployed |
| HTTP 버전 | HTTP/2 |
| SSL | CloudFront 기본 인증서 (redirect-to-https) |
| WAF | 활성화 (CreatedByCloudFront WAF ACL) |
| Price Class | PriceClass_All |

**Origin 구성**:
| Origin | 도메인 | 용도 |
|--------|--------|------|
| Default | lgcns-finance-frontend-app.s3-website.ap-northeast-2.amazonaws.com | 프론트엔드 정적 파일 |
| /api/* | finance-alb-1506892035.ap-northeast-2.elb.amazonaws.com | 백엔드 API 프록시 |

**Cache Behavior**:
| 패턴 | Origin | 허용 Method | 비고 |
|------|--------|-------------|------|
| Default (*) | S3 (Frontend) | GET, HEAD, OPTIONS | 프론트엔드 |
| /api/* | ALB (Backend) | GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE | API 요청 전체 전달 |

---

## 5. 데이터베이스 (DocumentDB)

### 5.1 Cluster
| 항목 | 값 |
|------|-----|
| Cluster ID | finance-docdb-cluster |
| Engine | Amazon DocumentDB 5.0.0 |
| 상태 | available |
| Endpoint (Writer) | finance-docdb-cluster.cluster-c1ue6aayyxjn.ap-northeast-2.docdb.amazonaws.com:27017 |
| Endpoint (Reader) | finance-docdb-cluster.cluster-ro-c1ue6aayyxjn.ap-northeast-2.docdb.amazonaws.com:27017 |
| Master User | dmillion |
| Multi-AZ | No |
| 암호화 | KMS 암호화 활성화 |
| 백업 보존 | 7일 |
| CloudWatch Logs | audit, profiler |
| 삭제 보호 | 활성화 |
| Parameter Group | finance-docdb-no-tls (TLS 비활성화) |

### 5.2 Instance
| 항목 | 값 |
|------|-----|
| Instance ID | finance-docdb-cluster |
| Instance Class | db.r8g.large |
| AZ | ap-northeast-2c |
| Public Access | No |
| Performance Insights | 활성화 |
| Subnet Group | finance-docdb-subnet-group (private-1a, private-1c) |

---

## 6. 캐시 (ElastiCache Redis)

| 항목 | 값 |
|------|-----|
| Cluster ID | finance-redis-cluster |
| Engine | Redis 7.1.0 |
| Node Type | cache.t4g.small |
| Node 수 | 1 |
| 상태 | available |
| AZ | ap-northeast-2c |
| Endpoint | finance-redis-cluster.1kdayr.0001.apn2.cache.amazonaws.com:6379 |
| Subnet Group | finance-redis-cluster-subnet |
| SG | finance-redis-sg |
| 암호화 (전송 중) | 비활성화 |
| 암호화 (저장 시) | 비활성화 |
| Auth Token | 비활성화 |
| 자동 마이너 버전 업그레이드 | 활성화 |

---

## 7. 스토리지 (S3)

| 버킷 이름 | 생성일 | 용도 |
|-----------|--------|------|
| finance-excel-uploads | 2026-02-09 | Excel 파일 업로드 저장소 |
| lgcns-finance-frontend-app | 2026-03-05 | 프론트엔드 정적 호스팅 (CloudFront Origin) |
| cf-templates-ssav9fgmisl4-ap-northeast-2 | 2025-11-13 | CloudFormation 템플릿 |

---

## 8. 메시지 큐 (SQS)

### 8.1 Processing Queue
| 항목 | 값 |
|------|-----|
| Queue Name | finance-excel-processing-queue |
| ARN | arn:aws:sqs:ap-northeast-2:659002796326:finance-excel-processing-queue |
| Visibility Timeout | 1800초 (30분) |
| Max Message Size | 1 MB |
| Message Retention | 86400초 (1일) |
| DLQ 연결 | finance-excel-processing-dlq (maxReceiveCount: 3) |

### 8.2 Dead Letter Queue (DLQ)
| 항목 | 값 |
|------|-----|
| Queue Name | finance-excel-processing-dlq |
| Visibility Timeout | 300초 (5분) |
| Message Retention | 1209600초 (14일) |
| 현재 메시지 수 | 1 |

---

## 9. 서버리스 (Lambda)

### 9.1 ExcelCoordinator
| 항목 | 값 |
|------|-----|
| Function Name | ExcelCoordinator |
| Runtime | Java 21 |
| Handler | com.example.lambda.coordinator.ExcelCoordinatorHandler::handleRequest |
| Memory | 1024 MB |
| Timeout | 900초 (15분) |
| JVM 옵션 | -Xmx1536m |
| VPC | finance-vpc (private-subnet-1a, private-subnet-1c) |
| SG | finance-lambda-sg |
| Log Group | /aws/lambda/ExcelCoordinator |

### 9.2 ExcelWorker
| 항목 | 값 |
|------|-----|
| Function Name | ExcelWorker |
| Runtime | Java 21 |
| Handler | com.example.lambda.worker.ExcelWorkerHandler::handleRequest |
| Memory | 1024 MB |
| Timeout | 900초 (15분) |
| JVM 옵션 | -Xmx1536m |
| BATCH_SIZE | 20000 |
| VPC | finance-vpc (private-subnet-1a, private-subnet-1c) |
| SG | finance-lambda-sg |
| Log Group | /aws/lambda/ExcelWorker |

**Lambda 공통 환경 변수**:
| Key | Value |
|-----|-------|
| MONGODB_URI | mongodb://dmillion:***@finance-docdb-cluster.cluster-(...) |
| REDIS_HOST | finance-redis-cluster.1kdayr.0001.apn2.cache.amazonaws.com |
| REDIS_PORT | 6379 |
| S3_BUCKET | finance-excel-uploads |
| SQS_QUEUE_URL | https://sqs.ap-northeast-2.amazonaws.com/659002796326/finance-excel-processing-queue |

---

## 10. 컨테이너 레지스트리 (ECR)

| 항목 | 값 |
|------|-----|
| Repository Name | finance-backend |
| URI | 659002796326.dkr.ecr.ap-northeast-2.amazonaws.com/finance-backend |
| 최신 이미지 태그 | v1.1.306 |
| Image Tag Mutability | MUTABLE |
| Scan on Push | 활성화 |
| 암호화 | AES256 |

---

## 11. 자원 요약 및 트래픽 흐름

### 전체 트래픽 흐름
```
사용자 (Browser)
    │
    ▼
CloudFront (d3ipfpkjg02npk.cloudfront.net)
    │
    ├─── /* (Default) ──→ S3 (lgcns-finance-frontend-app) ──→ React SPA
    │
    └─── /api/* ──→ ALB (finance-alb, Public Subnet)
                      │
                      ▼
                   ECS Fargate (finance-api, Private Subnet)
                   [2 Tasks, 2vCPU/4GB each]
                      │
                      ├──→ DocumentDB (finance-docdb-cluster, db.r8g.large)
                      ├──→ ElastiCache Redis (cache.t4g.small)
                      ├──→ S3 (finance-excel-uploads)
                      └──→ SQS (finance-excel-processing-queue)
                              │
                              ▼
                           Lambda (ExcelCoordinator / ExcelWorker)
                              │
                              ├──→ DocumentDB
                              ├──→ Redis
                              └──→ S3
```

### Excel 처리 비동기 흐름
```
ECS (Upload API)
    │
    ├──→ S3에 Excel 파일 업로드
    └──→ SQS에 처리 메시지 전송
            │
            ▼
         ExcelCoordinator (Lambda)
            │
            └──→ ExcelWorker (Lambda, BATCH_SIZE: 20000)
                    │
                    ├──→ S3에서 Excel 읽기
                    ├──→ DocumentDB에 데이터 저장
                    └──→ Redis에 처리 상태 업데이트
```

### 자원 스펙 요약표

| 서비스 | 자원 | 스펙 | 수량 |
|--------|------|------|------|
| ECS Fargate | finance-api Task | 2 vCPU / 4 GB | 2 |
| DocumentDB | finance-docdb-cluster | db.r8g.large | 1 (Single AZ) |
| ElastiCache | finance-redis-cluster | cache.t4g.small | 1 Node |
| Lambda | ExcelCoordinator | 1024 MB / 15분 | 1 |
| Lambda | ExcelWorker | 1024 MB / 15분 | 1 |
| EC2 | bastion-db | t2.micro | 1 |
| ALB | finance-alb | internet-facing | 1 (2 AZ) |
| CloudFront | E2WSY238E3ZG9N | PriceClass_All | 1 |
| S3 | finance-excel-uploads | - | 1 |
| S3 | lgcns-finance-frontend-app | Static Website | 1 |
| SQS | processing-queue + DLQ | - | 2 |
| ECR | finance-backend | - | 1 |
