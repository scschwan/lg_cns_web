# AWS 비용 절감 — 세션 기록

> **작업일**: 2026-08-11
> **대상**: LG CNS Finance Tool (AWS 계정 `659002796326`, `ap-northeast-2`)
> **상태**: 계획 확정, **결재 대기**. 스크립트 준비 완료(미실행)

---

## 1. 세션 개요

26년 AWS 비용이 과다하다는 문제 제기로 시작해, 실측 분석 → 개선안 설계 → 결재 문서 작성 → 실행 스크립트 준비까지 수행했다.

**핵심 결론**: 서비스는 상시 가동을 유지하고 **유휴 리소스만 정리한다.** 월 $589 → $422 (28% 절감, 연 약 $2,007), 공수 1.5일, **이용자 영향 사실상 없음.**

---

## 2. 분석 결과 (전량 실측)

모든 수치는 AWS Cost Explorer 및 CloudWatch API 직접 조회값이다.

### 2.1 비용 현황

| 1월 | 2월 | 3월 | 4월 | 5월 | 6월 | 7월 |
|---:|---:|---:|---:|---:|---:|---:|
| $334 | $520 | $769 | $575 | $590 | $570 | **$589** |

3월 급증은 DocumentDB 실험 인스턴스 미삭제 건(4월 정리됨). 이후 월 $570~590 고착, 연환산 $7,069.

### 2.2 결정적 실측치

| 항목 | 값 | 시사점 |
|---|---|---|
| ALB 정상 응답(2XX) 30일 | **356건** (하루 12건) | 실사용 극소 |
| ALB 4XX 30일 | 146,743건 (99.7%) | 봇·스캐너. **전부 4XX** |
| 실사용일 (60일) | **8일** | |
| 사용 시간대 | **새벽 2시 / 저녁 7시** | 스케줄 가동 부적합, 대기 부담 큼 |
| Fargate CPU | 평균 **0.13%** / 최대 52% | 이중화 실익 없음 |
| Fargate 메모리 | 9.3% (약 372MB) | |
| DocDB CPU (6개월) | 평균 8.3% / **최대 100%** | **사양 축소 불가** |
| DocDB 연결 | 평균 12 / **최대 287** | |
| DocDB 버퍼캐시 적중률 | 평상시 **99.999%** / 재기동 후 **6.28%** | 정지 시 성능 저하 근거 |
| ElastiCache 메모리 | **0.88%** (1.37GB 중 12MB) | micro 로 충분 |
| NAT 데이터 처리 | 778MB/월 = **$0.035** | 요금의 **97%가 유휴 시간 요금** |
| NAT 수신 (재기동일) | **292~302MB** | = ECR 이미지 155MB × 2대 |
| CloudFront 요청 30일 | 1,906건 | 봇은 ALB 직접 스캔 |
| Spring Boot 기동 | **17~23초** | startPeriod 120초는 과보수 |
| Lambda 호출 7월 | 10회 | |

### 2.3 분석 중 발견한 문제

| # | 문제 | 심각도 |
|:-:|---|---|
| 1 | **JWT 서명 키가 프로덕션에서 소스의 기본값** — `application.yml:40`은 `${JWT_SECRET:기본값}`인데 task-def에 `JWT_SECRET`이 없음. **관리자 권한 토큰 위조 가능** | 최상 |
| 2 | AWS 액세스 키·DocDB 비밀번호 평문 커밋 (`Finance Tool AWS 인프라 정보.txt:3-4` 등 4곳) | 상 |
| 3 | 진행률 로컬 Map 4개 — `ClusteringService.java:615/618/621`, `DashboardGenerationService.java:50`. **desired=2인 현재도 재현되는 버그** (폴링이 다른 태스크로 가면 `NOT_FOUND`) | 중 |
| 4 | `DashboardGenerationService.java:55` daemon 스레드 — SIGTERM에 즉사 | 중 |

---

## 3. 의사결정 이력

논의 과정에서 안이 여러 차례 바뀌었다. 판단 근거를 남긴다.

| 순서 | 검토안 | 월 비용 | 왜 바뀌었나 |
|:-:|---|---:|---|
| 1 | **B안** 전체 온디맨드 (DB 포함) | $111 (81%) | 초기 설계. 대기 7~13분 |
| 2 | **C안** 앱만 온디맨드 + 선기동 | $343 (42%) | 사용자 지적 — DB 재기동이 최대 불편 요인. 실측상 사용 시간이 **새벽·저녁**이라 장시간 대기 부담이 큼 |
| 3 | **D안** C안 + 로그인 Lambda | $343 (42%) | 대기를 0에 수렴시키는 안. 공수 +2.5일 |
| 4 | **A안** 온디맨드 전면 제외 | **$422 (28%)** | **최종 확정.** 온디맨드는 신규 구성요소(기동 트리거·유휴 판정·자동 정지·작업 보호)가 너무 많고, 각각이 새 장애 지점. 하루 12건 쓰는 시스템에 과한 기계장치 |

### 검토했으나 폐기한 것

| 항목 | 폐기 사유 |
|---|---|
| DocumentDB 사양 축소 | CPU 최대 100%, 연결 287. 100MB 엑셀 처리 실패 위험 |
| EC2 self-hosted MongoDB 이전 | 월 $3 차이인데 3.5~4.5 인일 소요. EBS가 정지 중에도 과금되어 이점 상쇄 |
| 마이크로서비스 분리 | Java 173개 파일, service 19,522 LOC. 최소 2~3주 |
| 스케줄 기반 가동 (업무시간만) | 실사용이 새벽 2시·저녁 7시라 시간을 놓침 |
| 예약 인스턴스(RI)/Savings Plans | 적용 시 월 약 $320(46%)로 매력적이나 **1년 약정 중도 해지 불가**. 서비스 존속 미확정으로 보류 |

### 검증된 사실 (재검토 시 활용)

- **DocumentDB stop/start API는 실재한다.** 서버리스 상품은 없으나 명시적 호출은 가능. 전제 조건(`available`, 글로벌 아님, Elastic 아님) 충족. 단 **7일 후 자동 재시작**되며 AWS는 개발·검증 환경 용도로 안내.
- **정지 중 인스턴스 요금은 0**이고 스토리지·백업만 약 $4.6/월 (AWS 정책 기준, 본 계정 실증 없음).
- **봇은 CloudFront가 아니라 ALB를 직접 스캔한다** → React 로드 시 자동 기동 트리거가 안전했음.
- **유휴 판정은 백엔드 코드 없이 가능하다** — 봇이 전부 4XX라 `HTTPCode_Target_2XX_Count`만 보면 자동 배제.
- **DocumentDB RI는 CLI로 조회되지 않는다** — `ProductDescription`에 `docdb`가 없고 r8g/r7g/r6g/r5 전 클래스 offering 0건. 콘솔 확인 필요.

---

## 4. 최종 확정안 (A안)

| # | 조치 | 절감/월 | 상태 |
|:-:|---|---:|---|
| 1 | ECS 태스크 2대 → **1대** (상시 유지) | $84.5 | 대기 |
| 2 | NAT Gateway 제거 | $34.7 | 대기 (선행 조치 필요) |
| 3 | ElastiCache `t4g.small` → `t4g.micro` | $17.5 | 대기 |
| 4 | EIP 반납 (NAT용 1개) | $3.6 | 대기 |
| 5 | EC2 bastion 삭제 | $10.7 | ✅ **완료** (사용자 수행) |
| 6 | S3 Gateway Endpoint 생성 | $0 | ✅ **완료** (`vpce-0fdf46f2c2ce0a2b9`) |
| 7 | 보안 조치 (JWT·자격증명) | — | 대기 |

**결과**: $589.05 → $421.84 (28% 절감, 연 약 $2,007), 공수 1.5일

**이용자 영향**: 장애 시 복구 1~2분 증가가 **유일**. 전환 중 재로그인 1회 발생(회피 불가).

---

## 5. 산출물

```
service_diet/
├─ plan.md                                   전체 계획 (요약 + 본문 + 부록 A/B)
├─ 아키텍처.md                                상세 설계 (구현 + 부록: 온디맨드/진행률)
├─ session.md                                이 문서
├─ build_aws_docs.py                         docx 생성 스크립트
├─ AWS_비용절감_개선보고서_20260811.docx      결재 첨부용 (표 21개)
├─ AWS_비용절감_기안서_20260811.docx          결재 상신용
└─ scripts/
   ├─ 00-status.ps1                          상태 점검 (읽기 전용)
   ├─ 01-step1-scale-and-cache.ps1           1단계: ECS 축소 + 캐시 교체
   ├─ 02-step2-secrets.ps1                   2단계: 보안 조치
   ├─ 03-step3-nat-removal.ps1               3단계: NAT 제거
   └─ 99-rollback.ps1                        단계별 롤백
```

---

## 6. 왜 Terraform이 아니라 CLI 스크립트인가

Terraform 도입을 검토했으나 **이번 작업에는 CLI 스크립트가 적합하다.**

| 판단 근거 | 내용 |
|---|---|
| 기존 IaC 부재 | 저장소에 `.tf`, CloudFormation, CDK가 **전무**하다. 모든 리소스가 콘솔·CLI로 생성됐다 |
| import 비용 | Terraform으로 관리하려면 VPC·서브넷·라우팅·ECS·DocDB·ElastiCache·ALB·Lambda·IAM 등 **수십 개 리소스를 import**해야 한다. 그 자체가 수 일 작업이며 state 백엔드(S3+DynamoDB lock)도 새로 구성해야 한다 |
| 작업 성격 | 이번 조치는 **일회성 3건**(1.5일)이다. 반복 실행되거나 환경이 복제되지 않는다 |
| 기존 관례 | 배포가 `backend/deploy.ps1` 등 PowerShell + AWS CLI로 이뤄진다. CLAUDE.md 3.1의 "기존 스타일을 그대로 따름" 원칙에 부합 |
| 상태 불일치 위험 | 콘솔로 만든 리소스를 부분적으로만 Terraform에 넣으면 **드리프트가 상시 발생**한다 |

> **향후 IaC 도입 시**: 이번 조치가 끝난 뒤 안정된 상태를 기준선으로 삼아 `terraform import`를 일괄 수행하는 것이 낫다. 지금처럼 구성이 바뀌는 도중에 도입하면 import 대상이 계속 움직인다.

---

## 7. 스크립트 사용법

> **모든 스크립트는 준비만 되어 있고 실행하지 않았다.** 결재 승인 후 진행한다.
> 각 스크립트는 `-DryRun` 플래그를 지원한다. **반드시 DryRun으로 먼저 확인할 것.**

```powershell
cd service_diet\scripts

# 0. 실행 전 상태 스냅샷
.\00-status.ps1

# 1단계 (1시간, 월 $110 절감)
.\01-step1-scale-and-cache.ps1 -Phase A -DryRun   # ECS 2→1 확인
.\01-step1-scale-and-cache.ps1 -Phase A           # 실행
.\01-step1-scale-and-cache.ps1 -Phase B           # Redis micro 생성 (5~10분 대기)
.\01-step1-scale-and-cache.ps1 -Phase C -DryRun   # REDIS_HOST 교체 확인
.\01-step1-scale-and-cache.ps1 -Phase C           # 실행 + 수동 작업 안내

# 2단계 (1일) — 비사용일에 수행
.\02-step2-secrets.ps1 -Phase A                   # JWT 키 생성
.\02-step2-secrets.ps1 -Phase B                   # DocDB 비밀번호 교체
.\02-step2-secrets.ps1 -Phase C                   # IAM 권한
.\02-step2-secrets.ps1 -Phase D                   # Lambda 환경변수

# 3단계 (0.5일)
.\03-step3-nat-removal.ps1 -Phase A               # SQS Endpoint 생성
.\03-step3-nat-removal.ps1 -Phase B               # ECS 퍼블릭 서브넷 이동
.\03-step3-nat-removal.ps1 -Phase C               # 검증 (필수)
.\03-step3-nat-removal.ps1 -Phase D               # NAT 삭제 + EIP 반납

# 롤백
.\99-rollback.ps1 -Step 1
```

### 스크립트에 넣은 안전장치

| 장치 | 내용 |
|---|---|
| **Lambda 환경변수 병합** | `update-function-configuration`은 환경변수를 **전체 교체**한다. `REDIS_HOST`만 지정하면 `MONGODB_URI`·`SQS_QUEUE_URL` 등이 삭제된다. 기존 값을 읽어 병합 후 전달하며, 백업 파일을 남긴다 |
| **SG 사전 검증** | 3-B에서 ECS SG에 `0.0.0.0/0` 인바운드가 있으면 **중단**한다. 퍼블릭 서브넷 이동 시 외부 노출을 막기 위함 |
| **NAT 삭제 게이트** | 3-C에서 재배포 후 `BytesOutToSource`가 0인지 확인하는 단계를 분리했다. 통과 전에는 3-D를 실행하지 않는다 |
| **EIP allocation 사전 확보** | NAT 삭제 후에는 조회가 불가하므로 삭제 전에 `AllocationId`를 확보한다 |
| **DryRun** | 전 스크립트 지원 |

### 스크립트 검증 결과

| 항목 | 결과 |
|---|---|
| PowerShell 파서 구문 검증 | **5개 파일 전부 통과** |
| `01 -Phase A -DryRun` | 정상 — 현재 상태(Desired 2/Running 2) 출력 후 실행될 명령만 표시 |
| `03 -Phase B -DryRun` | 정상 — **SG 안전검증 통과**(ALB SG 단일 규칙 확인), 변경 전후 네트워크 구성 출력 |

> ⚠️ **인코딩 주의**: 스크립트는 **UTF-8 BOM**으로 저장해야 한다. Windows PowerShell 5.1은 BOM 없는 UTF-8을 시스템 ANSI(CP949)로 읽어 한글 주석이 깨지고, 그 결과 **파서가 구문 오류를 낸다.** 실제로 처음 작성 시 BOM이 없어 5개 파일 중 4개가 파싱에 실패했다. 편집 후에는 아래로 BOM을 복구할 것.
>
> ```powershell
> $utf8Bom = New-Object System.Text.UTF8Encoding $true
> Get-ChildItem *.ps1 | ForEach-Object {
>     $c = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
>     [System.IO.File]::WriteAllText($_.FullName, $c, $utf8Bom)
> }
> ```
>
> 같은 이유로 스크립트 내에서 **백틱(`` ` ``) 줄 연속과 `Invoke-Expression`을 쓰지 않았다.** 백틱 뒤 공백 한 칸에도 파싱이 깨지고, `Invoke-Expression`은 따옴표 중첩 시 예측이 어렵다. AWS CLI 호출은 한 줄로 직접 실행하고, 긴 쿼리는 변수에 담았다.

### 스크립트로 자동화하지 않은 작업 (수동)

| 작업 | 파일 | 이유 |
|---|---|---|
| `stopTimeout: 120` 추가, `startPeriod` 120→45 | `backend/task-def-template.json` | JSON 구조 편집이라 수동이 안전 |
| `server.shutdown: graceful` | `backend/src/main/resources/application.yml` | 동일 |
| `setDaemon(true)` → `false` | `DashboardGenerationService.java:55` | 코드 수정 |
| `secrets` 블록 추가 | `backend/task-def-template.json` | 2단계에서 안내 출력 |
| AWS 액세스 키 폐기 | IAM 콘솔 | 콘솔 작업 |
| 재배포 | `backend/deploy.ps1` | 기존 스크립트 사용 |

---

## 8. 다음 단계

1. **결재 상신** — 개선보고서·기안서 첨부. 기안 부서·기안자·담당 조직·착수일 기입 필요 (현재 플레이스홀더)
2. **승인 후 1단계 실행** — 1시간, 월 $110 절감. 비사용일 권장
3. 2·3단계 순차 진행
4. 전환 후 1개월간 주 1회 Cost Explorer 확인

### 실행 전 확정 필요 사항

| # | 항목 | 확인 방법 |
|---|---|---|
| 1 | ALB idle timeout ≥ 360초 여부 | `describe-load-balancer-attributes`. 기본 60초면 `ClusteringService.java:697-711`의 6분 동기 병합이 **이미** 깨져 있을 수 있음 |
| 2 | `ExcelWorker`가 DocDB를 직접 쓰는지 | `ExcelWorkerHandler.java` 정독 |

### 별도 과제 (비용 무관)

| 항목 | 비고 |
|---|---|
| 진행률 로컬 Map 4개 → Redis 이관 | 1단계로 태스크가 1대가 되면 **증상은 자연 해소**되나 근본 수정 필요. 설계는 `아키텍처.md` 부록 B에 보존 |
| ECR lifecycle policy | 이미지 678개 누적. 레이어 공유로 실제 과금 $1.69/월이고 삭제는 비가역이라 보류 |

---

## 9. 주요 리소스 식별자

| 구분 | 값 |
|---|---|
| ECS | 클러스터 `finance-cluster` / 서비스 `finance-api` / task `finance-backend-task` |
| VPC | `vpc-041b862a78f98462a` |
| 퍼블릭 서브넷 | `subnet-0439ae6345851cb05` (1a, 10.0.1.0/24), `subnet-0d871ae82bab584e3` (1c, 10.0.4.0/24) |
| 프라이빗 서브넷 | `subnet-0bfa6431b2de4c627` (1a, 10.0.2.0/24), `subnet-08cdb7f10fd2f72f4` (1c, 10.0.5.0/24) |
| 라우팅 | 퍼블릭 `rtb-016ffa2a43b7f179b` (IGW) / 프라이빗 `rtb-021492a36dbdbfb3b` (NAT) |
| NAT | `nat-0b5fb65fc5616331d` |
| VPC 엔드포인트 | S3 Gateway `vpce-0fdf46f2c2ce0a2b9` (생성 완료) |
| 보안그룹 | ECS `sg-0b2f80b067408e320` / ALB `sg-03100bb81c51586d0` / Redis `sg-02b0bb92322a14665` / Lambda `sg-03f87eab294fd8eb8` |
| DocumentDB | `finance-docdb-cluster` (`db.r8g.large`, Single-AZ, 볼륨 14.6GB) |
| ElastiCache | `finance-redis-cluster` (`cache.t4g.small`, 서브넷그룹 `finance-redis-cluster-subnet`) |
| ALB | `finance-alb` / 타겟그룹 `finance-backend-tg` / dim `app/finance-alb/5a5c949d21c4e42a` |
| CloudFront | `E2WSY238E3ZG9N` (`d3ipfpkjg02npk.cloudfront.net`) |
| S3 | `lgcns-finance-frontend-app` (프론트) / `finance-excel-uploads` (엑셀) |
| Lambda | `ExcelCoordinator`, `ExcelWorker` (java21, 1024MB, 900s, VPC 내부) |
| IAM | 실행역할 `finance-ecs-task-execution-role` / 태스크역할 `finance-ecs-task-role` |

---

## 10. 기록

- git 커밋은 사용자 지시에 따라 수행하지 않았다. `service_diet/`는 untracked 상태이며, 현재 브랜치는 `fix/maintenance-2026-04-23`(이전 세션 브랜치)다.
- 실행 계획상 브랜치는 `fix/aws-cost-2026-08`을 신규 생성할 것을 권장한다 (CLAUDE.md 2.1 세션 단일 브랜치 원칙).
- 이번 세션에서 실제로 변경한 AWS 리소스는 **S3 Gateway Endpoint 생성 1건**뿐이다(무료·무위험, NAT 제거 선행작업). 그 외는 모두 읽기 전용 조회였다.
