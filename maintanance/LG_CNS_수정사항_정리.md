# LG CNS 수정사항 정리

> 각 날짜별 유지보수 작업 기록. 최신 작업일이 상단에 위치.

---

## 2026-09-08 Redis 엔드포인트 하드코딩 수정 (브랜치: `fix/aws-cost-step23-2026-09`)

> 1단계의 ElastiCache 축소가 백엔드에 적용되지 않고 있던 것을 사후 발견해 수정.
> 상세: `service_diet/실행기록_2026-09-08.md` 의 "사후 발견" 절

### 1. 증상

구 캐시를 삭제해도 되는지 판단하려고 두 클러스터의 실사용 지표를 비교했는데
**예상과 정반대**였다.

| 클러스터 | 최근 3시간 GetTypeCmds |
|---|---:|
| `finance-redis-cluster` (구) | **547** |
| `finance-redis-micro` (신) | 8 |

계정 내 컴퓨트를 전수 확인했으나(Lambda 2개, ECS 서비스 1개, 실행 중 EC2 0대)
설정상으로는 모두 `REDIS_HOST` 가 micro 였고, task definition 264/265/266 도 정상이었다.

### 2. 원인

| # | 수정사항 | 상세 | 처리 영역 |
|---|---------|------|:-:|
| E-1 | prod 프로파일이 `${REDIS_HOST}` 를 덮어씀 | `application.yml:129` 에 구 클러스터 엔드포인트가 하드코딩. 공통 섹션(21행)은 `${REDIS_HOST:localhost}` 로 올바랐으나 **Spring 은 프로파일 설정이 공통 설정을 이긴다.** 결과적으로 task-def 환경변수 교체(1-C)가 백엔드에 무효였다 | BE |

실제 접속 대상은 **백엔드 = 구 클러스터 / Lambda 2개 = micro** 로 분리돼 있었다.

### 3. 영향

1. **구 클러스터를 삭제했다면 백엔드 Redis 가 즉시 끊겼다.** 1주 존치 관행이 사고를 막았다.
2. 조치 3의 월 $17.5 절감이 미실현일 뿐 아니라, micro 가 순수 추가 비용으로만 붙어
   두 클러스터 요금을 동시에 내고 있었다.
3. 백엔드와 Worker 가 서로 다른 캐시를 보는 상태였다. 계획서가 경고한
   "백엔드만 바꾸면 진행률이 깨진다" 의 정반대 형태로, 잠재 결함이 남아 있었다.

### 4. 조치

- `backend/src/main/resources/application.yml` (prod 프로파일)
  - `host:` 하드코딩 제거 → `${REDIS_HOST:localhost}`
  - `port:` → `${REDIS_PORT:6379}` 로 통일
  - 같은 실수를 막는 의도 주석 추가
- prod 프로파일 전수 재점검 — 다른 하드코딩 없음 (`MONGODB_URI` 는 2단계에서 정리 완료)
- 배포 `v1.1.316` → `v1.1.317`, task definition **revision 267** (무중단)

### 5. 검증

배포 직후 트래픽 패턴이 정확히 뒤집혔다.

```
KeyBasedCmds 1분 단위 (UTC)   06:37  06:38  06:39  06:40  06:41  06:42
finance-redis-micro              6      2      2      2      2      2
finance-redis-cluster            0      0      0      0      0      0
```

백엔드·Lambda 모두 micro 를 사용하며, 구 클러스터는 트래픽 0 으로 삭제 대기 상태다.

### 6. 교훈

**환경변수 교체는 "task-def 에 반영됐다" 로 검증이 끝나지 않는다.**
소스의 프로파일 설정이 덮어쓸 수 있으므로 **대상 리소스의 실사용 지표로 확인**해야 한다.
1단계 당시 `CurrConnections` 는 양쪽 모두 유휴 baseline 이라 판별 불가로 기록하고
넘어갔는데, `GetTypeCmds`/`KeyBasedCmds` 같은 **명령 처리량 지표**를 봤다면
그 시점에 발견할 수 있었다.

### 남은 작업

- 구 캐시 `finance-redis-cluster` 삭제 — 실사용일 하루 관찰 후.
  `aws elasticache delete-cache-cluster --cache-cluster-id finance-redis-cluster`
  이걸 해야 월 $17.5 가 실현된다. 그전까지는 두 클러스터 요금을 모두 낸다.

### 커밋/푸시
- Commit: `dd630e8` fix: prod 프로파일의 Redis 엔드포인트 하드코딩 제거 (v1.1.317)
- Push: 완료

---

## 2026-09-08 AWS 비용절감 2·3단계 (브랜치: `fix/aws-cost-step23-2026-09`)

> 출처: `service_diet/AWS_비용절감_개선보고서_20260811.docx`
> 상세 실행 기록·원복 절차: `service_diet/실행기록_2026-09-08.md`
> 같은 날 1단계에 이어 수행. 사용자가 "운영계 재기동을 감안하지 말고 전부 진행" 지시.

### 1. 2단계 — 보안 조치

| # | 수정사항 | 상세 | 처리 영역 |
|---|---------|------|:-:|
| D-1 | JWT 서명 키가 소스의 기본값 | `application.yml:40` 이 `${JWT_SECRET:기본문자열}` 인데 task-def 에 `JWT_SECRET` 이 없어, 소스에 공개된 문자열로 토큰을 서명 중이었다. 그 값을 아는 사람은 관리자 권한 JWT 위조 가능 | BE/INFRA |
| D-2 | 평문 자격증명 | `task-def-template.json` 과 `application.yml` prod 프로파일에 DocumentDB 비밀번호가 평문으로 있었다 | BE/INFRA |

**조치**
- Secrets Manager 신규 2건
  - `finance/jwt-secret-che0Ei` (48바이트 난수)
  - `finance/docdb-uri-dI66BL` (교체된 비밀번호 포함 URI)
- `backend/task-def-template.json`
  - `environment` 의 평문 `MONGODB_URI` 제거
  - `secrets` 블록 신규 — `JWT_SECRET`, `MONGODB_URI`
- `backend/src/main/resources/application.yml`
  - prod 프로파일 `uri:` 평문 제거 → `${MONGODB_URI}`
- 실행 역할 `finance-ecs-task-execution-role` 에 `secretsmanager:GetSecretValue` 부여
- Lambda 2개 `MONGODB_URI` 환경변수 교체 (키 6/7개 보존 확인)
- DocumentDB 마스터 비밀번호 교체

**실행 순서와 근거** — DocDB 비밀번호는 즉시 적용되어 그 순간부터 운영 백엔드·Lambda 가
구 자격증명을 들고 있는 상태가 된다. 영향이 없는 작업(JWT 시크릿·IAM·JAR/이미지 빌드)을
먼저 끝내고 비밀번호 교체 → 배포 → Lambda 갱신을 연속 수행해 중단 구간을 줄였다.

### 2. 3단계 — NAT Gateway 제거

**실행 전 발견한 결함 3건.** 계획서·스크립트대로 실행하면 엑셀 업로드 경로가 끊긴다.

| # | 수정사항 | 상세 | 처리 영역 |
|---|---------|------|:-:|
| D-3 | 엔드포인트 SG 인바운드 부재 | 스크립트가 엔드포인트에 붙이는 `finance-lambda-sg` 는 인바운드 규칙이 비어 있다. 인터페이스 엔드포인트는 자기 SG 의 443 인바운드로 받으므로 Lambda 조차 접속 불가 | INFRA |
| D-4 | 백엔드의 SQS 사용을 계획서가 누락 | `FileSessionService:538/1789/2152`, `SessionDataService:235` 에서 `sendMessage` 호출. `--private-dns-enabled` 는 VPC 전체 DNS 를 바꾸므로 ECS 가 퍼블릭 서브넷에 가도 이 엔드포인트를 탄다 | INFRA |
| D-5 | `enableDnsHostnames` 미활성 | VPC 속성이 `False` 라 `--private-dns-enabled` 생성이 거부된다 | INFRA |

**조치**
- 엔드포인트 전용 SG `finance-vpce-sg` (`sg-053116132c7392b56`) 신규 — 인바운드 443 ← Lambda SG, ECS SG
- VPC `enableDnsHostnames` 활성화
- `service_diet/scripts/03-step3-nat-removal.ps1` — 사전 검증 2건 추가, SG 참조 교체
- SQS Interface Endpoint `vpce-027861690c38eca13` 생성 (`private-1a`, private DNS)
- ECS 를 퍼블릭 서브넷으로 이동 (`assignPublicIp=ENABLED`)
- NAT Gateway `nat-0b5fb65fc5616331d` 삭제, EIP `eipalloc-0b002860d6ea9077b` 반납

**계획서 전제와 실측 차이** — 프라이빗 서브넷 재배포의 NAT 통과량이 약 0.5MB 에 그쳤다.
계획서의 "재기동일마다 292~302MB" 는 S3 Gateway Endpoint 생성 이전 측정치이며,
ECR 레이어는 이미 엔드포인트로 빠져 NAT 로는 API 호출만 남아 있었다.
NAT 요금의 97% 가 시간당 유휴 요금이므로 절감 결론은 그대로다.

### 3. 배포

- `v1.1.315` → `v1.1.316`, task definition **revision 266**
- 재배포 3회(2단계 1회, 3-B 1회, 3-D 관련 0회) 모두 무중단

### 4. 검증

엑셀 업로드 E2E 1건으로 세 단계에 걸쳐 미검증이던 항목이 한 번에 해소됐다.

| 대상 | 근거 |
|---|---|
| Redis micro 전환 (1단계) | 백엔드가 신규 캐시에 반복 접속, 진행률 폴링 정상 |
| JWT 키 교체 | 신규 키로 재로그인 성공 / 구 서명키 토큰 401 거부 |
| DocDB 비밀번호 (백엔드) | `MongoTemplate` 조회 정상, ERROR 0건 |
| DocDB 비밀번호 (Lambda Worker) | `MongoDB 삽입 완료: 6270건` |
| 업로드 파이프라인 | 백엔드 → S3 → Coordinator → SQS → Worker → Mongo 완주 (6,270행/22컬럼, 19.3초) |
| 퍼블릭 서브넷 보안 | 태스크 퍼블릭 IP `:8080` 직접 접근 차단 확인, ALB 경유만 허용 |
| NAT 삭제 후 | ALB 200 / CloudFront 200 / 타겟 healthy |

### 남은 작업

- **AWS 액세스 키 폐기** (IAM 콘솔) + CloudTrail 오용 점검 + `Finance Tool AWS 인프라 정보.txt` 삭제
- 구 캐시 `finance-redis-cluster` 삭제 (2026-09-15 이후) — 삭제 전까지 월 $17.5 미실현
- `deploy.ps1` 수정 — ECR 로그인 `--password-stdin` 400 오류, git 스테이징 범위
- ALB `idle_timeout` 300 → 400초 검토 (보고서 7장 #1)
- SQS 엔드포인트 단일 AZ 재검토 — 백엔드까지 의존하게 되어 SPOF 성격이 커졌다

### 절감 현황

| 조치 | 월 절감 | 상태 |
|---|---:|---|
| ECS 2대 → 1대 | $84.5 | 발생 중 |
| NAT Gateway 제거 | $34.7 | 발생 중 |
| EIP 반납 | $3.6 | 발생 중 |
| EC2 bastion 삭제 | $10.7 | 기존 완료 |
| ElastiCache micro | $17.5 | 구 클러스터 삭제 후 |
| SQS Endpoint 신규 | -$9.2 | 3단계 비용 |
| **현재 확정 (세전)** | **약 $124.3/월** | 구 캐시 삭제 시 약 $141.8/월 |

### 커밋/푸시
- Branch: `fix/aws-cost-step23-2026-09` (base: `origin/master` 머지 후)
- Push: 완료
- PR: 미생성

---

## 2026-09-08 AWS 비용절감 1단계 (브랜치: `fix/aws-cost-2026-09`)

> 출처: `service_diet/AWS_비용절감_개선보고서_20260811.docx` (A안 — 유휴 리소스 정리)
> 상세 실행 기록·원복 절차: `service_diet/실행기록_2026-09-08.md`

### 1. 실행 스크립트 사전 점검 (DryRun 전수 검증)

| # | 수정사항 | 상세 | 처리 영역 |
|---|---------|------|:-:|
| C-1 | Lambda 환경변수 파괴 위험 | `aws.exe` 는 네이티브 실행 파일이라 조회 실패해도 `ErrorActionPreference=Stop` 이 걸리지 않음 → 신규 Redis 엔드포인트 조회 실패 시 `REDIS_HOST` 를 **빈 값으로 덮어써** Lambda 2개가 Redis 를 잃음. DryRun 에서 실제 재현 | INFRA |
| C-2 | AWS CLI `file://` JSON 파싱 실패 | Windows PowerShell 5.1 의 `Out-File -Encoding utf8` 은 BOM 을 붙이는데, BOM 이 있으면 `aws` 가 JSON 을 못 읽음 (3곳) | INFRA |
| C-3 | 환경변수 개수 검증 무의미 | PSCustomObject 의 `PSObject.Properties.Count` 는 멤버 열거로 `1 1 1 1 1 1` 출력 | INFRA |

**조치**
- `service_diet/scripts/01-step1-scale-and-cache.ps1`
  - 신규 엔드포인트 형식 검증 후 미충족 시 `exit 1` 가드 추가
  - `Write-JsonNoBom` 헬퍼 도입 (BOM 없이 기록)
  - `@($vars.PSObject.Properties).Count` 로 실제 개수 출력
  - 롤백용 `lambda-env-rollback-*.json` 을 래핑된 형태로 함께 생성
- `service_diet/scripts/02-step2-secrets.ps1`
  - 동일 3건 + Secrets Manager 조회 실패 가드
  - task-def `valueFrom` 안내를 `create-secret` 반환 ARN(끝 6자 접미사 포함) 기준으로 변경
- `service_diet/scripts/99-rollback.ps1` — 롤백 파일 안내 갱신
- `service_diet/scripts/.gitignore`, `service_diet/records/.gitignore` 신규
  - 실행 중 생성 파일에 DocumentDB 평문 비밀번호가 담겨 커밋 차단
- 루트 `.gitignore` — 매뉴얼/분석 산출물 차단
  - `deploy.ps1` 의 git 스테이징이 untracked 를 전부 담아 배포 커밋에 무관한
    바이너리가 섞였다(실측 146개 / 10.5MB → 28개 / 약 0.2MB)
  - 차단: `/manual/`, `/manual_assets/**/*.png`, `/manual_output/*.pptx|*.zip`,
    `/analyze.zip`, `/maintanance/*.png|*.pdf|*.jpg`, 루트 `*.pdf|*.xlsx|*.pptx`
  - **차단하지 않음**: `analyze/manuals/*.md`(CLAUDE.md 1번 참조 문서),
    `manual_scripts/*.py`(자동화 스크립트), 캡처 로그 `*.md` — 소스이므로 저장소에 유지

### 2. 1단계 실행 — 유휴 리소스 정리 (월 약 $84.5 절감)

| # | 수정사항 | 상세 | 처리 영역 |
|---|---------|------|:-:|
| C-4 | ECS 태스크 2대 → 1대 | CPU 평균 0.13%, 하루 정상 요청 12건. 무중단 확인 | INFRA |
| C-5 | ElastiCache `t4g.small` → `t4g.micro` | 메모리 사용률 0.88%. 신규 `finance-redis-micro` 생성, 구 클러스터는 1주 존치 | INFRA |
| C-6 | `REDIS_HOST` 3곳 동시 교체 | task-def + Lambda 2개. 백엔드만 바꾸면 엑셀 진행률이 깨짐 | BE/INFRA |
| C-7 | graceful shutdown 미동작 | 태스크가 1대가 되어 배포 중 요청을 흡수할 여유가 없어짐. daemon 스레드는 SIGTERM 에 즉사 | BE |

**조치**
- `backend/task-def-template.json`
  - `REDIS_HOST` → `finance-redis-micro.1kdayr.0001.apn2.cache.amazonaws.com`
  - `"stopTimeout": 120` 추가
  - `healthCheck.startPeriod` 120 → 45 (실측 기동 17~23초, 금일 실측 12.3초)
- `backend/src/main/resources/application.yml`
  - `server.shutdown: graceful` 추가
  - `spring.lifecycle.timeout-per-shutdown-phase: 110s` (stopTimeout 120 보다 짧게)
- `backend/src/main/java/.../costreduction/DashboardGenerationService.java`
  - `dashboard-gen` 스레드 `setDaemon(true)` → `false`
- Lambda `ExcelCoordinator` / `ExcelWorker` 환경변수 `REDIS_HOST` 교체 (개수 6/7 전부 보존)

**배포**
- `v1.1.314` → `v1.1.315`, task definition **revision 265**
- `deploy.ps1` 은 **사용하지 않음** — 1단계의 git 스테이징 범위가 넓어 무관한 untracked
  파일(PDF, `manual*/`, `analyze.zip` 등)이 전부 커밋·푸시됨. 빌드~배포만 동일 명령으로 수동 실행
- ⚠️ Windows PowerShell 5.1 에서 `aws ecr get-login-password | docker login --password-stdin`
  이 **400 Bad Request** 로 실패. `--password` 방식으로 우회. `backend/deploy.ps1:78` 도 동일 문제

**검증**
- deployment `PRIMARY`/`COMPLETED`, ALB 타겟 healthy 1개, HTTP 중단 없음
- 백엔드 기동 12.343초, ERROR/Exception 0건, DocumentDB 연결 정상
- `GET /actuator/health` → 200 `{"status":"UP"}`
- ⚠️ **Redis 실제 읽기/쓰기는 미검증** — `POST /api/cache/test` 가 401(인증 필요).
  엑셀 업로드 1건으로 진행률 표시를 확인해야 최종 검증

### 3. 보고서 7장 "실행 전 확정 필요 사항" 확인 결과

| # | 항목 | 결과 |
|---|------|------|
| 1 | ALB idle timeout ≥ 360초 | ❌ **실측 300초**. `ClusteringService.mergeClusters` 주석은 "CloudFront 360초 활용"이나 ALB 가 먼저 끊음 → 5분 초과 병합은 **현행에서도 504**. 이번 작업과 무관한 기존 결함, 별도 판단 필요 |
| 2 | `ExcelWorker` 가 DocDB 를 직접 쓰는지 | ✅ 사실. `MongoDBConfig` + `S3Client` 만 사용하고 `SqsClient` 없음(수신 전용) → NAT 제거 후 Worker 경로는 기존 S3 Gateway Endpoint 로 전부 커버 |

### 남은 작업

- 구 캐시 `finance-redis-cluster` 삭제 (2026-09-15 이후) — 삭제 전까지 월 $17.5 미실현
- 2단계 보안 조치(JWT 키·DocDB 비밀번호·AWS 액세스 키) — 전체 사용자 강제 로그아웃, 사전 공지 필요
- 3단계 NAT 제거 — SQS Endpoint 단일 AZ 여부 확인 필요
- `backend/deploy.ps1` ECR 로그인 방식 수정

### 커밋/푸시
- Branch: `fix/aws-cost-2026-09` (base: `origin/master` `5fe74d7`)
- Commits:
  - `1e5d259` fix: AWS 비용절감 실행 스크립트 사전 점검 및 결함 수정
  - `f5b4bcd` fix: 1단계 백엔드 변경 — Redis micro 전환 + graceful shutdown
  - `2c05824` docs: 1단계 실행 기록 (2026-09-08) 및 v1.1.315 배포
  - `c2486ef` docs: 실행기록 검증 절 정정 — Redis 기능 검증은 미완
  - `b4d088e` docs: 유지보수 로그에 2026-09-08 섹션 추가
  - `acc91f3` chore: 매뉴얼/분석 산출물 gitignore 추가
- Push: ✅ 완료 (`origin/fix/aws-cost-2026-09`)
- PR: 미생성 — https://github.com/scschwan/lg_cns_web/pull/new/fix/aws-cost-2026-09

---

## 2026-04-23 유지보수 (브랜치: `fix/maintenance-2026-04-23`)

> 출처: `maintanance/2026-04-23_01.png`, `2026-04-23_02.png`, `2026-04-23_03.png`

### 1. 다중 파일 업로드 화면 반응형 스크롤 개선

| # | 수정사항 | 상세 | 처리 영역 |
|---|---------|------|:-:|
| A-1 | 페이지 세로 스크롤 미노출 | DashboardLayout의 `main`이 `overflow-hidden`이라 자식 페이지 자체 스크롤 발생 불가 → 테이블이 길어지면 '프로젝트 완료' 버튼이 하단에 가려짐 | FE |
| A-2 | 브라우저 높이 축소 시 반응형 미대응 | 너비 반응형은 있으나 높이 반응형이 없음 → 윈도우 축소 시에도 스크롤 불가 | FE |

**조치**
- `frontend/src/pages/upload/MultiFileUploadPage.jsx`
  - 루트 `<div>` 클래스: `min-h-screen bg-gray-50` → `h-full overflow-y-auto bg-gray-50`
  - 잠금 로딩/편집자 차단 화면도 동일하게 `h-full overflow-y-auto`로 변경
  - 세션 테이블 `ScrollSyncTable maxHeight="500px"` (고정) → `maxHeight="40vh"` (뷰포트 비례)
  - 파일 테이블은 기존 `30vh` 유지 → 두 테이블 합계 70vh로 제한, 헤더+완료 버튼 영역 확보

### 2. Short List 비용유형 분류 카드 합계/비율 오류

| # | 수정사항 | 상세 | 처리 영역 |
|---|---------|------|:-:|
| B-1 | 서브 클러스터 부분선택 시 카드 합계 금액이 전체 클러스터 값으로 표시됨 | 예: '도급비' 클러스터 A/B만 선택(230.1억) → 표는 230.1억이나 카드는 398.6억(A+B+C+D 전체) 표시 | BE |
| B-2 | 카드 라벨 '`Raw List 대비 비율`'이 Short List 단계에서는 부적절 | Short List 도출 단계에서는 Long List 대비 비율이 의미상 맞음 | FE |
| B-3 | 비율 계산식 오류 | 분모를 `sum(all longListItems.totalAmount)`로 계산 → Level 1/2/3 중복 합산으로 부풀려짐 | BE |

**조치**
- `backend/.../service/costreduction/ShortListService.java`
  - `getItemStats(projectId, statisticsId)`: 클릭한 항목이 Level 2 클러스터이고 longListItems에 포함된 Level 3 세부클러스터가 존재하면, 해당 세부클러스터들만 합산하여 `rawDataRows`/`totalAmount` 재계산 (`supplierCount`/`costCenterCount`는 표 컬럼과 일관되도록 Level 2 원본 유지)
  - `getAccountItemStats(projectId, accountName)`: 계정 수준도 각 Level 2 클러스터에 대해 Level 3 선택 반영 로직 적용 (N+1 방지 위해 `findAllById`로 일괄 조회)
  - 비율 분모: 모든 레벨 단순 합 → `recalculateLevel2Total(longListItems)` 기반으로 변경 (중복 합산 제거)
- `frontend/src/pages/shortlist/ShortListPage.jsx`
  - `SelectedItemCard` 라벨: `Raw List 대비 비율` → `Long List 대비 비율`

### 커밋/푸시
- Branch: `fix/maintenance-2026-04-23`
- Commit: `fix: 2026-04-23 유지보수 2건 반영 - 업로드 스크롤, Short List 카드 합계/비율`
- PR: https://github.com/scschwan/lg_cns_web/pull/new/fix/maintenance-2026-04-23

---

## 2026-04-09 수정사항

> 출처: `lg cns 수정사항.pdf`

---

## 1. 대시보드 - 완료 과제 관리 카드

| # | 수정사항 | 상세 | 프론트엔드 처리 가능 |
|---|---------|------|:-:|
| 1-1 | 단계별 카드 폰트 크기 확대 | Raw List / Long List / Short List 등 단계별 카드의 폰트 크기를 키워야 함 | O |
| 1-2 | 금액 1000단위 쉼표 표시 | 대시보드 카드 금액, 합계금액에 1000단위 콤마(,) 필요 (예: 5,212.2억원) | O |
| 1-3 | 표시명 변경 | "2단계 비용유형분류(Raw List 기반)" -> "2단계 비용유형분류(Long List 기반)" | O |
| 1-4 | 표시명 변경 | "3단계 비용유형분류(Long List 기반)" -> "2단계 비용유형분류(Short List 기반)" | O |
| 1-5 | Able 과제 등록 항목 표시 | 등록된 항목에 "과제등록됨" 표시 필요 | O |
| 1-6 | Able 과제 엑셀 다운로드 | 엑셀 다운로드 시 이슈사항 등이 표기되지 않는 문제 | O |
| 1-7 | 가장 최근 주차 데이터 표시 | 대시보드에서 가장 최근 주차 데이터를 기본 표시 | O |

---

## 2. 원본 데이터 테이블 (Step 2: Start Analysis)

| # | 수정사항 | 상세 | 프론트엔드 처리 가능 |
|---|---------|------|:-:|
| 2-1 | 회계연도 쉼표 제거 | 회계연도 컬럼에 불필요한 쉼표 표시됨 (예: 2,024 -> 2024) | O |
| 2-2 | 공급업체코드 쉼표 제거 | 공급업체코드 컬럼에 불필요한 쉼표 표시됨 | O |

---

## 3. Preprocessing (전처리) 페이지

| # | 수정사항 | 상세 | 프론트엔드 처리 가능 |
|---|---------|------|:-:|
| 3-1 | 키워드 추출 미수행 시 다음단계 차단 | Preprocessing에서 다음 페이지 이동 시 '키워드 추출'이 수행되지 않았다면 "키워드 추출을 수행해야 합니다" 다이얼로그 팝업 출력 후 return (다음 페이지 이동 차단) | O |

---

## 4. 5단계 클러스터링

| # | 수정사항 | 상세 | 프론트엔드 처리 가능 |
|---|---------|------|:-:|
| 4-1 | 자동클러스터링 403 오류 | 키워드/공급업체 선택 후 자동클러스터링 시 "자동클러스터링 실패 request failed with status code 403" 오류 발생. 한번 발생 시 지속 발생 | ? (백엔드 확인 필요) |
| 4-2 | 클러스터 재병합 시 이름 등록 | 병합한 클러스터끼리 재병합(merge) 시에도 클러스터명 등록 후 병합해야 함. 현재는 이름 선택 없이 병합됨 | O |
| 4-3 | 클러스터링 테이블 정렬 | 클러스터링 단계에서 오름차순/내림차순 정렬이 안되는 열이 있음 | O |

---

## 요약

| 영역 | 항목 수 | 프론트엔드 처리 가능 | 백엔드 확인 필요 |
|------|:------:|:------:|:------:|
| 대시보드 | 7 | 7 | 0 |
| 원본 데이터 테이블 | 2 | 2 | 0 |
| Preprocessing | 1 | 1 | 0 |
| 클러스터링 | 3 | 2 | 1 |
| **합계** | **13** | **12** | **1** |

---

## 우선순위 제안

### 높음 (기능 오류/차단)
- 4-1: 자동클러스터링 403 오류 (기능 불가)
- 3-1: 키워드 추출 미수행 시 다음단계 차단 (데이터 무결성)

### 중간 (표시 오류)
- 2-1, 2-2: 회계연도/공급업체코드 쉼표 제거 (데이터 오표시)
- 1-2: 금액 1000단위 쉼표 표시
- 1-3, 1-4: 표시명 변경

### 낮음 (UI 개선)
- 1-1: 카드 폰트 크기 확대
- 1-5: Able 과제 등록 표시
- 1-6: 엑셀 다운로드 이슈사항 누락
- 1-7: 최근 주차 데이터 기본 표시
- 4-2: 클러스터 재병합 시 이름 등록
- 4-3: 클러스터링 테이블 정렬
