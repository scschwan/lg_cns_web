# =============================================================================
# 99-rollback.ps1 - 단계별 롤백
#
# 실행: .\99-rollback.ps1 -Step 1        # ECS 2대 복귀
#       .\99-rollback.ps1 -Step 2        # 보안 조치 (전진 복구 안내)
#       .\99-rollback.ps1 -Step 3        # NAT 재생성 + 프라이빗 서브넷 복귀
# =============================================================================

param(
    [Parameter(Mandatory=$true)][ValidateSet("1","2","3")][string]$Step,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$env:AWS_DEFAULT_REGION = "ap-northeast-2"

$CLUSTER        = "finance-cluster"
$SERVICE        = "finance-api"
$ECS_SG         = "sg-0b2f80b067408e320"
$EXEC_ROLE      = "finance-ecs-task-execution-role"
$PRIVATE_SUB_1A = "subnet-0bfa6431b2de4c627"
$PRIVATE_SUB_1C = "subnet-08cdb7f10fd2f72f4"
$PUBLIC_SUB_1A  = "subnet-0439ae6345851cb05"
$PRIVATE_RT     = "rtb-021492a36dbdbfb3b"

# -----------------------------------------------------------------------------
if ($Step -eq "1") {
    Write-Host "=== 1단계 롤백 (약 2분) ===" -ForegroundColor Green

    if ($DryRun) {
        Write-Host "(DryRun) aws ecs update-service --cluster $CLUSTER --service $SERVICE --desired-count 2" -ForegroundColor Yellow
    }
    else {
        aws ecs update-service --cluster $CLUSTER --service $SERVICE --desired-count 2 --query "service.{Desired:desiredCount}" --output json
        aws ecs wait services-stable --cluster $CLUSTER --services $SERVICE
        Write-Host "ECS 2대 복귀 완료" -ForegroundColor Green
    }

    $manual = @'

[Redis 롤백 - 수동]
  구 클러스터(finance-redis-cluster)를 1주 존치했다면 그대로 살아 있다.
  1. task-def-template.json 의 REDIS_HOST 를 구 엔드포인트로 원복
     finance-redis-cluster.1kdayr.0001.apn2.cache.amazonaws.com
  2. Lambda 2개 환경변수 원복
     (01-step1 Phase C 실행 시 생성된 lambda-env-rollback-*.json 사용 - 이미
      { "Variables": {...} } 로 래핑되고 BOM 없이 기록되어 그대로 전달 가능)
     aws lambda update-function-configuration --function-name ExcelCoordinator --environment file://lambda-env-rollback-ExcelCoordinator.json
     aws lambda update-function-configuration --function-name ExcelWorker       --environment file://lambda-env-rollback-ExcelWorker.json
  3. 재배포

[백엔드 설정 롤백 - 수동]
  aws ecs update-service --cluster finance-cluster --service finance-api --task-definition finance-backend-task:<이전번호>

'@
    Write-Host $manual -ForegroundColor White
}

# -----------------------------------------------------------------------------
if ($Step -eq "2") {
    Write-Host "=== 2단계 롤백 ===" -ForegroundColor Green
    Write-Host "!! JWT 키와 DocDB 비밀번호는 이미 교체됐으므로 완전 롤백은 불가 !!" -ForegroundColor Red
    Write-Host "   구 비밀번호는 무효이므로 이전 task def 로 되돌리면 연결이 실패한다." -ForegroundColor Yellow

    Write-Host ""
    Write-Host "[최근 task definition]" -ForegroundColor Cyan
    aws ecs list-task-definitions --family-prefix finance-backend-task --sort DESC --max-items 5 --query "taskDefinitionArns" --output json

    $manual = @'

[올바른 대응 - 롤백이 아닌 전진 복구]
  1. Secrets Manager 값 확인
     aws secretsmanager get-secret-value --secret-id finance/docdb-uri
  2. task-def 의 secrets 참조가 올바른지 확인
  3. 실행 역할 권한 확인
     aws iam get-role-policy --role-name finance-ecs-task-execution-role --policy-name finance-secrets-read
  4. Lambda 환경변수 MONGODB_URI 가 신규 값인지 확인

'@
    Write-Host $manual -ForegroundColor White
}

# -----------------------------------------------------------------------------
if ($Step -eq "3") {
    Write-Host "=== 3단계 롤백 (약 10분) ===" -ForegroundColor Green

    if ($DryRun) {
        Write-Host "(DryRun) 실행될 순서:" -ForegroundColor Yellow
        Write-Host "  1. aws ec2 allocate-address --domain vpc" -ForegroundColor DarkGray
        Write-Host "  2. aws ec2 create-nat-gateway --subnet-id $PUBLIC_SUB_1A --allocation-id <신규>" -ForegroundColor DarkGray
        Write-Host "  3. aws ec2 create-route --route-table-id $PRIVATE_RT --destination-cidr-block 0.0.0.0/0 --nat-gateway-id <신규>" -ForegroundColor DarkGray
        Write-Host "  4. ECS 를 프라이빗 서브넷으로 복귀" -ForegroundColor DarkGray
        return
    }

    Write-Host ""
    Write-Host "[1] 신규 EIP 할당" -ForegroundColor Cyan
    $alloc = aws ec2 allocate-address --domain vpc --query "AllocationId" --output text
    Write-Host "  $alloc" -ForegroundColor Green

    Write-Host "[2] NAT Gateway 재생성" -ForegroundColor Cyan
    $natId = aws ec2 create-nat-gateway --subnet-id $PUBLIC_SUB_1A --allocation-id $alloc --query "NatGateway.NatGatewayId" --output text
    Write-Host "  $natId" -ForegroundColor Green

    Write-Host "[3] 생성 대기..." -ForegroundColor Cyan
    aws ec2 wait nat-gateway-available --nat-gateway-ids $natId

    Write-Host "[4] 라우트 복구" -ForegroundColor Cyan
    aws ec2 create-route --route-table-id $PRIVATE_RT --destination-cidr-block 0.0.0.0/0 --nat-gateway-id $natId
    Write-Host "  완료" -ForegroundColor Green

    Write-Host "[5] ECS 를 프라이빗 서브넷으로 복귀" -ForegroundColor Cyan
    $netCfg = "awsvpcConfiguration={subnets=[$PRIVATE_SUB_1A,$PRIVATE_SUB_1C],securityGroups=[$ECS_SG],assignPublicIp=DISABLED}"
    aws ecs update-service --cluster $CLUSTER --service $SERVICE --network-configuration $netCfg --force-new-deployment --query "service.serviceName" --output text
    aws ecs wait services-stable --cluster $CLUSTER --services $SERVICE
    Write-Host "  완료" -ForegroundColor Green

    Write-Host ""
    Write-Host "[참고] SQS Interface Endpoint 는 유지해도 무해 (월 9.2 USD)." -ForegroundColor DarkGray
    Write-Host "       완전 원복을 원하면 delete-vpc-endpoints 로 삭제." -ForegroundColor DarkGray
}
