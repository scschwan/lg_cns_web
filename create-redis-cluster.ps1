Write-Host "`n=== Redis Cluster Creation Started ===" -ForegroundColor Green

# 1. Check/Create Subnet Group
Write-Host "`n[1/5] Checking Subnet Group..." -ForegroundColor Cyan

$subnetGroup = aws elasticache describe-cache-subnet-groups `
  --cache-subnet-group-name finance-redis-cluster-subnet `
  --region ap-northeast-2 2>$null | ConvertFrom-Json

if (-not $subnetGroup) {
    Write-Host "Creating Subnet Group..." -ForegroundColor Yellow

    aws elasticache create-cache-subnet-group `
      --cache-subnet-group-name finance-redis-cluster-subnet `
      --cache-subnet-group-description "Redis Cluster Subnet Group" `
      --subnet-ids subnet-0bfa6431b2de4c627 subnet-08cdb7f10fd2f72f4 `
      --region ap-northeast-2

    Write-Host "Subnet Group created!" -ForegroundColor Green
} else {
    Write-Host "Subnet Group already exists!" -ForegroundColor Green
}

# 2. Create Redis Cluster
Write-Host "`n[2/5] Creating Redis Cluster (5 min)..." -ForegroundColor Cyan

aws elasticache create-cache-cluster `
  --cache-cluster-id finance-redis-cluster `
  --cache-node-type cache.t4g.small `
  --engine redis `
  --engine-version 7.1 `
  --num-cache-nodes 1 `
  --cache-subnet-group-name finance-redis-cluster-subnet `
  --security-group-ids sg-02b0bb92322a14665 `
  --region ap-northeast-2

# 3. Wait for availability
Write-Host "`n[3/5] Waiting for cluster to be available..." -ForegroundColor Cyan
$maxWait = 600
$elapsed = 0
$interval = 15

while ($elapsed -lt $maxWait) {
    try {
        $cluster = aws elasticache describe-cache-clusters `
          --cache-cluster-id finance-redis-cluster `
          --region ap-northeast-2 | ConvertFrom-Json

        $status = $cluster.CacheClusters[0].CacheClusterStatus

        Write-Host "  Status: $status ($elapsed/$maxWait seconds)" -ForegroundColor Yellow

        if ($status -eq "available") {
            Write-Host "Redis Cluster is ready!" -ForegroundColor Green
            break
        }
    } catch {
        Write-Host "  Waiting..." -ForegroundColor Yellow
    }

    Start-Sleep -Seconds $interval
    $elapsed += $interval
}

if ($elapsed -ge $maxWait) {
    Write-Host "ERROR: Timeout! Check AWS Console manually." -ForegroundColor Red
    exit 1
}

# 4. Get Endpoint
Write-Host "`n[4/5] Retrieving endpoint..." -ForegroundColor Cyan

$cluster = aws elasticache describe-cache-clusters `
  --cache-cluster-id finance-redis-cluster `
  --show-cache-node-info `
  --region ap-northeast-2 | ConvertFrom-Json

$endpoint = $cluster.CacheClusters[0].CacheNodes[0].Endpoint.Address
$port = $cluster.CacheClusters[0].CacheNodes[0].Endpoint.Port

Write-Host "`nRedis Cluster Information:" -ForegroundColor Green
Write-Host "  Endpoint: $endpoint" -ForegroundColor Yellow
Write-Host "  Port: $port" -ForegroundColor Yellow

# 5. Update Lambda Environment Variables
Write-Host "`n[5/5] Updating Lambda environment variables..." -ForegroundColor Cyan

# ExcelCoordinator
Write-Host "  Updating ExcelCoordinator..." -ForegroundColor Yellow

$coordEnv = aws lambda get-function-configuration `
  --function-name ExcelCoordinator `
  --query 'Environment.Variables' `
  --region ap-northeast-2 | ConvertFrom-Json

$coordEnv.REDIS_HOST = $endpoint
$coordEnv.REDIS_PORT = $port.ToString()

$coordEnvJson = ($coordEnv | ConvertTo-Json -Compress).Replace('"', '\"')

aws lambda update-function-configuration `
  --function-name ExcelCoordinator `
  --environment "{`"Variables`":$coordEnvJson}" `
  --region ap-northeast-2 | Out-Null

Write-Host "  ExcelCoordinator updated!" -ForegroundColor Green

# ExcelWorker
Write-Host "  Updating ExcelWorker..." -ForegroundColor Yellow

$workerEnv = aws lambda get-function-configuration `
  --function-name ExcelWorker `
  --query 'Environment.Variables' `
  --region ap-northeast-2 | ConvertFrom-Json

$workerEnv.REDIS_HOST = $endpoint
$workerEnv.REDIS_PORT = $port.ToString()

$workerEnvJson = ($workerEnv | ConvertTo-Json -Compress).Replace('"', '\"')

aws lambda update-function-configuration `
  --function-name ExcelWorker `
  --environment "{`"Variables`":$workerEnvJson}" `
  --region ap-northeast-2 | Out-Null

Write-Host "  ExcelWorker updated!" -ForegroundColor Green

# Complete
Write-Host "`n=== Redis Cluster Migration Complete! ===" -ForegroundColor Green
Write-Host "`nNext Steps:" -ForegroundColor Cyan
Write-Host "  1. Test file upload" -ForegroundColor White
Write-Host "  2. Check status endpoint (progress should display immediately)" -ForegroundColor White
Write-Host "  3. Delete Redis Serverless (save cost):" -ForegroundColor White
Write-Host "     aws elasticache delete-serverless-cache --serverless-cache-name finance-redis2 --region ap-northeast-2" -ForegroundColor Gray
Write-Host "`nCost Change:" -ForegroundColor Cyan
Write-Host "  Before: ~$15/month (Serverless, but not working)" -ForegroundColor White
Write-Host "  After:  ~$24/month (Cluster, working perfectly)" -ForegroundColor White
Write-Host "  Additional: +$9/month for reliable service" -ForegroundColor Yellow