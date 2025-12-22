# UTF-8 Encoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Finance Tool Infrastructure Check" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. DocumentDB Cluster2 Check
Write-Host "1. DocumentDB Cluster2" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray

Write-Host "Subnet Group:" -ForegroundColor Cyan
aws docdb describe-db-subnet-groups `
  --db-subnet-group-name finance-docdb-subnet-group2 `
  --region ap-northeast-2 `
  --query 'DBSubnetGroups[0].Subnets[*].{SubnetId:SubnetIdentifier,AZ:SubnetAvailabilityZone.Name}' `
  --output table

Write-Host "`nCluster Endpoint & Security Group:" -ForegroundColor Cyan
$CLUSTER_INFO = aws docdb describe-db-clusters `
  --db-cluster-identifier finance-docdb-cluster2 `
  --region ap-northeast-2 `
  --query 'DBClusters[0].{Endpoint:Endpoint,Port:Port,SecurityGroup:VpcSecurityGroups[0].VpcSecurityGroupId}' `
  --output json | ConvertFrom-Json

Write-Host "Endpoint: $($CLUSTER_INFO.Endpoint):$($CLUSTER_INFO.Port)" -ForegroundColor White
Write-Host "Security Group: $($CLUSTER_INFO.SecurityGroup)" -ForegroundColor White

Write-Host "`nInstance Location:" -ForegroundColor Cyan
aws docdb describe-db-instances `
  --filters "Name=db-cluster-id,Values=finance-docdb-cluster2" `
  --region ap-northeast-2 `
  --query 'DBInstances[*].{Instance:DBInstanceIdentifier,AZ:AvailabilityZone,Status:DBInstanceStatus}' `
  --output table

# 2. DocumentDB Security Group Inbound Rules
Write-Host "`n2. DocumentDB Security Group Inbound Rules" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray

$DOCDB_SG = $CLUSTER_INFO.SecurityGroup
Write-Host "Security Group ID: $DOCDB_SG" -ForegroundColor Cyan

$DOCDB_RULES = aws ec2 describe-security-groups `
  --group-ids $DOCDB_SG `
  --region ap-northeast-2 `
  --query 'SecurityGroups[0].IpPermissions' `
  --output json | ConvertFrom-Json

Write-Host "`nInbound Rules:" -ForegroundColor White
foreach ($rule in $DOCDB_RULES) {
    if ($rule.FromPort -eq 27017) {
        Write-Host "  Port 27017:" -ForegroundColor Green
        if ($rule.UserIdGroupPairs) {
            foreach ($pair in $rule.UserIdGroupPairs) {
                Write-Host "    - From SG: $($pair.GroupId)" -ForegroundColor White
            }
        }
        if ($rule.IpRanges) {
            foreach ($ip in $rule.IpRanges) {
                Write-Host "    - From IP: $($ip.CidrIp)" -ForegroundColor White
            }
        }
    }
}

# Check if ECS SG is allowed
$ECS_SG_ALLOWED = $false
foreach ($rule in $DOCDB_RULES) {
    if ($rule.FromPort -eq 27017 -and $rule.UserIdGroupPairs.GroupId -contains "sg-0b2f80b067408e320") {
        $ECS_SG_ALLOWED = $true
    }
}

if ($ECS_SG_ALLOWED) {
    Write-Host "`n  [OK] ECS SG (sg-0b2f80b067408e320) is allowed" -ForegroundColor Green
} else {
    Write-Host "`n  [ERROR] ECS SG (sg-0b2f80b067408e320) is NOT allowed!" -ForegroundColor Red
}

# 3. ECS Security Group Outbound Rules
Write-Host "`n3. ECS Security Group Outbound Rules" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray

$ECS_EGRESS = aws ec2 describe-security-groups `
  --group-ids sg-0b2f80b067408e320 `
  --region ap-northeast-2 `
  --query 'SecurityGroups[0].IpPermissionsEgress' `
  --output json | ConvertFrom-Json

Write-Host "Outbound Rules:" -ForegroundColor White
$ALL_TRAFFIC_ALLOWED = $false
foreach ($rule in $ECS_EGRESS) {
    if ($rule.IpProtocol -eq "-1") {
        Write-Host "  - All traffic allowed" -ForegroundColor Green
        $ALL_TRAFFIC_ALLOWED = $true
    } elseif ($rule.FromPort -eq 27017 -or $rule.ToPort -eq 27017) {
        Write-Host "  - Port 27017 allowed" -ForegroundColor Green
    }
}

if ($ALL_TRAFFIC_ALLOWED) {
    Write-Host "`n  [OK] ECS can connect to DocumentDB" -ForegroundColor Green
} else {
    Write-Host "`n  [WARNING] Check if port 27017 is allowed" -ForegroundColor Yellow
}

# 4. Redis2 Check
Write-Host "`n4. Redis2 Check" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray

$REDIS_INFO = aws elasticache describe-serverless-caches `
  --serverless-cache-name finance-redis2 `
  --region ap-northeast-2 `
  --query 'ServerlessCaches[0].{Endpoint:Endpoint.Address,Port:Endpoint.Port,SecurityGroups:SecurityGroupIds,Status:Status}' `
  --output json 2>$null | ConvertFrom-Json

if ($REDIS_INFO) {
    Write-Host "Type: Serverless" -ForegroundColor Cyan
    Write-Host "Endpoint: $($REDIS_INFO.Endpoint):$($REDIS_INFO.Port)" -ForegroundColor White
    Write-Host "Status: $($REDIS_INFO.Status)" -ForegroundColor White
    Write-Host "Security Groups: $($REDIS_INFO.SecurityGroups -join ', ')" -ForegroundColor White
}

# 5. Running ECS Tasks Location
Write-Host "`n5. Running ECS Tasks Location" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray

$TASK_ARNS = aws ecs list-tasks `
  --cluster finance-cluster `
  --service-name finance-api `
  --region ap-northeast-2 `
  --query 'taskArns' `
  --output text

if ($TASK_ARNS) {
    aws ecs describe-tasks `
      --cluster finance-cluster `
      --tasks $TASK_ARNS.Split() `
      --region ap-northeast-2 `
      --query 'tasks[*].{Subnet:attachments[0].details[?name==`subnetId`].value|[0],PrivateIP:attachments[0].details[?name==`privateIPv4Address`].value|[0]}' `
      --output table
}

# 6. Private Subnet Route Tables
Write-Host "`n6. Private Subnet Route Tables" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray

Write-Host "2a Private (subnet-0bfa6431b2de4c627):" -ForegroundColor Cyan
$RT_2A = aws ec2 describe-route-tables `
  --filters "Name=association.subnet-id,Values=subnet-0bfa6431b2de4c627" `
  --region ap-northeast-2 `
  --query 'RouteTables[0].Routes[*].{Destination:DestinationCidrBlock,NatGateway:NatGatewayId}' `
  --output json | ConvertFrom-Json

$NAT_2A = $false
foreach ($route in $RT_2A) {
    Write-Host "  $($route.Destination) -> $($route.NatGateway)" -ForegroundColor White
    if ($route.Destination -eq "0.0.0.0/0" -and $route.NatGateway) {
        $NAT_2A = $true
    }
}

Write-Host "`n2c Private (subnet-08cdb7f10fd2f72f4):" -ForegroundColor Cyan
$RT_2C = aws ec2 describe-route-tables `
  --filters "Name=association.subnet-id,Values=subnet-08cdb7f10fd2f72f4" `
  --region ap-northeast-2 `
  --query 'RouteTables[0].Routes[*].{Destination:DestinationCidrBlock,NatGateway:NatGatewayId}' `
  --output json | ConvertFrom-Json

$NAT_2C = $false
foreach ($route in $RT_2C) {
    Write-Host "  $($route.Destination) -> $($route.NatGateway)" -ForegroundColor White
    if ($route.Destination -eq "0.0.0.0/0" -and $route.NatGateway) {
        $NAT_2C = $true
    }
}

# 7. Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Summary & Issues" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`nChecklist:" -ForegroundColor Yellow

if ($ECS_SG_ALLOWED) {
    Write-Host "[OK]" -ForegroundColor Green -NoNewline
    Write-Host " DocumentDB allows ECS SG (sg-0b2f80b067408e320)" -ForegroundColor White
} else {
    Write-Host "[FAIL]" -ForegroundColor Red -NoNewline
    Write-Host " DocumentDB does NOT allow ECS SG!" -ForegroundColor White
    Write-Host "  FIX: Add inbound rule to DocumentDB SG" -ForegroundColor Yellow
}

if ($ALL_TRAFFIC_ALLOWED) {
    Write-Host "[OK]" -ForegroundColor Green -NoNewline
    Write-Host " ECS SG allows all outbound traffic" -ForegroundColor White
} else {
    Write-Host "[WARN]" -ForegroundColor Yellow -NoNewline
    Write-Host " Check ECS outbound rules" -ForegroundColor White
}

if ($NAT_2A) {
    Write-Host "[OK]" -ForegroundColor Green -NoNewline
    Write-Host " 2a Private Subnet has NAT Gateway route" -ForegroundColor White
} else {
    Write-Host "[FAIL]" -ForegroundColor Red -NoNewline
    Write-Host " 2a Private Subnet missing NAT Gateway!" -ForegroundColor White
}

if ($NAT_2C) {
    Write-Host "[OK]" -ForegroundColor Green -NoNewline
    Write-Host " 2c Private Subnet has NAT Gateway route" -ForegroundColor White
} else {
    Write-Host "[FAIL]" -ForegroundColor Red -NoNewline
    Write-Host " 2c Private Subnet missing NAT Gateway!" -ForegroundColor White
    Write-Host "  FIX: Add route 0.0.0.0/0 -> nat-0b5fb65fc5616331d" -ForegroundColor Yellow
}

Write-Host "`n========================================" -ForegroundColor Cyan