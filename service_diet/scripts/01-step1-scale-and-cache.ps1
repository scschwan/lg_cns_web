# =============================================================================
# 01-step1-scale-and-cache.ps1 - 1단계: 즉시 조치 (월 $110 절감)
#
#   Phase A : ECS 태스크 2대 -> 1대
#   Phase B : ElastiCache t4g.micro 신규 생성
#   Phase C : REDIS_HOST 3곳 교체 (task-def + Lambda 2개)
#
# 실행: .\01-step1-scale-and-cache.ps1 -Phase A -DryRun
#       .\01-step1-scale-and-cache.ps1 -Phase A
# 롤백: .\99-rollback.ps1 -Step 1
# =============================================================================

param(
    [Parameter(Mandatory=$true)][ValidateSet("A","B","C")][string]$Phase,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$env:AWS_DEFAULT_REGION = "ap-northeast-2"

$CLUSTER      = "finance-cluster"
$SERVICE      = "finance-api"
$NEW_REDIS_ID = "finance-redis-micro"
$OLD_REDIS_ID = "finance-redis-cluster"
$SUBNET_GROUP = "finance-redis-cluster-subnet"
$REDIS_SG     = "sg-02b0bb92322a14665"

# UTF-8 BOM 이 붙으면 AWS CLI 의 file:// JSON 파싱이 실패한다.
# (Windows PowerShell 5.1 의 Out-File -Encoding utf8 은 BOM 을 붙인다)
function Write-JsonNoBom([string]$Path, [string]$Json) {
    $full = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Path))
    [System.IO.File]::WriteAllText($full, $Json, (New-Object System.Text.UTF8Encoding($false)))
}

# -----------------------------------------------------------------------------
if ($Phase -eq "A") {
    Write-Host "=== 1-A. ECS 태스크 2대 -> 1대 ===" -ForegroundColor Green
    Write-Host "근거: CPU 평균 0.13%, 하루 정상 요청 12건" -ForegroundColor DarkGray
    Write-Host "영향: 무중단(min 100%/max 200%). 단 가용성 저하(장애 시 1~2분)" -ForegroundColor Yellow

    Write-Host ""
    Write-Host "[현재 상태]"
    aws ecs describe-services --cluster $CLUSTER --services $SERVICE --query "services[0].{Desired:desiredCount,Running:runningCount}" --output json

    if ($DryRun) {
        Write-Host ""
        Write-Host "(DryRun) 실행될 명령:" -ForegroundColor Yellow
        Write-Host "  aws ecs update-service --cluster $CLUSTER --service $SERVICE --desired-count 1" -ForegroundColor DarkGray
        return
    }

    Write-Host ""
    Write-Host "[실행] desired-count 1" -ForegroundColor Cyan
    aws ecs update-service --cluster $CLUSTER --service $SERVICE --desired-count 1 --query "service.{Desired:desiredCount}" --output json

    Write-Host ""
    Write-Host "[안정화 대기] 최대 5분..." -ForegroundColor Cyan
    aws ecs wait services-stable --cluster $CLUSTER --services $SERVICE
    Write-Host "완료. ALB 타겟 healthy 1개인지 확인하세요." -ForegroundColor Green
}

# -----------------------------------------------------------------------------
if ($Phase -eq "B") {
    Write-Host "=== 1-B. ElastiCache t4g.micro 신규 생성 ===" -ForegroundColor Green
    Write-Host "근거: 메모리 사용률 0.88% (1.37GB 중 약 12MB)" -ForegroundColor DarkGray
    Write-Host "주의: 구 클러스터는 1주 존치 후 수동 삭제" -ForegroundColor Yellow

    if ($DryRun) {
        Write-Host ""
        Write-Host "(DryRun) 실행될 명령:" -ForegroundColor Yellow
        Write-Host "  aws elasticache create-cache-cluster --cache-cluster-id $NEW_REDIS_ID --cache-node-type cache.t4g.micro --engine redis --engine-version 7.1 --num-cache-nodes 1 --cache-subnet-group-name $SUBNET_GROUP --security-group-ids $REDIS_SG" -ForegroundColor DarkGray
        return
    }

    Write-Host ""
    Write-Host "[실행] 클러스터 생성" -ForegroundColor Cyan
    aws elasticache create-cache-cluster --cache-cluster-id $NEW_REDIS_ID --cache-node-type cache.t4g.micro --engine redis --engine-version 7.1 --num-cache-nodes 1 --cache-subnet-group-name $SUBNET_GROUP --security-group-ids $REDIS_SG --query "CacheCluster.{Id:CacheClusterId,Status:CacheClusterStatus}" --output json

    Write-Host ""
    Write-Host "[생성 대기] 5~10분 소요..." -ForegroundColor Cyan
    aws elasticache wait cache-cluster-available --cache-cluster-id $NEW_REDIS_ID

    Write-Host ""
    Write-Host "[신규 엔드포인트] - Phase C 에서 사용" -ForegroundColor Green
    aws elasticache describe-cache-clusters --cache-cluster-id $NEW_REDIS_ID --show-cache-node-info --query "CacheClusters[0].CacheNodes[0].Endpoint.Address" --output text
}

# -----------------------------------------------------------------------------
if ($Phase -eq "C") {
    Write-Host "=== 1-C. REDIS_HOST 전환 (3곳 동시) ===" -ForegroundColor Green
    Write-Host "!! 백엔드만 바꾸면 엑셀 처리 진행률이 깨집니다 !!" -ForegroundColor Red

    $newEp = aws elasticache describe-cache-clusters --cache-cluster-id $NEW_REDIS_ID --show-cache-node-info --query "CacheClusters[0].CacheNodes[0].Endpoint.Address" --output text

    # aws.exe 는 네이티브 실행 파일이라 실패해도 ErrorActionPreference=Stop 이 걸리지 않는다.
    # 가드가 없으면 빈 값으로 REDIS_HOST 를 덮어써 Lambda 2개가 Redis 를 잃는다.
    if ([string]::IsNullOrWhiteSpace($newEp) -or $newEp -notlike "*.cache.amazonaws.com") {
        Write-Host ""
        Write-Host "!! 중단: 신규 Redis 엔드포인트를 조회하지 못했습니다 (값='$newEp') !!" -ForegroundColor Red
        Write-Host "   Phase B 를 먼저 완료하고 클러스터가 available 인지 확인하세요." -ForegroundColor Red
        exit 1
    }

    Write-Host ""
    Write-Host "신규 엔드포인트: $newEp" -ForegroundColor Cyan

    $manual = @'

[수동 작업 1] backend/task-def-template.json
  - :40  REDIS_HOST -> (위 신규 엔드포인트)
  - 컨테이너 정의에 "stopTimeout": 120 추가
  - healthCheck.startPeriod  120 -> 45

[수동 작업 2] backend/src/main/resources/application.yml
  server:
    shutdown: graceful
  spring:
    lifecycle:
      timeout-per-shutdown-phase: 110s

[수동 작업 3] DashboardGenerationService.java:55
  t.setDaemon(true)  ->  t.setDaemon(false)

[수동 작업 4] backend/deploy.ps1 로 재배포

'@
    Write-Host $manual -ForegroundColor White

    # -------------------------------------------------------------------------
    # Lambda 환경변수는 update 시 "전체 교체" 된다.
    # REDIS_HOST 만 지정하면 MONGODB_URI, SQS_QUEUE_URL 등이 모두 삭제되므로
    # 기존 값을 읽어 병합한 뒤 전체를 다시 전달해야 한다.
    # -------------------------------------------------------------------------
    foreach ($fn in @("ExcelCoordinator", "ExcelWorker")) {
        Write-Host ""
        Write-Host "[$fn] 환경변수 병합 교체" -ForegroundColor Cyan

        $backup = "lambda-env-backup-$fn.json"
        aws lambda get-function-configuration --function-name $fn --query "Environment.Variables" --output json | Out-File $backup -Encoding utf8
        Write-Host "  백업: $backup" -ForegroundColor DarkGray

        $vars = Get-Content $backup -Raw | ConvertFrom-Json
        Write-JsonNoBom "lambda-env-rollback-$fn.json" (@{ Variables = $vars } | ConvertTo-Json -Depth 5 -Compress)
        if (-not $vars.REDIS_HOST) {
            Write-Host "  REDIS_HOST 없음 - 건너뜀" -ForegroundColor Yellow
            continue
        }

        $before = @($vars.PSObject.Properties).Count
        Write-Host "  기존 REDIS_HOST: $($vars.REDIS_HOST)"
        $vars.REDIS_HOST = $newEp

        $payload = "lambda-env-new-$fn.json"
        Write-JsonNoBom $payload (@{ Variables = $vars } | ConvertTo-Json -Depth 5 -Compress)
        Write-Host "  신규 REDIS_HOST: $newEp"
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

    Write-Host ""
    Write-Host "[검증 필수]" -ForegroundColor Yellow
    Write-Host "  1. 엑셀 업로드 시 진행률 표시 정상" -ForegroundColor Yellow
    Write-Host "  2. Lambda 환경변수 개수가 교체 전과 동일" -ForegroundColor Yellow
    Write-Host "  3. 구 클러스터($OLD_REDIS_ID)는 1주 존치 후 삭제" -ForegroundColor Yellow
}
