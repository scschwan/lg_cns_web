[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Finance Tool 인프라 서브넷 점검" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. VPC Subnets 전체 확인
Write-Host "1. VPC Subnets (전체)" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
aws ec2 describe-subnets `
  --filters "Name=vpc-id,Values=vpc-041b862a78f98462a" `
  --region ap-northeast-2 `
  --query 'Subnets[*].{Name:Tags[?Key==`Name`].Value|[0],SubnetId:SubnetId,AZ:AvailabilityZone,CIDR:CidrBlock,Type:Tags[?Key==`Type`].Value|[0]}' `
  --output table

# 2. ALB Target Group
Write-Host "`n2. ALB Target Group" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
$TG_ARN = aws elbv2 describe-target-groups `
  --names finance-backend-tg `
  --region ap-northeast-2 `
  --query 'TargetGroups[0].TargetGroupArn' `
  --output text

$ALB_ARN = aws elbv2 describe-target-groups `
  --names finance-backend-tg `
  --region ap-northeast-2 `
  --query 'TargetGroups[0].LoadBalancerArns[0]' `
  --output text

aws elbv2 describe-load-balancers `
  --load-balancer-arns $ALB_ARN `
  --region ap-northeast-2 `
  --query 'LoadBalancers[0].{Name:LoadBalancerName,Subnets:AvailabilityZones[*].{SubnetId:SubnetId,Zone:ZoneName}}' `
  --output json | ConvertFrom-Json | ConvertTo-Json -Depth 10

# 3. ECS Service 네트워크 설정
Write-Host "`n3. ECS Service (finance-api)" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
aws ecs describe-services `
  --cluster finance-cluster `
  --services finance-api `
  --region ap-northeast-2 `
  --query 'services[0].networkConfiguration.awsvpcConfiguration.{Subnets:subnets,SecurityGroups:securityGroups}' `
  --output json | ConvertFrom-Json | ConvertTo-Json -Depth 10

# 4. 실행 중인 ECS Task 위치
Write-Host "`n4. 실행 중인 ECS Tasks" -ForegroundColor Yellow
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
      --query 'tasks[*].{TaskId:taskArn,Subnet:attachments[0].details[?name==`subnetId`].value|[0],ENI:attachments[0].details[?name==`networkInterfaceId`].value|[0]}' `
      --output table
}

# 5. DocumentDB
Write-Host "`n5. DocumentDB Cluster" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "Subnet Group:" -ForegroundColor Cyan
aws docdb describe-db-subnet-groups `
  --db-subnet-group-name finance-docdb-subnet-group `
  --region ap-northeast-2 `
  --query 'DBSubnetGroups[0].Subnets[*].{SubnetId:SubnetIdentifier,AZ:SubnetAvailabilityZone.Name}' `
  --output table

Write-Host "`nInstance Location:" -ForegroundColor Cyan
aws docdb describe-db-instances `
  --filters "Name=db-cluster-id,Values=finance-docdb-cluster" `
  --region ap-northeast-2 `
  --query 'DBInstances[*].{Instance:DBInstanceIdentifier,AZ:AvailabilityZone,Status:DBInstanceStatus}' `
  --output table

# 6. Redis (ElastiCache)
Write-Host "`n6. Redis (ElastiCache)" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "Subnet Group:" -ForegroundColor Cyan
aws elasticache describe-cache-subnet-groups `
  --cache-subnet-group-name finance-redis-subnet-group `
  --region ap-northeast-2 `
  --query 'CacheSubnetGroups[0].Subnets[*].{SubnetId:SubnetIdentifier,AZ:SubnetAvailabilityZone.Name}' `
  --output table 2>$null

if ($LASTEXITCODE -ne 0) {
    Write-Host "Redis Serverless - Subnet Group 정보 없음" -ForegroundColor Gray
    aws elasticache describe-serverless-caches `
      --serverless-cache-name finance-redis `
      --region ap-northeast-2 `
      --query 'ServerlessCaches[0].{Name:ServerlessCacheName,Status:Status,Endpoint:Endpoint.Address}' `
      --output table 2>$null
}

# 7. NAT Gateway
Write-Host "`n7. NAT Gateway" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
aws ec2 describe-nat-gateways `
  --filter "Name=vpc-id,Values=vpc-041b862a78f98462a" `
  --region ap-northeast-2 `
  --query 'NatGateways[*].{NatGatewayId:NatGatewayId,SubnetId:SubnetId,State:State}' `
  --output table

# 8. 요약
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "요약 및 권장사항" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`n✅ 현재 사용 중인 서브넷 정리:" -ForegroundColor Green
Write-Host "ALB: " -NoNewline
Write-Host "2a (subnet-0bfa6431b2de4c627), 2c (subnet-08cdb7f10fd2f72f4)" -ForegroundColor White

Write-Host "ECS Service 설정: " -NoNewline
$ECS_SUBNETS = aws ecs describe-services `
  --cluster finance-cluster `
  --services finance-api `
  --region ap-northeast-2 `
  --query 'services[0].networkConfiguration.awsvpcConfiguration.subnets' `
  --output text
Write-Host $ECS_SUBNETS -ForegroundColor White

Write-Host "DocumentDB: " -NoNewline
$DOCDB_SUBNETS = aws docdb describe-db-subnet-groups `
  --db-subnet-group-name finance-docdb-subnet-group `
  --region ap-northeast-2 `
  --query 'DBSubnetGroups[0].Subnets[*].SubnetIdentifier' `
  --output text
Write-Host $DOCDB_SUBNETS -ForegroundColor White

Write-Host "`n⚠️  문제 분석:" -ForegroundColor Red
if ($ECS_SUBNETS -match "subnet-08cdb7f10fd2f72f4" -and $DOCDB_SUBNETS -notmatch "subnet-08cdb7f10fd2f72f4") {
    Write-Host "ECS는 2c를 사용하지만 DocumentDB는 2c가 없습니다!" -ForegroundColor Red
    Write-Host "→ ECS Task가 2c에 배치되면 DocumentDB 연결 실패!" -ForegroundColor Yellow
}

Write-Host "`n✅ 해결 방법:" -ForegroundColor Green
Write-Host "Option 1: ECS를 2a, 2b로 변경 (빠름)" -ForegroundColor Cyan
Write-Host "Option 2: DocumentDB를 2a, 2c로 변경 (복잡)" -ForegroundColor Cyan