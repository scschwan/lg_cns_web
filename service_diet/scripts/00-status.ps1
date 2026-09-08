# =============================================================================
# 00-status.ps1 - 현재 인프라 상태 점검 (읽기 전용)
#
# 용도: 각 단계 실행 전/후 상태 비교용 스냅샷
# 실행: .\00-status.ps1
# =============================================================================

$ErrorActionPreference = "Continue"
$env:AWS_DEFAULT_REGION = "ap-northeast-2"

$CLUSTER = "finance-cluster"
$SERVICE = "finance-api"
$VPC     = "vpc-041b862a78f98462a"
$NAT     = "nat-0b5fb65fc5616331d"

function Section([string]$t) {
    Write-Host ""
    Write-Host "=== $t ===" -ForegroundColor Cyan
}

Section "ECS 서비스"
$q1 = "services[0].{Desired:desiredCount,Running:runningCount,TaskDef:taskDefinition,Subnets:networkConfiguration.awsvpcConfiguration.subnets,PublicIp:networkConfiguration.awsvpcConfiguration.assignPublicIp}"
aws ecs describe-services --cluster $CLUSTER --services $SERVICE --query $q1 --output json

Section "ALB 타겟 상태"
$tg = aws elbv2 describe-target-groups --names finance-backend-tg --query "TargetGroups[0].TargetGroupArn" --output text
aws elbv2 describe-target-health --target-group-arn $tg --query "TargetHealthDescriptions[].{Id:Target.Id,State:TargetHealth.State}" --output json

Section "ElastiCache"
$q2 = "CacheClusters[].{Id:CacheClusterId,Node:CacheNodeType,Status:CacheClusterStatus,AZ:PreferredAvailabilityZone}"
aws elasticache describe-cache-clusters --query $q2 --output json

Section "NAT Gateway"
aws ec2 describe-nat-gateways --filter "Name=vpc-id,Values=$VPC" --query "NatGateways[?State!='deleted'].{Id:NatGatewayId,State:State}" --output json

Section "VPC 엔드포인트"
aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=$VPC" --query "VpcEndpoints[].{Id:VpcEndpointId,Svc:ServiceName,Type:VpcEndpointType,State:State}" --output json

Section "Elastic IP (미연결도 과금됨)"
aws ec2 describe-addresses --query "Addresses[].{IP:PublicIp,AllocId:AllocationId,Assoc:AssociationId}" --output json

Section "NAT 수신 트래픽 최근 7일 (0 이면 제거 안전)"
$end   = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$start = (Get-Date).ToUniversalTime().AddDays(-7).ToString("yyyy-MM-ddTHH:mm:ssZ")
aws cloudwatch get-metric-statistics --namespace AWS/NATGateway --metric-name BytesOutToSource --dimensions "Name=NatGatewayId,Value=$NAT" --start-time $start --end-time $end --period 604800 --statistics Sum --query "Datapoints[0].Sum" --output text

Section "당월 누적 비용"
$m1 = (Get-Date -Day 1).ToString("yyyy-MM-dd")
$m2 = (Get-Date -Day 1).AddMonths(1).ToString("yyyy-MM-dd")
$period = "Start=$m1,End=$m2"
aws ce get-cost-and-usage --time-period $period --granularity MONTHLY --metrics UnblendedCost --region us-east-1 --query "ResultsByTime[0].Total.UnblendedCost.Amount" --output text

Write-Host ""
Write-Host "점검 완료" -ForegroundColor Green
