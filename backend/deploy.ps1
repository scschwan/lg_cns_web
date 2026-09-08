# ========================================
# AWS ECS + Lambda 자동 배포 스크립트
# ========================================

param(
    [string]$Message = "auto deployment",
    # git 단계를 건너뛴다. 이미 직접 커밋했거나 배포만 하려는 경우 사용한다.
    [switch]$SkipGit,
    # 사전 점검에서 뒤처진 저장소로 판정돼도 강행한다.
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# 설정
$AWS_ACCOUNT_ID = "659002796326"
$AWS_REGION = "ap-northeast-2"
$IMAGE_NAME = "finance-backend"
$CLUSTER = "finance-cluster"
$SERVICE = "finance-api"
$TASK_FAMILY = "finance-backend-task"

# 버전 파일 경로
$VERSION_FILE = "version.txt"

# ========================================
# 0. 사전 점검 - 저장소가 최신인지, 배포 설정이 유효한지
# ========================================
# 여러 클론에서 배포하다 뒤처진 복사본으로 배포하면, 이미 삭제된 리소스를 가리키는
# task definition 이 등록돼 서비스가 끊긴다. 실제로 2026-09-08 에 발생했다.
Write-Host "[0/14] Pre-check..." -ForegroundColor Yellow

# task-def 템플릿이 유효한 JSON 인지 먼저 본다.
# JSON 은 주석을 허용하지 않는데 // 로 항목을 주석 처리한 사례가 있었다.
if (Test-Path "task-def-template.json") {
    try {
        Get-Content "task-def-template.json" -Raw | ConvertFrom-Json | Out-Null
        Write-Host "  task-def-template.json : 유효" -ForegroundColor DarkGray
    }
    catch {
        Write-Host "  task-def-template.json 이 유효한 JSON 이 아닙니다." -ForegroundColor Red
        Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "  JSON 은 // 주석을 허용하지 않습니다. 해당 줄을 지우세요." -ForegroundColor Yellow
        exit 1
    }
}

# 원격보다 뒤처진 상태인지 확인한다.
git fetch origin --quiet 2>$null
if ($LASTEXITCODE -eq 0) {
    $branch = git rev-parse --abbrev-ref HEAD
    $behind = git rev-list --count "HEAD..origin/$branch" 2>$null
    if ($LASTEXITCODE -eq 0 -and $behind -and [int]$behind -gt 0) {
        Write-Host ""
        Write-Host "  이 저장소가 origin/$branch 보다 $behind 커밋 뒤처져 있습니다." -ForegroundColor Red
        Write-Host "  뒤처진 상태로 배포하면 옛 설정이 운영에 등록됩니다." -ForegroundColor Red
        Write-Host "  git pull 로 최신화한 뒤 다시 실행하세요." -ForegroundColor Yellow
        Write-Host "  (의도한 것이라면 -Force 로 진행할 수 있습니다.)" -ForegroundColor Yellow
        if (-not $Force) { exit 1 }
        Write-Host "  -Force 지정됨 - 계속 진행합니다." -ForegroundColor Yellow
    }
    elseif ($LASTEXITCODE -ne 0) {
        Write-Host "  원격 추적 브랜치가 없어 최신 여부를 확인하지 못했습니다." -ForegroundColor Yellow
    }
    else {
        Write-Host "  저장소 최신 상태" -ForegroundColor DarkGray
    }
}

# ========================================
# 버전 자동 증가
# ========================================
if (Test-Path $VERSION_FILE) {
    $currentVersion = Get-Content $VERSION_FILE
    Write-Host "current-version: $currentVersion" -ForegroundColor Cyan

    # 버전 파싱 (1.1.0 -> 1, 1, 0)
    $parts = $currentVersion.Split('.')
    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    $patch = [int]$parts[2]

    # Patch 버전 증가
    $patch++
    $newVersion = "$major.$minor.$patch"
} else {
    # 버전 파일이 없으면 1.0.0부터 시작
    $newVersion = "1.0.0"
}

Write-Host "new version: $newVersion" -ForegroundColor Green
$newVersion | Out-File -FilePath $VERSION_FILE -Encoding UTF8 -NoNewline

# ========================================
# 배포 시작
# ========================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "deploy Start: v$newVersion" -ForegroundColor Cyan
Write-Host "massage: $Message" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. Git Commit
# git add . 는 .gitignore 에 걸리지 않은 무관한 파일(문서, 스크립트, 산출물)까지
# 배포 커밋에 쓸어담는다. 배포에 직접 관련된 파일만 명시적으로 스테이징한다.
if ($SkipGit) {
    Write-Host "[1/14] Git Commit... (SkipGit)" -ForegroundColor DarkGray
}
else {
    Write-Host "[1/14] Git Commit..." -ForegroundColor Yellow

    foreach ($f in @("version.txt", "task-def-template.json")) {
        if (Test-Path $f) { git add -- $f }
    }

    # 소스 변경은 이 스크립트가 임의로 담지 않는다. 남아 있으면 알리고 멈춘다.
    $dirty = git status --porcelain -- src Dockerfile build.gradle lambda
    if ($dirty) {
        Write-Host ""
        Write-Host "커밋되지 않은 소스 변경이 있습니다." -ForegroundColor Red
        $dirty | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
        Write-Host "   먼저 직접 커밋하거나 -SkipGit 으로 실행하세요." -ForegroundColor Yellow
        exit 1
    }

    if (git diff --cached --name-only) {
        git commit -m "deploy: v$newVersion - $Message"
    }
    else {
        Write-Host "커밋할 변경 없음" -ForegroundColor DarkGray
    }

    git push
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Git push failed. continue logic..." -ForegroundColor Yellow
    }
}

# ========================================
# Spring Boot 배포
# ========================================

# 2. JAR 빌드 (Spring Boot + Lambda 동시 빌드)
Write-Host "`n[2/14] JAR Build (Spring Boot + Lambda)..." -ForegroundColor Yellow
.\gradlew clean build  -x test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 3. Docker 빌드
Write-Host "`n[3/14] Docker Image Build..." -ForegroundColor Yellow
docker build -t ${IMAGE_NAME}:latest .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 4. ECR 로그인
# Windows PowerShell 5.1 에서는 --password-stdin 이 400 Bad Request 로 실패한다.
# 파이프로 넘길 때 인코딩이 깨지기 때문이다. 먼저 시도하고 실패하면 --password 로 넘어간다.
Write-Host "`n[4/14] ECR Login..." -ForegroundColor Yellow
$ecrRegistry = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
$ecrPassword = aws ecr get-login-password --region $AWS_REGION
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($ecrPassword)) {
    Write-Host "ECR 토큰 발급 실패" -ForegroundColor Red
    exit 1
}

$ecrPassword | docker login --username AWS --password-stdin $ecrRegistry
if ($LASTEXITCODE -ne 0) {
    Write-Host "--password-stdin 실패. --password 방식으로 재시도합니다." -ForegroundColor Yellow
    docker login --username AWS --password $ecrPassword $ecrRegistry
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# 5. 이미지 태그
Write-Host "`n[5/14] Create Docker Image Tag..." -ForegroundColor Yellow
$ECR_REPO = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${IMAGE_NAME}"
docker tag ${IMAGE_NAME}:latest ${ECR_REPO}:v${newVersion}

# 6. ECR 푸시
Write-Host "`n[6/14] ECR Push..." -ForegroundColor Yellow
docker push ${ECR_REPO}:v${newVersion}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 7. Task Definition 새 Revision 등록
Write-Host "`n[7/14] Task Definition new Revision insert..." -ForegroundColor Yellow

if (Test-Path "task-def-template.json") {
    Write-Host "use template File: task-def-template.json" -ForegroundColor Cyan
    $taskDefJson = Get-Content "task-def-template.json" -Raw
    $taskDefJson = $taskDefJson -replace "PLACEHOLDER_IMAGE", "${ECR_REPO}:v${newVersion}"
} else {
    Write-Host "Downloading Current Task Definition .." -ForegroundColor Cyan
    $taskDefRaw = aws ecs describe-task-definition `
        --task-definition $TASK_FAMILY `
        --query 'taskDefinition' `
        --region $AWS_REGION `
        --output json

    $taskDef = $taskDefRaw | ConvertFrom-Json

    # 불필요한 필드 제거
    $taskDef.PSObject.Properties.Remove('taskDefinitionArn')
    $taskDef.PSObject.Properties.Remove('revision')
    $taskDef.PSObject.Properties.Remove('status')
    $taskDef.PSObject.Properties.Remove('requiresAttributes')
    $taskDef.PSObject.Properties.Remove('compatibilities')
    $taskDef.PSObject.Properties.Remove('registeredAt')
    $taskDef.PSObject.Properties.Remove('registeredBy')

    $taskDef.containerDefinitions[0].image = "${ECR_REPO}:v${newVersion}"

    $taskDefJson = $taskDef | ConvertTo-Json -Depth 10 -Compress
}

[System.IO.File]::WriteAllText(
    (Join-Path $PWD "task-def-temp.json"),
    $taskDefJson,
    [System.Text.UTF8Encoding]::new($false)
)

aws ecs register-task-definition `
    --cli-input-json file://task-def-temp.json `
    --region $AWS_REGION `
    --no-cli-pager

if ($LASTEXITCODE -ne 0) {
    Write-Host "Task Definition insert Failed!!!" -ForegroundColor Red
    exit $LASTEXITCODE
}

Remove-Item "task-def-temp.json" -ErrorAction SilentlyContinue

# 8. ECS 서비스 업데이트
Write-Host "`n[8/14] ECS Service Update..." -ForegroundColor Yellow
aws ecs update-service `
    --cluster $CLUSTER `
    --service $SERVICE `
    --task-definition $TASK_FAMILY `
    --force-new-deployment `
    --health-check-grace-period-seconds 120 `
    --region $AWS_REGION `
    --no-cli-pager
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# ========================================
# Lambda 배포 (추가)
# ========================================

# 9. Lambda ZIP 파일 확인
Write-Host "`n[9/14] Lambda ZIP Check..." -ForegroundColor Yellow
$LAMBDA_ZIP = "lambda\build\distributions\finance-lambda.zip"
if (!(Test-Path $LAMBDA_ZIP)) {
    Write-Host "Lambda ZIP not Found: $LAMBDA_ZIP" -ForegroundColor Red
    Write-Host "Lambda build Failed!! Lambda Deploy Skip." -ForegroundColor Yellow
} else {
    $zipSize = (Get-Item $LAMBDA_ZIP).Length / 1MB
    Write-Host "Lambda ZIP Find: $LAMBDA_ZIP ($([math]::Round($zipSize, 2)) MB)" -ForegroundColor Green

    # 10. Lambda Coordinator 배포 (코드 + 구성)
    Write-Host "`n[10/14] Lambda Coordinator Code Deploy..." -ForegroundColor Yellow
    try {
        aws lambda update-function-code `
            --function-name ExcelCoordinator `
            --zip-file fileb://$LAMBDA_ZIP `
            --region $AWS_REGION `
            --no-cli-pager

        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Coordinator Code Deploy Complete!" -ForegroundColor Green

            # 코드 업데이트 완료 대기
            Write-Host "Waiting for Coordinator update..." -ForegroundColor Gray
            aws lambda wait function-updated `
                --function-name ExcelCoordinator `
                --region $AWS_REGION

            # 구성 업데이트 (Memory: 1024MB, Timeout: 300s)
            Write-Host "`n[11/14] Lambda Coordinator Config Update..." -ForegroundColor Yellow
            aws lambda update-function-configuration `
                --function-name ExcelCoordinator `
                --memory-size 1024 `
                --timeout 900 `
                --region $AWS_REGION `
                --no-cli-pager

            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Coordinator Config Updated (1024MB, 900s)" -ForegroundColor Green
            }
        } else {
            Write-Host "⚠️ Coordinator Deploy Failed! (Check if Function exists)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️ Coordinator Deploy Failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    # 12. Lambda Worker 배포 (코드 + 구성)
    Write-Host "`n[12/14] Lambda Worker Code Deploy..." -ForegroundColor Yellow
    try {
        aws lambda update-function-code `
            --function-name ExcelWorker `
            --zip-file fileb://$LAMBDA_ZIP `
            --region $AWS_REGION `
            --no-cli-pager

        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Worker Code Deploy Complete!" -ForegroundColor Green

            # 코드 업데이트 완료 대기
            Write-Host "Waiting for Worker update..." -ForegroundColor Gray
            aws lambda wait function-updated `
                --function-name ExcelWorker `
                --region $AWS_REGION

            # 구성 업데이트 (Memory: 1024MB, Timeout: 900s = 15분)
            Write-Host "`n[13/14] Lambda Worker Config Update..." -ForegroundColor Yellow
            aws lambda update-function-configuration `
                --function-name ExcelWorker `
                --memory-size 1024 `
                --timeout 900 `
                --region $AWS_REGION `
                --no-cli-pager

            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Worker Config Updated (1024MB, 900s)" -ForegroundColor Green
            }
        } else {
            Write-Host "⚠️ Worker Deploy Failed! (Check if Function exists)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️ Worker Deploy Failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ========================================
# 배포 완료
# ========================================

# 14. 완료
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Deploy Complete! v$newVersion" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Host "`ndeploy status Check (5-7 min delay):" -ForegroundColor Cyan
Write-Host "ECS: aws ecs describe-services --cluster $CLUSTER --service $SERVICE --query 'services[0].deployments' --region $AWS_REGION" -ForegroundColor Gray
Write-Host "Lambda Coordinator: aws lambda get-function --function-name ExcelCoordinator --region $AWS_REGION" -ForegroundColor Gray
Write-Host "Lambda Worker: aws lambda get-function --function-name ExcelWorker --region $AWS_REGION" -ForegroundColor Gray

# 배포 상태 자동 확인 (ECS만)
Write-Host "`nCheck ECS Deploy Status..." -ForegroundColor Yellow
for ($i = 1; $i -le 10; $i++) {
    Start-Sleep -Seconds 30
    $deployments = aws ecs describe-services `
        --cluster $CLUSTER `
        --service $SERVICE `
        --query 'services[0].deployments' `
        --region $AWS_REGION `
        --output json | ConvertFrom-Json

    $primary = $deployments | Where-Object { $_.status -eq "PRIMARY" }
    if ($primary.runningCount -eq $primary.desiredCount) {
        Write-Host "`n✅ ECS deploy Complete! (Running: $($primary.runningCount)/$($primary.desiredCount))" -ForegroundColor Green
        break
    } else {
        Write-Host "Processing ... (Running: $($primary.runningCount)/$($primary.desiredCount)) - $($i * 30)second wait..." -ForegroundColor Yellow
    }
}