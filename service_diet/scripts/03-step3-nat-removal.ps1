# =============================================================================
# 03-step3-nat-removal.ps1 - 3단계: NAT Gateway 제거 (월 $45 절감)
#
#   Phase A : SQS Interface Endpoint 생성
#   Phase B : ECS 를 퍼블릭 서브넷 + assignPublicIp 로 이동
#   Phase C : 검증 (재배포 후 BytesOutToSource 확인)
#   Phase D : NAT 삭제 + EIP 반납   <- Phase C 통과 후에만
#
# !! 순서를 지키지 않으면 서비스 복구 불가 !!
#   NAT 는 ECR 이미지 수신 경로다. 재기동일마다 292~302MB(=155MB x 2대)가
#   실제로 통과하는 것이 측정으로 확인됐다. 선행 조치 없이 지우면
#   태스크 재시작 시 이미지를 받지 못해 기동에 실패한다.
#
# 롤백: .\99-rollback.ps1 -Step 3
# =============================================================================

param(
    [Parameter(Mandatory=$true)][ValidateSet("A","B","C","D")][string]$Phase,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$env:AWS_DEFAULT_REGION = "ap-northeast-2"

$VPC            = "vpc-041b862a78f98462a"
$NAT            = "nat-0b5fb65fc5616331d"
$PRIVATE_RT     = "rtb-021492a36dbdbfb3b"
$CLUSTER        = "finance-cluster"
$SERVICE        = "finance-api"
$ECS_SG         = "sg-0b2f80b067408e320"
$LAMBDA_SG      = "sg-03f87eab294fd8eb8"
$VPCE_SG        = "sg-053116132c7392b56"   # SQS 엔드포인트 전용 (443 인바운드: Lambda + ECS)
$PRIVATE_SUB_1A = "subnet-0bfa6431b2de4c627"
$PUBLIC_SUB_1A  = "subnet-0439ae6345851cb05"
$PUBLIC_SUB_1C  = "subnet-0d871ae82bab584e3"

# -----------------------------------------------------------------------------
if ($Phase -eq "A") {
    Write-Host "=== 3-A. SQS Interface Endpoint 생성 (약 9.2 USD/월) ===" -ForegroundColor Green
    Write-Host "용도: Lambda ExcelCoordinatorHandler:227 과 백엔드 4곳의 sendMessage 경로 확보" -ForegroundColor DarkGray
    Write-Host "참고: S3 Gateway Endpoint 는 생성 완료 (vpce-0fdf46f2c2ce0a2b9)" -ForegroundColor DarkGray

    # private DNS 는 VPC 전체의 sqs.<region>.amazonaws.com 해석을 엔드포인트로 바꾼다.
    # 백엔드도 SqsClient.sendMessage 를 쓰므로(FileSessionService:538/1789/2152,
    # SessionDataService:235) ECS 가 퍼블릭 서브넷으로 가더라도 이 엔드포인트를 탄다.
    # 따라서 엔드포인트 SG 는 Lambda 와 ECS 양쪽의 443 인바운드를 허용해야 한다.
    # finance-lambda-sg 는 인바운드 규칙이 비어 있어 그대로 쓰면 Lambda 조차 붙지 못한다.
    Write-Host ""
    Write-Host "[사전 검증 1] 엔드포인트 SG 인바운드 443" -ForegroundColor Cyan
    aws ec2 describe-security-groups --group-ids $VPCE_SG --query "SecurityGroups[0].IpPermissions[].{Port:FromPort,From:UserIdGroupPairs[].GroupId}" --output json

    # private DNS 는 VPC 의 enableDnsHostnames 가 켜져 있어야 생성이 된다.
    Write-Host ""
    Write-Host "[사전 검증 2] VPC enableDnsHostnames" -ForegroundColor Cyan
    $dnsHost = aws ec2 describe-vpc-attribute --vpc-id $VPC --attribute enableDnsHostnames --query "EnableDnsHostnames.Value" --output text
    Write-Host "  enableDnsHostnames = $dnsHost"
    if ($dnsHost -ne "True") {
        Write-Host "  -> 비활성 상태. 아래를 먼저 실행해야 엔드포인트 생성이 가능하다:" -ForegroundColor Yellow
        Write-Host "     aws ec2 modify-vpc-attribute --vpc-id $VPC --enable-dns-hostnames" -ForegroundColor Yellow
        if (-not $DryRun) { exit 1 }
    }

    if ($DryRun) {
        Write-Host ""
        Write-Host "(DryRun) 실행될 명령:" -ForegroundColor Yellow
        Write-Host "  aws ec2 create-vpc-endpoint --vpc-id $VPC --service-name com.amazonaws.ap-northeast-2.sqs --vpc-endpoint-type Interface --subnet-ids $PRIVATE_SUB_1A --security-group-ids $VPCE_SG --private-dns-enabled" -ForegroundColor DarkGray
        return
    }

    aws ec2 create-vpc-endpoint --vpc-id $VPC --service-name com.amazonaws.ap-northeast-2.sqs --vpc-endpoint-type Interface --subnet-ids $PRIVATE_SUB_1A --security-group-ids $VPCE_SG --private-dns-enabled --query "VpcEndpoint.{Id:VpcEndpointId,State:State}" --output json

    Write-Host ""
    Write-Host "[검증] 엑셀 업로드 1건 수행 -> SQS 메시지 정상 발행 확인" -ForegroundColor Yellow
    Write-Host "        백엔드(업로드 요청)와 Lambda(Coordinator) 양쪽 경로를 모두 확인할 것" -ForegroundColor Yellow
}

# -----------------------------------------------------------------------------
if ($Phase -eq "B") {
    Write-Host "=== 3-B. ECS 를 퍼블릭 서브넷으로 이동 ===" -ForegroundColor Green

    Write-Host ""
    Write-Host "[보안 사전 검증] ECS SG 인바운드" -ForegroundColor Cyan
    aws ec2 describe-security-groups --group-ids $ECS_SG --query "SecurityGroups[0].IpPermissions[].{Port:FromPort,Cidr:IpRanges[].CidrIp,SG:UserIdGroupPairs[].GroupId}" --output json

    $openCount = aws ec2 describe-security-groups --group-ids $ECS_SG --query "SecurityGroups[0].IpPermissions[?IpRanges[?CidrIp=='0.0.0.0/0']] | length(@)" --output text
    if ($openCount -ne "0") {
        Write-Host ""
        Write-Host "!! 중단: ECS SG 에 0.0.0.0/0 인바운드가 존재합니다 !!" -ForegroundColor Red
        Write-Host "   퍼블릭 서브넷 이동 시 외부에 직접 노출됩니다. 먼저 규칙을 정리하세요." -ForegroundColor Red
        exit 1
    }
    Write-Host "검증 통과: ALB 경유만 허용됨 (외부 직접 접근 불가)" -ForegroundColor Green

    Write-Host ""
    Write-Host "[현재 네트워크 구성]"
    aws ecs describe-services --cluster $CLUSTER --services $SERVICE --query "services[0].networkConfiguration.awsvpcConfiguration" --output json

    $netCfg = "awsvpcConfiguration={subnets=[$PUBLIC_SUB_1A,$PUBLIC_SUB_1C],securityGroups=[$ECS_SG],assignPublicIp=ENABLED}"

    if ($DryRun) {
        Write-Host ""
        Write-Host "(DryRun) 실행될 명령:" -ForegroundColor Yellow
        Write-Host "  aws ecs update-service --cluster $CLUSTER --service $SERVICE --network-configuration `"$netCfg`" --force-new-deployment" -ForegroundColor DarkGray
        return
    }

    Write-Host ""
    Write-Host "[실행] 퍼블릭 서브넷 + assignPublicIp=ENABLED" -ForegroundColor Cyan
    aws ecs update-service --cluster $CLUSTER --service $SERVICE --network-configuration $netCfg --force-new-deployment --query "service.{Desired:desiredCount}" --output json

    Write-Host ""
    Write-Host "[안정화 대기]..." -ForegroundColor Cyan
    aws ecs wait services-stable --cluster $CLUSTER --services $SERVICE
    Write-Host "완료. ALB 타겟 healthy 확인 후 Phase C 진행" -ForegroundColor Green
}

# -----------------------------------------------------------------------------
if ($Phase -eq "C") {
    Write-Host "=== 3-C. NAT 통과 트래픽 검증 (삭제 전 필수) ===" -ForegroundColor Green
    Write-Host "판정 기준: 재배포 1회 후 BytesOutToSource 가 0 이면 삭제 안전" -ForegroundColor DarkGray

    if ($DryRun) {
        Write-Host ""
        Write-Host "(DryRun) 재배포 및 메트릭 조회 생략" -ForegroundColor Yellow
        return
    }

    Write-Host ""
    Write-Host "[1] 강제 재배포 (ECR pull 이 IGW 로 되는지 확인)" -ForegroundColor Cyan
    aws ecs update-service --cluster $CLUSTER --service $SERVICE --force-new-deployment --query "service.serviceName" --output text
    aws ecs wait services-stable --cluster $CLUSTER --services $SERVICE
    Write-Host "재배포 완료 - ECR pull 성공" -ForegroundColor Green

    Write-Host ""
    Write-Host "[2] 최근 1시간 NAT 수신 트래픽 (Bytes)" -ForegroundColor Cyan
    $end   = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $start = (Get-Date).ToUniversalTime().AddHours(-1).ToString("yyyy-MM-ddTHH:mm:ssZ")
    aws cloudwatch get-metric-statistics --namespace AWS/NATGateway --metric-name BytesOutToSource --dimensions "Name=NatGatewayId,Value=$NAT" --start-time $start --end-time $end --period 3600 --statistics Sum --query "Datapoints[0].Sum" --output text

    $checklist = @'

[체크리스트] 아래를 모두 확인한 뒤 Phase D 실행
  [ ] ALB 타겟 healthy
  [ ] 재배포 성공 (ECR pull)
  [ ] CloudWatch Logs 수신 정상
  [ ] 엑셀 업로드 E2E (S3 -> Coordinator -> SQS -> Worker -> Mongo)
  [ ] 위 BytesOutToSource 값이 0 또는 무시 가능한 수준

'@
    Write-Host $checklist -ForegroundColor Yellow
}

# -----------------------------------------------------------------------------
if ($Phase -eq "D") {
    Write-Host "=== 3-D. NAT 삭제 + EIP 반납 ===" -ForegroundColor Green
    Write-Host "!! Phase C 체크리스트를 모두 통과한 뒤에만 실행하세요 !!" -ForegroundColor Red

    # NAT 삭제 후에는 조회 불가하므로 미리 확보
    $allocId = aws ec2 describe-nat-gateways --nat-gateway-ids $NAT --query "NatGateways[0].NatGatewayAddresses[0].AllocationId" --output text
    Write-Host ""
    Write-Host "NAT EIP AllocationId: $allocId" -ForegroundColor Cyan

    if ($DryRun) {
        Write-Host ""
        Write-Host "(DryRun) 실행될 명령:" -ForegroundColor Yellow
        Write-Host "  aws ec2 delete-route --route-table-id $PRIVATE_RT --destination-cidr-block 0.0.0.0/0" -ForegroundColor DarkGray
        Write-Host "  aws ec2 delete-nat-gateway --nat-gateway-id $NAT" -ForegroundColor DarkGray
        Write-Host "  aws ec2 release-address --allocation-id $allocId" -ForegroundColor DarkGray
        return
    }

    Write-Host ""
    Write-Host "[1] 프라이빗 라우팅 테이블에서 0.0.0.0/0 삭제" -ForegroundColor Cyan
    aws ec2 delete-route --route-table-id $PRIVATE_RT --destination-cidr-block 0.0.0.0/0

    Write-Host "[2] NAT Gateway 삭제" -ForegroundColor Cyan
    aws ec2 delete-nat-gateway --nat-gateway-id $NAT --query "NatGatewayId" --output text

    Write-Host "[3] 삭제 대기 (최대 5분)..." -ForegroundColor Cyan
    aws ec2 wait nat-gateway-deleted --nat-gateway-ids $NAT
    Write-Host "NAT 삭제 완료" -ForegroundColor Green

    Write-Host "[4] EIP 반납 (미연결 EIP 도 과금되므로 필수)" -ForegroundColor Cyan
    aws ec2 release-address --allocation-id $allocId
    Write-Host "EIP 반납 완료" -ForegroundColor Green

    Write-Host ""
    Write-Host "[최종 확인] EIP 가 2개(ALB용)만 남아야 정상" -ForegroundColor Cyan
    aws ec2 describe-addresses --query "Addresses[].{IP:PublicIp,Assoc:AssociationId}" --output json
}
