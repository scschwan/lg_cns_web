# frontend/deploy.ps1
# Usage: .\deploy.ps1

$ErrorActionPreference = "Stop"

# ===== 설정 =====
$S3_BUCKET = "s3://lgcns-finance-frontend-app"
$CLOUDFRONT_DISTRIBUTION_ID = "E2WSY238E3ZG9N"  # CloudFront 콘솔에서 확인 후 교체

# ===== 1. 빌드 =====
Write-Host "[1/4] Building..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed." -ForegroundColor Red
    exit 1
}

# ===== 2. S3 업로드 =====
Write-Host "[2/4] Uploading to S3..." -ForegroundColor Cyan
aws s3 sync ".\dist" $S3_BUCKET --delete
if ($LASTEXITCODE -ne 0) {
    Write-Host "S3 upload failed." -ForegroundColor Red
    exit 1
}

# ===== 3. CloudFront 캐시 무효화 =====
Write-Host "[3/4] Invalidating CloudFront cache..." -ForegroundColor Cyan
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "/*"
if ($LASTEXITCODE -ne 0) {
    Write-Host "CloudFront invalidation failed." -ForegroundColor Red
    exit 1
}

# ===== 4. 완료 =====
Write-Host "[4/4] Deploy complete!" -ForegroundColor Green
Write-Host "CloudFront URL: https://$CLOUDFRONT_DISTRIBUTION_ID 에 해당하는 도메인으로 접속하세요."
