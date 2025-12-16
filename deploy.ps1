# ========================================
# AWS ECS 자동 배포 스크립트
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
Write-Host "[1/8] Git Commit..." -ForegroundColor Yellow
git add .
git commit -m "deploy: v$newVersion - $Message"
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "Git push 실패. 계속 진행합니다..." -ForegroundColor Yellow
}

# 2. JAR 빌드
Write-Host "`n[2/8] JAR Build..." -ForegroundColor Yellow
.\gradlew clean bootJar
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 3. Docker 빌드
Write-Host "`n[3/8] Docker Image Build..." -ForegroundColor Yellow
docker build -t ${IMAGE_NAME}:latest .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 4. ECR 로그인
Write-Host "`n[4/8] ECR Login..." -ForegroundColor Yellow
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 5. 이미지 태그
Write-Host "`n[5/8] Create Docker Image Tag..." -ForegroundColor Yellow
$ECR_REPO = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${IMAGE_NAME}"
docker tag ${IMAGE_NAME}:latest ${ECR_REPO}:v${newVersion}
docker tag ${IMAGE_NAME}:latest ${ECR_REPO}:latest

# 6. ECR 푸시
Write-Host "`n[6/8] ECR Push..." -ForegroundColor Yellow
docker push ${ECR_REPO}:v${newVersion}
docker push ${ECR_REPO}:latest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }


# ========================================
# ✅ 추가: Task Definition 새 Revision 등록
# ========================================
Write-Host "`n[7/9] Task Definition new Revision insert..." -ForegroundColor Yellow

# Task Definition 템플릿이 있으면 사용, 없으면 현재 것 다운로드
if (Test-Path "task-def-template.json") {
    Write-Host "use template File: task-def-template.json" -ForegroundColor Cyan
    $taskDefJson = Get-Content "task-def-template.json" -Raw
} else {
    Write-Host "Downloading Current Task Definition .." -ForegroundColor Cyan
    # 현재 Task Definition 가져오기
    $taskDefRaw = aws ecs describe-task-definition `
        --task-definition $TASK_FAMILY `
        --query 'taskDefinition' `
        --region $AWS_REGION `
        --output json

    # PowerShell 객체로 변환
    $taskDef = $taskDefRaw | ConvertFrom-Json

    # 불필요한 필드 제거
    $taskDef.PSObject.Properties.Remove('taskDefinitionArn')
    $taskDef.PSObject.Properties.Remove('revision')
    $taskDef.PSObject.Properties.Remove('status')
    $taskDef.PSObject.Properties.Remove('requiresAttributes')
    $taskDef.PSObject.Properties.Remove('compatibilities')
    $taskDef.PSObject.Properties.Remove('registeredAt')
    $taskDef.PSObject.Properties.Remove('registeredBy')

    # 이미지를 latest 태그로 변경 (SHA256 제거)
    $taskDef.containerDefinitions[0].image = "${ECR_REPO}:latest"

    $taskDefJson = $taskDef | ConvertTo-Json -Depth 10
}

# 새 Revision 등록
$taskDefJson | Out-File -FilePath "task-def-temp.json" -Encoding UTF8
aws ecs register-task-definition `
    --cli-input-json file://task-def-temp.json `
    --region $AWS_REGION `
    --no-cli-pager

if ($LASTEXITCODE -ne 0) {
    Write-Host "Task Definition insert Failed!!!" -ForegroundColor Red
    exit $LASTEXITCODE
}

Remove-Item "task-def-temp.json" -ErrorAction SilentlyContinue

# ========================================
# 8. ECS 서비스 업데이트
# ========================================
Write-Host "`n[8/9] ECS Service Update..." -ForegroundColor Yellow
aws ecs update-service `
    --cluster $CLUSTER `
    --service $SERVICE `
    --task-definition $TASK_FAMILY `
    --force-new-deployment `
    --region $AWS_REGION `
    --no-cli-pager
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 9. 완료
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Deploy Complete! v$newVersion" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Host "`ndeploy status Check (5-7 min delay):" -ForegroundColor Cyan
Write-Host "aws ecs describe-services --cluster $CLUSTER --service $SERVICE --query 'services[0].deployments' --region $AWS_REGION" -ForegroundColor Gray
