# Finance Tool 프로젝트 - 코드 정리 및 분석 작업 계획서

## 프로젝트 개요

- **프로젝트명**: Finance Tool (LG CNS WEB)
- **작성일**: 2026-03-19
- **기술 스택**:
  - **Front-end**: React 18 + Vite, MUI, Radix UI, TailwindCSS, Recharts, Axios
  - **Back-end**: Spring Boot 3.5 (Java 21), Spring Security + JWT, Spring Data MongoDB/Redis, AWS SDK v2, Apache POI, Open Korean Text
  - **AWS Infra**: ECS(Fargate), ALB, DocumentDB, ElastiCache(Redis), S3, SQS, Lambda, CloudFront, ECR, VPC

---

## 현재 프로젝트 구조 요약

```
25 LG CNS WEB_claude/
├── frontend/                        # React + Vite 프론트엔드
│   ├── src/
│   │   ├── components/              # 공통/UI/레이아웃 컴포넌트
│   │   ├── pages/                   # 페이지별 컴포넌트 (13개 도메인)
│   │   ├── services/                # API 호출 서비스 (13개)
│   │   ├── hooks/                   # 커스텀 훅 (5개)
│   │   ├── context/                 # AuthContext
│   │   ├── constants/               # 상수 정의
│   │   └── utils/                   # 유틸리티
│   └── deploy.ps1                   # 프론트엔드 배포 스크립트
│
├── backend/                         # Spring Boot 백엔드
│   ├── src/main/java/com/example/finance/
│   │   ├── config/                  # 설정 (Security, Mongo, Redis, S3 등)
│   │   ├── controller/              # REST API 컨트롤러 (7개 도메인)
│   │   ├── service/                 # 비즈니스 로직 서비스 (7개 도메인)
│   │   ├── repository/              # MongoDB 레포지토리 (7개 도메인)
│   │   ├── model/                   # 도메인 모델/엔티티
│   │   ├── dto/                     # Request/Response DTO
│   │   ├── enums/                   # Enum 정의
│   │   ├── exception/               # 예외 처리
│   │   ├── security/                # JWT 인증/인가
│   │   └── util/                    # 유틸리티
│   ├── lambda/                      # AWS Lambda 함수 (Excel 처리)
│   ├── Dockerfile                   # ECS 배포용
│   ├── docker-compose.yml           # 로컬 개발용
│   └── deploy.ps1                   # 백엔드 배포 스크립트
│
├── markdown/                        # 기존 문서 (아키텍처, 개발가이드 등)
├── history/                         # 개발 이력
├── Finance Tool AWS 인프라 정보.txt  # AWS 자원 정보
└── s3-cors-config.json              # S3 CORS 설정
```

---

## 달성 목표

| # | 목표 | 설명 |
|---|------|------|
| 1 | 아키텍처 완성본 작성 | Front-end / Back-end / AWS(Infra) 별 아키텍처 문서화 |
| 2 | 소스/config 주석 작업 | Front-end / Back-end 소스 코드 및 설정 파일 주석 추가 |
| 3 | 유지보수 매뉴얼 작성 | 서비스 기동, 에러 조치, 유지보수 가이드 문서 |

---

## Agent 구성

| Agent | 담당 범위 | 주요 분석 대상 |
|-------|----------|---------------|
| **Infra Agent** | AWS 자원 분석, 인프라 아키텍처 | ECS, ALB, DocumentDB, Redis, S3, SQS, Lambda, VPC, CloudFront |
| **Back-end Agent** | Spring Boot 소스 분석, API/서비스 아키텍처 | controller, service, repository, config, security, lambda |
| **Front-end Agent** | React 소스 분석, UI/UX 아키텍처 | pages, components, services, hooks, context |

---

## 업무 순서 (Phase별 진행)

### Phase 1: AWS 자원 분석 (Infra Agent)
**목표**: AWS CLI를 활용하여 현 AWS 서버 및 자원 스펙 분석

| 단계 | 작업 내용 | 산출물 |
|------|----------|--------|
| 1-1 | AWS CLI 접근 가능 여부 확인 (`aws sts get-caller-identity`) | 접근 상태 확인 |
| 1-2 | VPC/Subnet/Security Group 네트워크 구성 분석 | 네트워크 분석 결과 |
| 1-3 | ECS Cluster/Service/Task Definition 분석 | 컴퓨팅 분석 결과 |
| 1-4 | DocumentDB 클러스터 스펙 분석 | DB 분석 결과 |
| 1-5 | ElastiCache(Redis) 스펙 분석 | 캐시 분석 결과 |
| 1-6 | S3 버킷 설정 분석 (finance-excel-uploads, finance-frontend) | 스토리지 분석 결과 |
| 1-7 | SQS 큐 설정 분석 | 메시지큐 분석 결과 |
| 1-8 | Lambda 함수 분석 | 서버리스 분석 결과 |
| 1-9 | ALB/CloudFront 설정 분석 | 네트워크 엣지 분석 결과 |
| 1-10 | 분석 결과를 `analyze/infra/` 폴더에 md 파일로 정리 | `aws_resources.md` |

### Phase 2: Agent별 아키텍처 초안 작성 (병렬 진행)
**목표**: 각 Agent가 담당 항목에 대한 아키텍처 초안 작성

| Agent | 작업 내용 | 산출물 경로 |
|-------|----------|------------|
| **Infra Agent** | AWS 인프라 아키텍처도 (VPC 구성, 서비스 연결도, 배포 파이프라인) | `analyze/infra/architecture.md` |
| **Back-end Agent** | 소스 구조, API 엔드포인트 목록, 서비스 레이어 흐름, DB 스키마, 외부 연동 | `analyze/backend/architecture.md` |
| **Front-end Agent** | 컴포넌트 트리, 페이지 라우팅, 상태 관리, API 서비스 연동, UI 구조 | `analyze/frontend/architecture.md` |

### Phase 3: 아키텍처 상호 피드백
**목표**: Agent 별로 작성한 아키텍처에 대한 상호 리뷰 및 피드백

| 단계 | 작업 내용 | 산출물 |
|------|----------|--------|
| 3-1 | 각 Agent가 다른 Agent의 아키텍처 리뷰 | 피드백 코멘트 |
| 3-2 | Front-end ↔ Back-end API 연동 포인트 정합성 확인 | API 정합성 검증 |
| 3-3 | Back-end ↔ Infra 배포/설정 정합성 확인 | 인프라 정합성 검증 |
| 3-4 | 피드백 내용 정리 | `analyze/*/feedback.md` |

### Phase 4: 아키텍처 보완 및 완성
**목표**: 피드백 반영하여 최종 아키텍처 문서 완성

| 단계 | 작업 내용 | 산출물 |
|------|----------|--------|
| 4-1 | Phase 3 피드백 반영하여 각 아키텍처 수정 | 수정된 `architecture.md` |
| 4-2 | 전체 시스템 통합 아키텍처도 작성 | `analyze/system_architecture.md` |
| 4-3 | 최종 검증 및 확정 | 최종 아키텍처 문서 |

### Phase 5: 소스 코드 주석 작업 (Back-end / Front-end Agent 병렬)
**목표**: 소스 코드 및 설정 파일에 주석 추가

#### Back-end 주석 대상

| 단계 | 대상 | 파일 수 |
|------|------|--------|
| 5-B1 | config 패키지 (SecurityConfig, MongoConfig, RedisConfig, S3Config 등) | 8개 |
| 5-B2 | controller 패키지 (auth, admin, data, upload, project, costreduction, common) | 15개 |
| 5-B3 | service 패키지 (auth, admin, data, upload, project, costreduction, common) | 19개 |
| 5-B4 | model/dto/enums 패키지 | 약 40개 |
| 5-B5 | security 패키지 (JWT, Filter) | 4개 |
| 5-B6 | exception/util 패키지 | 7개 |
| 5-B7 | lambda 소스 | 5개 |
| 5-B8 | application.yml, build.gradle, Dockerfile, docker-compose.yml | 4개 |

#### Front-end 주석 대상

| 단계 | 대상 | 파일 수 |
|------|------|--------|
| 5-F1 | pages 디렉토리 (auth, admin, upload, clustering, costreduction 등) | 약 20개 |
| 5-F2 | components 디렉토리 (common, layout, ui, upload, costreduction) | 약 25개 |
| 5-F3 | services 디렉토리 (API 호출 모듈) | 13개 |
| 5-F4 | hooks, context 디렉토리 | 6개 |
| 5-F5 | constants, utils 디렉토리 | 5개 |
| 5-F6 | App.jsx, index.jsx, 설정 파일 (vite.config.js, tailwind.config.js 등) | 5개 |

### Phase 6: 유지보수/서비스 기동/에러 조치 매뉴얼 작성
**목표**: 운영 및 유지보수를 위한 실무 가이드 문서 작성

| 단계 | 작업 내용 | 산출물 |
|------|----------|--------|
| 6-1 | 로컬 개발 환경 구축 가이드 | `analyze/manuals/local_dev_setup.md` |
| 6-2 | AWS 배포 절차 가이드 (ECS, S3/CloudFront) | `analyze/manuals/deploy_guide.md` |
| 6-3 | 서비스 기동/중지 절차 | `analyze/manuals/startup_guide.md` |
| 6-4 | 주요 에러 유형 및 조치 방법 | `analyze/manuals/error_handling.md` |
| 6-5 | 유지보수 체크리스트 (DB, Redis, S3, 로그 등) | `analyze/manuals/maintenance.md` |
| 6-6 | 모니터링 가이드 (Actuator, CloudWatch) | `analyze/manuals/monitoring.md` |

---

## 산출물 폴더 구조

```
analyze/
├── system_architecture.md          # 전체 시스템 통합 아키텍처
├── infra/                          # Infra Agent 산출물
│   ├── aws_resources.md            # AWS 자원 분석 결과 (Phase 1)
│   ├── architecture.md             # 인프라 아키텍처 (Phase 2)
│   └── feedback.md                 # 피드백 기록 (Phase 3)
├── backend/                        # Back-end Agent 산출물
│   ├── architecture.md             # 백엔드 아키텍처 (Phase 2)
│   ├── api_endpoints.md            # API 엔드포인트 목록
│   └── feedback.md                 # 피드백 기록 (Phase 3)
├── frontend/                       # Front-end Agent 산출물
│   ├── architecture.md             # 프론트엔드 아키텍처 (Phase 2)
│   ├── page_routing.md             # 페이지/라우팅 구조
│   └── feedback.md                 # 피드백 기록 (Phase 3)
└── manuals/                        # 운영 매뉴얼 (Phase 6)
    ├── local_dev_setup.md          # 로컬 개발 환경 구축
    ├── deploy_guide.md             # AWS 배포 절차
    ├── startup_guide.md            # 서비스 기동/중지
    ├── error_handling.md           # 에러 조치
    ├── maintenance.md              # 유지보수 체크리스트
    └── monitoring.md               # 모니터링 가이드
```

---

## 진행 상태 추적

| Phase | 상태 | 시작일 | 완료일 | 비고 |
|-------|------|--------|--------|------|
| Phase 1: AWS 자원 분석 | ✅ 완료 | 2026-03-19 | 2026-03-19 | `analyze/infra/aws_resources.md` 작성 완료 |
| Phase 2: 아키텍처 초안 | ✅ 완료 | 2026-03-19 | 2026-03-19 | Infra/Backend/Frontend 5개 문서 작성 완료 |
| Phase 3: 상호 피드백 | ✅ 완료 | 2026-03-19 | 2026-03-19 | Critical 8건, Warning 26건 발견 |
| Phase 4: 아키텍처 완성 | ✅ 완료 | 2026-03-19 | 2026-03-19 | 3개 Agent 보완 + 통합 아키텍처 완성 |
| Phase 5: 소스 주석 작업 | ✅ 완료 | 2026-03-19 | 2026-03-19 | BE 113개 + FE 87개 = 총 200개 파일 주석 완료 |
| Phase 6: 매뉴얼 작성 | ⬜ 대기 | - | - | Phase 5 완료 후 |

---

## 선행 조건 및 확인 사항

- [ ] AWS CLI 설치 및 인증 설정 확인 (`aws sts get-caller-identity`)
- [ ] AWS 계정 리소스 읽기 권한 확인
- [ ] 기존 `markdown/` 폴더 문서와의 중복/통합 여부 결정
- [ ] 주석 작업 시 언어 (한글/영문) 결정
- [ ] `*_old.py` 등 레거시 파일 주석 포함 여부
