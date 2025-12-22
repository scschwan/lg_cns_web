# Lambda-Redis Connection Diagnostic Script (Serverless Support)
Write-Host "`n=== Lambda-Redis Connection Diagnostic (v2) ===" -ForegroundColor Green
Write-Host "Region: ap-northeast-2`n" -ForegroundColor Green

# 1. Lambda Coordinator VPC Configuration
Write-Host "`n[1/10] Lambda Coordinator VPC Configuration" -ForegroundColor Cyan
$coordinatorVpc = aws lambda get-function-configuration `
  --function-name ExcelCoordinator `
  --query 'VpcConfig' `
  --region ap-northeast-2 | ConvertFrom-Json

Write-Host "VPC ID: $($coordinatorVpc.VpcId)" -ForegroundColor Yellow
Write-Host "Subnets: $($coordinatorVpc.SubnetIds -join ', ')" -ForegroundColor Yellow
Write-Host "Security Groups: $($coordinatorVpc.SecurityGroupIds -join ', ')" -ForegroundColor Yellow

# 2. Lambda Worker VPC Configuration
Write-Host "`n[2/10] Lambda Worker VPC Configuration (for comparison)" -ForegroundColor Cyan
$workerVpc = aws lambda get-function-configuration `
  --function-name ExcelWorker `
  --query 'VpcConfig' `
  --region ap-northeast-2 | ConvertFrom-Json

Write-Host "VPC ID: $($workerVpc.VpcId)" -ForegroundColor Yellow
Write-Host "Subnets: $($workerVpc.SubnetIds -join ', ')" -ForegroundColor Yellow
Write-Host "Security Groups: $($workerVpc.SecurityGroupIds -join ', ')" -ForegroundColor Yellow

# 3. Environment Variables
Write-Host "`n[3/10] Lambda Coordinator Environment Variables" -ForegroundColor Cyan
$coordinatorEnv = aws lambda get-function-configuration `
  --function-name ExcelCoordinator `
  --query 'Environment.Variables' `
  --region ap-northeast-2 | ConvertFrom-Json

Write-Host "REDIS_HOST: $($coordinatorEnv.REDIS_HOST)" -ForegroundColor Yellow
Write-Host "REDIS_PORT: $($coordinatorEnv.REDIS_PORT)" -ForegroundColor Yellow

# 4. Try Redis Serverless First
Write-Host "`n[4/10] Detecting Redis Type..." -ForegroundColor Cyan

$redisEndpoint = $null
$redisPort = $null
$redisSGIds = @()
$redisType = "Unknown"

# Check if Serverless (based on endpoint name)
if ($coordinatorEnv.REDIS_HOST -match "serverless") {
    Write-Host "Detected: ElastiCache Serverless" -ForegroundColor Green
    $redisType = "Serverless"

    try {
        $redisServerless = aws elasticache describe-serverless-caches `
          --serverless-cache-name finance-redis2 `
          --region ap-northeast-2 2>$null | ConvertFrom-Json

        if ($redisServerless.ServerlessCaches) {
            $redisEndpoint = $redisServerless.ServerlessCaches[0].Endpoint.Address
            $redisPort = $redisServerless.ServerlessCaches[0].Endpoint.Port
            $redisSGIds = $redisServerless.ServerlessCaches[0].SecurityGroupIds

            Write-Host "Serverless Cache Name: finance-redis2" -ForegroundColor Yellow
            Write-Host "Endpoint: $redisEndpoint" -ForegroundColor Yellow
            Write-Host "Port: $redisPort" -ForegroundColor Yellow
            Write-Host "Security Groups: $($redisSGIds -join ', ')" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "ERROR: Could not find Serverless cache 'finance-redis2'" -ForegroundColor Red
    }
} else {
    Write-Host "Detected: ElastiCache Cluster (traditional)" -ForegroundColor Green
    $redisType = "Cluster"

    try {
        $redisCluster = aws elasticache describe-cache-clusters `
          --cache-cluster-id finance-redis2 `
          --show-cache-node-info `
          --region ap-northeast-2 2>$null | ConvertFrom-Json

        if ($redisCluster.CacheClusters) {
            $redisEndpoint = $redisCluster.CacheClusters[0].CacheNodes[0].Endpoint.Address
            $redisPort = $redisCluster.CacheClusters[0].CacheNodes[0].Endpoint.Port
            $redisSGIds = @($redisCluster.CacheClusters[0].SecurityGroups[0].SecurityGroupId)

            Write-Host "Cluster ID: finance-redis2" -ForegroundColor Yellow
            Write-Host "Endpoint: $redisEndpoint" -ForegroundColor Yellow
            Write-Host "Port: $redisPort" -ForegroundColor Yellow
            Write-Host "Security Groups: $($redisSGIds -join ', ')" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "ERROR: Could not find cluster 'finance-redis2'" -ForegroundColor Red
    }
}

# 5. Redis Address Comparison
Write-Host "`n[5/10] Redis Address Comparison" -ForegroundColor Cyan
if ($redisEndpoint -and $coordinatorEnv.REDIS_HOST -eq $redisEndpoint) {
    Write-Host "OK: Environment variable matches actual endpoint!" -ForegroundColor Green
} elseif (-not $redisEndpoint) {
    Write-Host "ERROR: Could not retrieve Redis endpoint!" -ForegroundColor Red
} else {
    Write-Host "ERROR: Environment variable does NOT match!" -ForegroundColor Red
    Write-Host "   Env Var: $($coordinatorEnv.REDIS_HOST)" -ForegroundColor Red
    Write-Host "   Actual: $redisEndpoint" -ForegroundColor Red
}

# 6. Lambda Security Group Outbound
Write-Host "`n[6/10] Lambda Security Group Outbound Rules" -ForegroundColor Cyan
$coordinatorSGId = $coordinatorVpc.SecurityGroupIds[0]
$coordinatorSG = aws ec2 describe-security-groups `
  --group-ids $coordinatorSGId `
  --region ap-northeast-2 | ConvertFrom-Json

Write-Host "Security Group ID: $coordinatorSGId" -ForegroundColor Yellow

$hasAllOutbound = $false
foreach ($rule in $coordinatorSG.SecurityGroups[0].IpPermissionsEgress) {
    $protocol = if ($rule.IpProtocol -eq '-1') { 'All' } else { $rule.IpProtocol }
    $port = if ($rule.FromPort) { "$($rule.FromPort)-$($rule.ToPort)" } else { 'All' }
    $dest = if ($rule.IpRanges[0].CidrIp) { $rule.IpRanges[0].CidrIp } else { 'N/A' }

    Write-Host "  Protocol: $protocol, Port: $port, Dest: $dest" -ForegroundColor White

    if ($rule.IpProtocol -eq '-1' -and $dest -eq '0.0.0.0/0') {
        $hasAllOutbound = $true
    }
}

if ($hasAllOutbound) {
    Write-Host "OK: Allow all outbound traffic!" -ForegroundColor Green
}

# 7. Redis Security Group Inbound
Write-Host "`n[7/10] Redis Security Group Inbound Rules (Port 6379)" -ForegroundColor Cyan

$hasRedisRule = $false
$coordinatorAllowed = $false

if ($redisSGIds.Count -gt 0) {
    foreach ($redisSGId in $redisSGIds) {
        Write-Host "`nChecking Security Group: $redisSGId" -ForegroundColor Yellow

        $redisSG = aws ec2 describe-security-groups `
          --group-ids $redisSGId `
          --region ap-northeast-2 | ConvertFrom-Json

        foreach ($rule in $redisSG.SecurityGroups[0].IpPermissions) {
            if ($rule.FromPort -eq 6379) {
                $hasRedisRule = $true
                Write-Host "  Protocol: $($rule.IpProtocol), Port: $($rule.FromPort)-$($rule.ToPort)" -ForegroundColor White

                if ($rule.UserIdGroupPairs) {
                    foreach ($sg in $rule.UserIdGroupPairs) {
                        Write-Host "    Source SG: $($sg.GroupId)" -ForegroundColor White
                        if ($coordinatorVpc.SecurityGroupIds -contains $sg.GroupId) {
                            Write-Host "    OK: Lambda Coordinator SG is allowed!" -ForegroundColor Green
                            $coordinatorAllowed = $true
                        }
                    }
                }

                if ($rule.IpRanges) {
                    foreach ($ip in $rule.IpRanges) {
                        Write-Host "    Source IP: $($ip.CidrIp)" -ForegroundColor White
                    }
                }
            }
        }
    }
}

if (-not $hasRedisRule) {
    Write-Host "ERROR: No inbound rule for port 6379!" -ForegroundColor Red
} elseif (-not $coordinatorAllowed) {
    Write-Host "WARNING: Lambda Coordinator SG may not be explicitly allowed!" -ForegroundColor Yellow
}

# 8. VPC Consistency
Write-Host "`n[8/10] VPC Consistency Check" -ForegroundColor Cyan
if ($coordinatorVpc.VpcId -eq $workerVpc.VpcId) {
    Write-Host "OK: Coordinator and Worker are in the same VPC!" -ForegroundColor Green
}

# 9. Network Route Check
Write-Host "`n[9/10] Network Route Check (Subnet to Redis)" -ForegroundColor Cyan
Write-Host "Lambda Subnets:" -ForegroundColor Yellow
foreach ($subnetId in $coordinatorVpc.SubnetIds) {
    $subnet = aws ec2 describe-subnets `
      --subnet-ids $subnetId `
      --query 'Subnets[0].{SubnetId:SubnetId,CIDR:CidrBlock,AZ:AvailabilityZone}' `
      --region ap-northeast-2 | ConvertFrom-Json

    Write-Host "  $($subnet.SubnetId): $($subnet.CIDR) in $($subnet.AZ)" -ForegroundColor White
}

# 10. Final Result
Write-Host "`n[10/10] Final Diagnostic Result" -ForegroundColor Cyan

$issues = @()

if (-not $redisEndpoint) {
    $issues += "Could not find Redis endpoint"
}

if ($redisEndpoint -and $coordinatorEnv.REDIS_HOST -ne $redisEndpoint) {
    $issues += "Redis address mismatch"
}

if (-not $hasRedisRule) {
    $issues += "Redis Security Group missing port 6379 rule"
}

if (-not $coordinatorAllowed) {
    $issues += "Lambda SG not explicitly allowed (but VPC CIDR may work)"
}

if ($issues.Count -eq 0) {
    Write-Host "SUCCESS: Configuration looks correct!" -ForegroundColor Green
    Write-Host "`nPossible causes of timeout:" -ForegroundColor Yellow
    Write-Host "  1. Route table issue (NAT Gateway)" -ForegroundColor White
    Write-Host "  2. Network ACL blocking traffic" -ForegroundColor White
    Write-Host "  3. Redis Serverless cold start" -ForegroundColor White
    Write-Host "  4. Jedis connection timeout setting too low" -ForegroundColor White
} else {
    Write-Host "FOUND ISSUES:" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "   - $issue" -ForegroundColor Red
    }
}

Write-Host "`n=== Redis Type: $redisType ===" -ForegroundColor Cyan
Write-Host "=== Diagnostic Complete ===" -ForegroundColor Green