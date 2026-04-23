# CLAUDE.md — 프로젝트 개발 지침

> 이 저장소(LG CNS Finance Tool)에서 Claude 가 작업할 때 반드시 지켜야 하는 규칙 및 관례. 세션이 새로 시작되어도 이 문서를 최우선으로 참조한다.

---

## 0. 최우선 규칙 — 작업 종료 시 로그 기록 (절대 누락 금지)

**하루 작업이 마무리되는 시점마다**, 그 날 수행한 모든 수정사항을 반드시 아래 파일에 추가한다.

- **대상 파일**: `maintanance/LG_CNS_수정사항_정리.md`
- **작성 시점**: 사용자가 "작업 종료", "오늘 작업 정리", "커밋/PR 완료" 등의 신호를 주거나, 브랜치를 원격에 push 한 직후
- **누적 방식**: 기존 내용을 덮어쓰지 말고 **최신 날짜 섹션을 최상단에 추가** (가장 오래된 기록이 아래로 내려가는 역시간순)
- **섹션 템플릿**:

  ```markdown
  ## YYYY-MM-DD 유지보수 (브랜치: `<branch-name>`)

  > 출처: `maintanance/<증빙 스크린샷/PDF 경로>`

  ### N. <이슈 영역 제목>

  | # | 수정사항 | 상세 | 처리 영역 |
  |---|---------|------|:-:|
  | X-1 | <증상 요약> | <원인/맥락> | FE/BE |

  **조치**
  - `<수정한 파일 경로>`
    - <변경 내역을 bullet 로 구체적으로 기술>

  ### 커밋/푸시
  - Branch: `<branch-name>`
  - Commit: `<커밋 메시지 1줄 요약>`
  - PR: <PR 생성 URL 또는 PR 번호>
  ```

- **사용자가 명시적으로 요청하지 않더라도** 작업을 마치고 push 를 수행한 직후에는 자발적으로 이 파일을 업데이트한다.
- 누락은 이 저장소에서의 가장 큰 규칙 위반으로 간주한다.

---

## 1. 작업 시작 전 필수 확인 사항

1. **`analyze/` 폴더를 먼저 확인**할 것.
   - `analyze/system_architecture.md` — 전체 시스템 구조
   - `analyze/backend/`, `analyze/frontend/`, `analyze/infra/` — 영역별 분석 자료
   - `analyze/manuals/` — 도메인/기능 매뉴얼
   - `analyze/maintenance_log_*.md`, `analyze/maintenance_report_*.md` — 과거 유지보수 이력
   - 변경 대상 모듈의 설계 의도·데이터 모델·호출 흐름을 여기서 우선 파악한 뒤 코드를 건드린다.
2. **`maintanance/LG_CNS_수정사항_정리.md`** 를 읽어 이전 세션에서 어떤 이슈가 어떻게 해결됐는지 맥락을 흡수한다.
3. **`maintanance/`** 내 PNG/PDF 증빙은 Read 툴로 실제로 열어보고 — 증상 화면과 금액/라벨을 직접 확인한 뒤 수정 방향을 잡는다.

---

## 2. 브랜치 / 커밋 / PR 규칙

### 2.0 세션 시작 시 필수 동기화 (건너뛰기 금지)
- 세션에서 첫 코드 변경을 하기 **직전에 반드시** 최신 원격 상태를 받는다.
  1. `git fetch origin`
  2. 현재 브랜치가 이 세션의 작업 브랜치가 아니면 `master` 기준으로 최신화: `git checkout master && git pull --ff-only origin master`
  3. 그 후 **신규 작업 브랜치를 새로 파거나**, 이 세션에서 이미 만들어둔 작업 브랜치로 체크아웃해 `git pull --ff-only origin <branch>` 로 원격 최신 상태를 흡수.
- `git pull` 이 fast-forward 로 불가한 충돌 상태라면 임의 병합·리베이스 전에 사용자에게 보고한다.
- pull 을 생략하고 편집을 시작하는 것은 금지. 과거 작업과 충돌/덮어쓰기의 원인이 된다.

### 2.1 브랜치 정책
- **`master` 브랜치는 절대 직접 사용하지 않는다** — 체크아웃 후 편집도 금지, 커밋/푸시는 더더욱 금지. `master` 는 오직 **최신 pull 용 기준선** 으로만 사용한다.
- **세션 단위 단일 브랜치 원칙**: 한 세션 안에서 발생하는 모든 수정은 **하나의 작업 브랜치** 에 누적한다.
  - 세션 첫 작업 시 신규 브랜치를 1개 생성: `fix/<영역>-<날짜 또는 키워드>` (예: `fix/maintenance-2026-04-23`, `fix/preprocessing-keyword-extraction-guard`).
  - 이후 동일 세션 내의 모든 후속 수정은 **같은 브랜치에 추가 커밋** 한다. 새 브랜치를 만들지 않는다.
  - 사용자가 "별도 브랜치로 나눠달라" 고 명시한 경우에만 분기.
- **자동 푸시**: 작업 브랜치에 커밋을 만들면 **사용자의 별도 요청 없이도** `git push -u origin <branch>` (최초) / `git push` (이후) 를 수행한다. 로컬에만 두지 않는다.
- 브랜치 식별이 모호하면: `git branch --show-current` 로 확인한 뒤 진행.

### 2.2 커밋 메시지
- 1행: `fix: <한 줄 요약>` (한국어 가능)
- 본문: 번호 매겨서 각 수정 건의 원인·조치·영향 범위 기술
- `Co-Authored-By` 트레일러는 사용자가 요청할 때만 붙임

### 2.3 절대 하지 말 것
- `master` 에 체크아웃한 채로 편집/커밋/푸시. (pull 목적의 일시 체크아웃 → 즉시 작업 브랜치로 복귀는 허용)
- `git add -A` / `git add .` — 사전에 `.gitignore` 에 걸리지 않은 무관한 파일(PDF, xlsx, 임시 산출물 등)이 함께 스테이징될 수 있음. **수정한 파일만 명시적으로** `git add <path>`.
- `--no-verify`, 공유 커밋에 대한 `--amend`, 강제 푸시 — 사용자 명시 요청이 있을 때만.
- 세션 시작 시 `git pull` 생략.

### 2.4 PR 생성
- PR 생성 여부는 사용자가 지시할 때만. 단순 push 만 요청한 경우 PR 생성 링크만 결과로 전달.

---

## 3. 코드 작성 규칙

### 3.1 공통
- 기존 파일의 스타일/포맷을 **그대로 따름**. 무관한 포맷 재정렬·import 재배치·주석 일괄 수정 금지.
- 리팩토링/추상화는 **수정 범위 내**에서만. "겸사겸사 정리" 금지.
- 주석은 **WHY** 만. WHAT(코드가 하는 일)은 적지 않는다. 다만 **복잡한 도메인 로직(도급비/세부클러스터 재계산, 비율 산식 등)은 JavaDoc/한글 주석으로 의도를 남기는 것을 허용**한다.
- 에러 처리·유효성 검사는 경계(사용자 입력, 외부 API)에서만. 내부 호출 신뢰.

### 3.2 프론트엔드 (`frontend/`)
- React + Vite + TailwindCSS + shadcn/ui(`@/components/ui/*`) 스택.
- 페이지가 `DashboardLayout` 안에서 렌더링되는 경우 (Step 1-7):
  - `main` 이 `overflow-hidden` 이므로 페이지 루트는 **반드시** `h-full overflow-y-auto` 패턴을 써서 자체 스크롤을 만든다. `min-h-screen` 금지.
  - 고정 px 높이(`500px` 등) 대신 **뷰포트 비례 단위(`vh`)** 사용 — 브라우저 높이 축소 시 반응해야 함.
- 숫자 표기: 금액은 1000단위 쉼표 (`toLocaleString()`). 회계연도·공급업체코드 등 **식별자 성격**의 숫자에는 쉼표 금지.
- 라벨/문구 변경 시 `maintanance/*.md` 의 용어(예: "Long List 대비 비율")를 우선 기준으로 삼는다.

### 3.3 백엔드 (`backend/`)
- Spring Boot + MongoDB(주) + Redis(캐시) 구조. `ClusterStatisticsRepository` / `LongShortListRepository` 등 공용 레포 사용.
- 반복 조회는 반드시 `findAllById(Set)` 로 배치 조회. 루프 안에서 `findById` 남발 (**N+1**) 금지.
- 집계/통계 계산에서 **레벨 중복 합산 주의**: `LongShortList.ListItem` 은 Level 1(account)/2(cluster)/3(sub-cluster) 이 한 리스트에 공존한다. 합계를 낼 때는 단순 `sum(all)` 이 아니라 `recalculateLevel2Total(items)` 처럼 **한 레벨만** 집계하거나 선택된 하위 레벨 합으로 재계산.
- Redis 캐시를 두는 메서드는 **데이터가 바뀌는 경로에서 키를 반드시 delete** (`shortlist:tree:<projectId>` 등). 새 캐시 키를 추가할 때도 무효화 지점을 같이 확인.
- 서비스 메서드 시그니처/응답 DTO 필드를 바꾸면 **프론트 호출부(`frontend/src/services/*.js`)도 반드시 함께 수정**.

### 3.4 도메인 용어 (Long List / Short List / Able)
- **Raw List** = 전처리 결과 전체
- **Long List** = Raw List 에서 1차 선택된 집합
- **Short List** = Long List 에서 2차 선택된 집합
- **Able 과제** = Short List 를 기반으로 등록된 실행 과제
- Short List 페이지에서 비율 기준은 **Long List 총액**, Long List 페이지에서는 **Raw List 총액** 이 기본. 바꿀 때는 PD 확인을 거친 것인지 이슈 문서에서 검증한다.

---

## 4. 유지보수 작업 시 절차 (권장 순서)

1. **`git fetch origin` → `git checkout master` → `git pull --ff-only origin master`** 로 최신 원격 상태 수신. (2.0 규칙)
2. 세션용 작업 브랜치 신규 생성 또는 기존 작업 브랜치 체크아웃 후 `git pull --ff-only` (`master` 는 즉시 벗어난다).
3. `maintanance/` 폴더에서 해당 날짜의 증빙 자료(PNG/PDF)를 **Read 로 실제 확인**.
4. 증상 - 기대 동작 - 원인 가설을 짧게 정리.
5. `analyze/` + 관련 소스를 읽어 원인 가설을 검증.
6. 변경 계획을 세우고 TaskCreate 로 이슈별 태스크 생성.
7. 최소 변경 원칙으로 수정 → 수정 파일만 명시적으로 `git add`.
8. `git commit` → **작업 브랜치로 자동 push** (`git push -u origin <branch>` / 이후 `git push`). 세션 중 동일 브랜치 유지.
9. **`maintanance/LG_CNS_수정사항_정리.md` 에 오늘 작업 섹션 추가** (0번 규칙).
10. 사용자에게 변경 요약과 PR 생성 링크를 전달.

---

## 5. 하지 말아야 할 것 (금지 사항)

- **세션 시작 시 `git pull` 로 원격 최신 상태를 받지 않고 작업 시작** (2.0 규칙).
- **`master` 브랜치 위에서 편집·커밋·푸시** (`master` 는 pull 기준선 전용).
- 한 세션에서 같은 작업을 여러 브랜치로 쪼개기 (사용자가 명시 요청한 경우 제외).
- 커밋 후 원격 push 누락 — 작업 브랜치는 항상 자동 push.
- 무관한 파일(PDF, xlsx, manual 폴더 등)을 커밋에 섞기.
- 작업 후 `maintanance/LG_CNS_수정사항_정리.md` 갱신 누락.
- 고정 px 높이로 Dashboard 하위 페이지 테이블 크기 지정.
- Level 1/2/3 항목을 구분 없이 `sum()` 하여 합계 계산.
- 설명 없이 라벨/용어 변경 (출처가 유지보수 문서/고객 피드백인지 확인).
- 사용자에게 이 문서의 존재를 언급하지 않고 규칙을 어기는 것.
