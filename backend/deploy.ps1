# ========================================
# AWS ECS + Lambda 자동 배포 스크립트
# ========================================

param(
    [string]$Message = "auto deployment"
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
Write-Host "[1/12] Git Commit..." -ForegroundColor Yellow
git add .
git commit -m "deploy: v$newVersion - $Message"
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "Git push failed. continue logic..." -ForegroundColor Yellow
}

# ========================================
# Spring Boot 배포
# ========================================

# 2. JAR 빌드 (Spring Boot + Lambda 동시 빌드)
Write-Host "`n[2/12] JAR Build (Spring Boot + Lambda)..." -ForegroundColor Yellow
.\gradlew clean build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 3. Docker 빌드
Write-Host "`n[3/12] Docker Image Build..." -ForegroundColor Yellow
docker build -t ${IMAGE_NAME}:latest .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 4. ECR 로그인
Write-Host "`n[4/12] ECR Login..." -ForegroundColor Yellow
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 5. 이미지 태그
Write-Host "`n[5/12] Create Docker Image Tag..." -ForegroundColor Yellow
$ECR_REPO = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${IMAGE_NAME}"
docker tag ${IMAGE_NAME}:latest ${ECR_REPO}:v${newVersion}

# 6. ECR 푸시
Write-Host "`n[6/12] ECR Push..." -ForegroundColor Yellow
docker push ${ECR_REPO}:v${newVersion}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 7. Task Definition 새 Revision 등록
Write-Host "`n[7/12] Task Definition new Revision insert..." -ForegroundColor Yellow

if (Test-Path "task-def-template.json") {
    Write-Host "use template File: task-def-template.json" -ForegroundColor Cyan
    $taskDefJson = Get-Content "task-def-template.json" -Raw
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
Write-Host "`n[8/12] ECS Service Update..." -ForegroundColor Yellow
aws ecs update-service `
    --cluster $CLUSTER `
    --service $SERVICE `
    --task-definition $TASK_FAMILY `
    --force-new-deployment `
    --region $AWS_REGION `
    --no-cli-pager
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# ========================================
# Lambda 배포 (추가)
# ========================================

# 9. Lambda ZIP 파일 확인
Write-Host "`n[9/12] Lambda ZIP Check..." -ForegroundColor Yellow
$LAMBDA_ZIP = "lambda\build\distributions\finance-lambda.zip"
if (!(Test-Path $LAMBDA_ZIP)) {
    Write-Host "Lambda ZIP not Found: $LAMBDA_ZIP" -ForegroundColor Red
    Write-Host "Lambda build Failed!! Lambda Deploy Skip." -ForegroundColor Yellow
} else {
    $zipSize = (Get-Item $LAMBDA_ZIP).Length / 1MB
    Write-Host "Lambda ZIP Find: $LAMBDA_ZIP ($([math]::Round($zipSize, 2)) MB)" -ForegroundColor Green

    # 10. Lambda Coordinator 배포
    Write-Host "`n[10/12] Lambda Coordinator Deploy..." -ForegroundColor Yellow
    try {
        aws lambda update-function-code `
            --function-name ExcelCoordinator `
            --zip-file fileb://$LAMBDA_ZIP `
            --region $AWS_REGION `
            --no-cli-pager

        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Coordinator Deploy Complete!" -ForegroundColor Green
        } else {
            Write-Host "⚠️ Coordinator Deploy Failed! (Check if Function exists)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️ Coordinator Deploy Failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    # 11. Lambda Worker 배포
    Write-Host "`n[11/12] Lambda Worker Deploy..." -ForegroundColor Yellow
    try {
        aws lambda update-function-code `
            --function-name ExcelWorker `
            --zip-file fileb://$LAMBDA_ZIP `
            --region $AWS_REGION `
            --no-cli-pager

        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Worker Deploy Complete!" -ForegroundColor Green
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

# 12. 완료
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