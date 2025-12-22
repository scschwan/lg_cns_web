Write-Host "`n=== ECS Task Definition Update (Redis Cluster) ===" -ForegroundColor Green

# 1. Get Redis Cluster Endpoint
Write-Host "`n[1/5] Getting Redis Cluster endpoint..." -ForegroundColor Cyan

$cluster = aws elasticache describe-cache-clusters `
  --cache-cluster-id finance-redis-cluster `
  --show-cache-node-info `
  --region ap-northeast-2 | ConvertFrom-Json

$redisHost = $cluster.CacheClusters[0].CacheNodes[0].Endpoint.Address
$redisPort = $cluster.CacheClusters[0].CacheNodes[0].Endpoint.Port

Write-Host "Redis Cluster Endpoint: ${redisHost}:${redisPort}" -ForegroundColor Yellow

# 2. Get Current Task Definition
Write-Host "`n[2/5] Getting current Task Definition..." -ForegroundColor Cyan

$serviceInfo = aws ecs describe-services `
  --cluster finance-cluster `
  --services finance-api `
  --region ap-northeast-2 | ConvertFrom-Json

$currentTaskDefArn = $serviceInfo.services[0].taskDefinition

$taskDef = aws ecs describe-task-definition `
  --task-definition $currentTaskDefArn `
  --region ap-northeast-2 | ConvertFrom-Json

$taskDefDetail = $taskDef.taskDefinition

Write-Host "Current: $($taskDefDetail.family):$($taskDefDetail.revision)" -ForegroundColor Yellow

# 3. Update Environment Variables
Write-Host "`n[3/5] Updating environment variables..." -ForegroundColor Cyan

$container = $taskDefDetail.containerDefinitions[0]
$envVars = @($container.environment)

# Update REDIS_HOST
$redisHostFound = $false
foreach ($env in $envVars) {
    if ($env.name -eq "REDIS_HOST") {
        $env.value = $redisHost
        $redisHostFound = $true
        Write-Host "  REDIS_HOST: $($env.value)" -ForegroundColor Green
    }
}
if (-not $redisHostFound) {
    $envVars += @{name="REDIS_HOST"; value=$redisHost}
    Write-Host "  REDIS_HOST: ${redisHost} (added)" -ForegroundColor Green
}

# Update REDIS_PORT
$redisPortFound = $false
foreach ($env in $envVars) {
    if ($env.name -eq "REDIS_PORT") {
        $env.value = $redisPort.ToString()
        $redisPortFound = $true
        Write-Host "  REDIS_PORT: $($env.value)" -ForegroundColor Green
    }
}
if (-not $redisPortFound) {
    $envVars += @{name="REDIS_PORT"; value=$redisPort.ToString()}
    Write-Host "  REDIS_PORT: ${redisPort} (added)" -ForegroundColor Green
}

$container.environment = $envVars

# 4. Create New Task Definition JSON
Write-Host "`n[4/5] Registering new Task Definition..." -ForegroundColor Cyan

$newTaskDefJson = @{
    family = $taskDefDetail.family
    taskRoleArn = $taskDefDetail.taskRoleArn
    executionRoleArn = $taskDefDetail.executionRoleArn
    networkMode = $taskDefDetail.networkMode
    containerDefinitions = @($container)
    requiresCompatibilities = $taskDefDetail.requiresCompatibilities
    cpu = $taskDefDetail.cpu
    memory = $taskDefDetail.memory
} | ConvertTo-Json -Depth 10

# Save to temp file (UTF8 without BOM)
$tempFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tempFile, $newTaskDefJson, [System.Text.Encoding]::UTF8)

Write-Host "Task Definition JSON saved to: $tempFile" -ForegroundColor Gray

# Register new task definition
try {
    $registerResult = aws ecs register-task-definition `
      --cli-input-json "file://$tempFile" `
      --region ap-northeast-2 | ConvertFrom-Json

    $newTaskDefArn = $registerResult.taskDefinition.taskDefinitionArn
    $newRevision = $registerResult.taskDefinition.revision

    Write-Host "New Task Definition: $($registerResult.taskDefinition.family):${newRevision}" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to register Task Definition" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Remove-Item $tempFile
    exit 1
}

Remove-Item $tempFile

# 5. Update ECS Service
Write-Host "`n[5/5] Updating ECS Service..." -ForegroundColor Cyan

try {
    aws ecs update-service `
      --cluster finance-cluster `
      --service finance-api `
      --task-definition $newTaskDefArn `
      --force-new-deployment `
      --region ap-northeast-2 | Out-Null

    Write-Host "ECS Service update initiated!" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to update ECS Service" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# 6. Monitor Deployment
Write-Host "`nMonitoring deployment..." -ForegroundColor Cyan
Write-Host "This will take 5-10 minutes..." -ForegroundColor Yellow
Write-Host ""

$maxWait = 600
$elapsed = 0

while ($elapsed -lt $maxWait) {
    $serviceInfo = aws ecs describe-services `
      --cluster finance-cluster `
      --services finance-api `
      --region ap-northeast-2 | ConvertFrom-Json

    $deployments = $serviceInfo.services[0].deployments

    Write-Host "Deployments:" -ForegroundColor Cyan
    foreach ($dep in $deployments) {
        $status = $dep.status
        $desired = $dep.desiredCount
        $running = $dep.runningCount
        $taskDefRev = $dep.taskDefinition -replace ".*:", ""

        if ($status -eq "PRIMARY") {
            Write-Host "  [PRIMARY] Rev:${taskDefRev} Desired:${desired} Running:${running}" -ForegroundColor Green
        } else {
            Write-Host "  [${status}] Rev:${taskDefRev} Desired:${desired} Running:${running}" -ForegroundColor Yellow
        }
    }

    # Check if only PRIMARY deployment exists
    if ($deployments.Count -eq 1 -and $deployments[0].status -eq "PRIMARY") {
        Write-Host "`nDeployment complete!" -ForegroundColor Green
        break
    }

    Start-Sleep -Seconds 15
    $elapsed += 15
    Write-Host ""
}

if ($elapsed -ge $maxWait) {
    Write-Host "Timeout! Check manually:" -ForegroundColor Red
    Write-Host "  aws ecs describe-services --cluster finance-cluster --services finance-api --region ap-northeast-2" -ForegroundColor Gray
}

Write-Host "`n=== ECS Update Complete! ===" -ForegroundColor Green
Write-Host "`nNext Steps:" -ForegroundColor Cyan
Write-Host "  1. Check ECS logs:" -ForegroundColor White
Write-Host "     aws logs tail /ecs/finance-backend --since 5m --follow --region ap-northeast-2" -ForegroundColor Gray
Write-Host "  2. Test Redis connection from Spring Boot" -ForegroundColor White
Write-Host "  3. Test file upload + status endpoint" -ForegroundColor White
Write-Host "`nOptional: Delete Redis Serverless (save cost):" -ForegroundColor Cyan
Write-Host "  aws elasticache delete-serverless-cache --serverless-cache-name finance-redis2 --region ap-northeast-2" -ForegroundColor Gray