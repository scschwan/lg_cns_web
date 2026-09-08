# =============================================================================
# 02-step2-secrets.ps1 - 2단계: 보안 조치 (비용 무관, 시급도 최상)
#
#   Phase A : JWT 서명 키 생성 -> Secrets Manager
#   Phase B : DocumentDB 비밀번호 변경 -> Secrets Manager
#   Phase C : 태스크 실행 역할에 secretsmanager 권한 부여
#   Phase D : Lambda 환경변수 MONGODB_URI 교체
#
# !! 주의 !!
#   - JWT 키 교체 시 전체 사용자 강제 로그아웃 (회피 불가, 사전 공지 필요)
#   - DocDB 비밀번호 변경은 즉시 적용됨. 배포까지 연속 수행할 것
#   - 비사용일에 실행 권장
# =============================================================================

param(
    [Parameter(Mandatory=$true)][ValidateSet("A","B","C","D")][string]$Phase,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$env:AWS_DEFAULT_REGION = "ap-northeast-2"

$ACCOUNT      = "659002796326"
$REGION       = "ap-northeast-2"
$DOCDB_ID     = "finance-docdb-cluster"
$DOCDB_HOST   = "finance-docdb-cluster.cluster-c1ue6aayyxjn.ap-northeast-2.docdb.amazonaws.com"
$EXEC_ROLE    = "finance-ecs-task-execution-role"
$JWT_SECRET_N = "finance/jwt-secret"
$DB_SECRET_N  = "finance/docdb-uri"

# UTF-8 BOM 이 붙으면 AWS CLI 의 file:// JSON 파싱이 실패한다.
# (Windows PowerShell 5.1 의 Out-File -Encoding utf8 은 BOM 을 붙인다)
function Write-JsonNoBom([string]$Path, [string]$Json) {
    $full = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Path))
    [System.IO.File]::WriteAllText($full, $Json, (New-Object System.Text.UTF8Encoding($false)))
}

function New-RandomSecret([int]$bytes) {
    $b = New-Object byte[] $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    return [Convert]::ToBase64String($b)
}

# -----------------------------------------------------------------------------
if ($Phase -eq "A") {
    Write-Host "=== 2-A. JWT 서명 키 교체 ===" -ForegroundColor Green

    $warn = @'
현재 상태:
  application.yml:40 이 ${JWT_SECRET:기본값} 형태인데
  task-def-template.json 에 JWT_SECRET 이 없어
  소스에 공개된 기본 문자열로 토큰을 서명 중이다.
  -> 해당 문자열을 아는 사람은 관리자 권한 JWT 위조 가능
'@
    Write-Host $warn -ForegroundColor Red
    Write-Host "!! 교체 시 전체 사용자 강제 로그아웃 발생 (사전 공지 필수) !!" -ForegroundColor Yellow

    $jwt = New-RandomSecret 48
    Write-Host ""
    Write-Host "생성된 시크릿 길이: $($jwt.Length)" -ForegroundColor DarkGray

    if ($DryRun) {
        Write-Host "(DryRun) Secrets Manager 저장 생략" -ForegroundColor Yellow
    }
    else {
        $jwtArn = aws secretsmanager create-secret --name $JWT_SECRET_N --description "Finance Tool JWT signing key" --secret-string $jwt --query "ARN" --output text
        Write-Host ""
        Write-Host "생성된 ARN (아래 valueFrom 에 이 값을 그대로 사용): $jwtArn" -ForegroundColor Cyan
    }

    Write-Host ""
    Write-Host "[수동 작업] backend/task-def-template.json 의 containerDefinitions 에 추가" -ForegroundColor White
    Write-Host ""
    Write-Host '  "secrets": [' -ForegroundColor DarkGray
    Write-Host '    { "name": "JWT_SECRET",' -ForegroundColor DarkGray
    Write-Host "      `"valueFrom`": `"<위에 출력된 ARN - 끝 6자 접미사 포함>`" }" -ForegroundColor DarkGray
    Write-Host '  ]' -ForegroundColor DarkGray
}

# -----------------------------------------------------------------------------
if ($Phase -eq "B") {
    Write-Host "=== 2-B. DocumentDB 비밀번호 교체 ===" -ForegroundColor Green
    Write-Host "!! 변경은 즉시 적용됩니다. 배포까지 연속 수행하세요 !!" -ForegroundColor Red

    # DocumentDB 비밀번호 제약: / " @ 및 공백 사용 불가
    $raw = New-RandomSecret 24
    $pw  = $raw -replace '[/+=]', 'X'
    $uri = "mongodb://dmillion:$pw@${DOCDB_HOST}:27017/?replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false"

    Write-Host ""
    Write-Host "신규 비밀번호 길이: $($pw.Length)" -ForegroundColor DarkGray

    if ($DryRun) {
        Write-Host "(DryRun) 실행될 명령:" -ForegroundColor Yellow
        Write-Host "  aws docdb modify-db-cluster --db-cluster-identifier $DOCDB_ID --master-user-password <생성값> --apply-immediately" -ForegroundColor DarkGray
        Write-Host "  aws secretsmanager create-secret --name $DB_SECRET_N --secret-string <URI>" -ForegroundColor DarkGray
    }
    else {
        aws docdb modify-db-cluster --db-cluster-identifier $DOCDB_ID --master-user-password $pw --apply-immediately --query "DBCluster.DBClusterIdentifier" --output text
        aws secretsmanager create-secret --name $DB_SECRET_N --description "Finance Tool DocumentDB connection URI" --secret-string $uri --query "ARN" --output text
    }

    $manual = @'

[수동 작업 1] backend/task-def-template.json
  - environment 의 MONGODB_URI 항목 삭제
  - secrets 에 MONGODB_URI 항목 추가 (valueFrom = Secrets Manager ARN)

[수동 작업 2] backend/src/main/resources/application.yml:110
  - prod 프로파일의 평문 uri 제거 -> ${MONGODB_URI} 참조로 통일
    (:19 는 이미 올바른 형태)

[수동 작업 3] 즉시 재배포 (backend/deploy.ps1)

[수동 작업 4] Lambda 2개 -> Phase D 실행

'@
    Write-Host $manual -ForegroundColor White
}

# -----------------------------------------------------------------------------
if ($Phase -eq "C") {
    Write-Host "=== 2-C. 태스크 실행 역할에 Secrets 읽기 권한 ===" -ForegroundColor Green

    $jwtArn = "arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:${JWT_SECRET_N}*"
    $dbArn  = "arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:${DB_SECRET_N}*"

    $policy = @{
        Version   = "2012-10-17"
        Statement = @(
            @{
                Effect   = "Allow"
                Action   = @("secretsmanager:GetSecretValue")
                Resource = @($jwtArn, $dbArn)
            }
        )
    } | ConvertTo-Json -Depth 5

    Write-JsonNoBom "secrets-policy.json" $policy
    Write-Host "정책 파일 생성: secrets-policy.json" -ForegroundColor DarkGray
    Write-Host $policy -ForegroundColor DarkGray

    if ($DryRun) {
        Write-Host "(DryRun) 실행될 명령:" -ForegroundColor Yellow
        Write-Host "  aws iam put-role-policy --role-name $EXEC_ROLE --policy-name finance-secrets-read --policy-document file://secrets-policy.json" -ForegroundColor DarkGray
    }
    else {
        aws iam put-role-policy --role-name $EXEC_ROLE --policy-name finance-secrets-read --policy-document file://secrets-policy.json
        Write-Host "권한 부여 완료" -ForegroundColor Green
    }
}

# -----------------------------------------------------------------------------
if ($Phase -eq "D") {
    Write-Host "=== 2-D. Lambda MONGODB_URI 교체 ===" -ForegroundColor Green
    Write-Host "Lambda 는 Secrets Manager 직접 참조가 불가하므로 환경변수를 갱신한다." -ForegroundColor DarkGray

    if ($DryRun) {
        $uri = "(DryRun-placeholder)"
    }
    else {
        $uri = aws secretsmanager get-secret-value --secret-id $DB_SECRET_N --query "SecretString" --output text
        if ([string]::IsNullOrWhiteSpace($uri) -or $uri -notlike "mongodb://*") {
            Write-Host "!! 중단: Secrets Manager 에서 DocDB URI 를 읽지 못했습니다 (Phase B 선행 필요) !!" -ForegroundColor Red
            exit 1
        }
    }

    foreach ($fn in @("ExcelCoordinator", "ExcelWorker")) {
        Write-Host ""
        Write-Host "[$fn] 환경변수 병합 교체" -ForegroundColor Cyan

        $backup = "lambda-env-backup-secrets-$fn.json"
        aws lambda get-function-configuration --function-name $fn --query "Environment.Variables" --output json | Out-File $backup -Encoding utf8

        $vars   = Get-Content $backup -Raw | ConvertFrom-Json
        $before = @($vars.PSObject.Properties).Count
        $vars.MONGODB_URI = $uri

        $payload = "lambda-env-secrets-$fn.json"
        Write-JsonNoBom $payload (@{ Variables = $vars } | ConvertTo-Json -Depth 5 -Compress)
        Write-Host "  변수 개수: $before (교체 후에도 동일해야 정상)"

        if ($DryRun) {
            Write-Host "  (DryRun) 실행 안 함" -ForegroundColor Yellow
        }
        else {
            aws lambda update-function-configuration --function-name $fn --environment "file://$payload" --query "FunctionName" --output text
            aws lambda wait function-updated --function-name $fn
            Write-Host "  완료" -ForegroundColor Green
        }
    }

    $manual = @'

[수동 작업] AWS 액세스 키 폐기
  1. IAM 콘솔에서 'Finance Tool AWS 인프라 정보.txt:3-4' 의 키 비활성화 -> 삭제
  2. 신규 키 발급 후 로컬 프로파일 갱신
  3. CloudTrail 로 해당 키의 비정상 사용 이력 점검
  4. 해당 txt 파일 삭제 + .gitignore 추가
     (git 이력 정리는 권고하지 않음 - 노출된 값은 이력을 지워도 안전해지지 않음)

[검증]
  - 신규 JWT 로 로그인 성공 / 기존 토큰 거부
  - 백엔드와 Lambda 양쪽 DocDB 연결 정상
  - 엑셀 업로드 E2E

'@
    Write-Host $manual -ForegroundColor White
}
