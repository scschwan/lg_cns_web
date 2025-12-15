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
    Write-Host "현재 버전: $currentVersion" -ForegroundColor Cyan

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

Write-Host "새 버전: $newVersion" -ForegroundColor Green
$newVersion | Out-File -FilePath $VERSION_FILE -Encoding UTF8 -NoNewline

# ========================================
# 배포 시작
# ========================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "배포 시작: v$newVersion" -ForegroundColor Cyan
Write-Host "메시지: $Message" -ForegroundColor Cyan
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
Write-Host "`n[2/8] JAR 빌드..." -ForegroundColor Yellow
.\gradlew clean bootJar
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 3. Docker 빌드
Write-Host "`n[3/8] Docker 이미지 빌드..." -ForegroundColor Yellow
docker build -t ${IMAGE_NAME}:latest .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 4. ECR 로그인
Write-Host "`n[4/8] ECR 로그인..." -ForegroundColor Yellow
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 5. 이미지 태그
Write-Host "`n[5/8] 이미지 태그 생성..." -ForegroundColor Yellow
$ECR_REPO = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${IMAGE_NAME}"
docker tag ${IMAGE_NAME}:latest ${ECR_REPO}:v${newVersion}
docker tag ${IMAGE_NAME}:latest ${ECR_REPO}:latest

# 6. ECR 푸시
Write-Host "`n[6/8] ECR 푸시..." -ForegroundColor Yellow
docker push ${ECR_REPO}:v${newVersion}
docker push ${ECR_REPO}:latest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 7. ECS 배포
Write-Host "`n[7/8] ECS 서비스 업데이트..." -ForegroundColor Yellow
aws ecs update-service `
    --cluster $CLUSTER `
    --service $SERVICE `
    --force-new-deployment `
    --region $AWS_REGION `
    --no-cli-pager
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 8. 완료
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "배포 완료! v$newVersion" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Host "`n배포 상태 확인 (5-7분 소요):" -ForegroundColor Cyan
Write-Host "aws ecs describe-services --cluster $CLUSTER --service $SERVICE --query 'services[0].deployments' --region $AWS_REGION" -ForegroundColor Gray
