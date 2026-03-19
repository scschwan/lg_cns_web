# Finance Tool - 프론트엔드 관점 아키텍처 리뷰 피드백

> **작성일**: 2026-03-19
> **작성자**: Front-end Agent
> **리뷰 대상**: Infra Agent (architecture.md, aws_resources.md), Backend Agent (architecture.md, api_endpoints.md)

---

## 1. 프론트엔드 <-> 인프라 정합성

### 1.1 CloudFront SPA 라우팅 설정

[정합성 확인] CloudFront Custom Error Response가 403/404 에러를 `/index.html`로 리다이렉트(Response Code 200, Cache TTL 0초)하도록 설정되어 있다. React Router DOM v6 기반 BrowserRouter의 클라이언트 사이드 라우팅과 완벽히 호환된다.

**심각도**: 정상 확인 완료

### 1.2 S3 정적 호스팅과 Vite 빌드 출력 구조

[정합성 확인] Vite 빌드 출력 디렉토리가 `build/`로 설정되어 있고, 배포 스크립트(`deploy.ps1`)가 `aws s3 sync ./build s3://lgcns-finance-frontend-app --delete`로 동기화한다. S3 버킷명 `lgcns-finance-frontend-app`과 CloudFront Origin 도메인 `lgcns-finance-frontend-app.s3-website.ap-northeast-2.amazonaws.com`이 일치한다.

**심각도**: 정상 확인 완료

### 1.3 CloudFront Cache Behavior와 API 프록시 설정

[정합성 확인] CloudFront `/api/*` Cache Behavior가 ALB Origin으로 프록시하며, 허용 Method에 `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE`를 모두 포함하고 있다. 프론트엔드의 모든 API 호출(`api.js`의 Axios 인스턴스)이 `/api/` 접두사를 사용하고 있어 CloudFront를 통한 프록시 경로와 일치한다.

[개선 제안] 프로덕션 환경에서 `VITE_API_BASE_URL`이 빈 값이므로 api.js에서 `baseURL`이 빈 문자열로 설정되어 상대 경로 요청이 된다. 이는 CloudFront 프록시를 정확히 활용하는 올바른 패턴이다. 단, `systemService.js`는 `api.js`의 공통 Axios 인스턴스를 사용하지 않고 별도의 `axios` 인스턴스를 직접 생성하면서 `API_URL`을 사용한다. 프로덕션에서 `API_URL`이 빈 문자열이 되므로 `axios.get(`${API_URL}/api/system/...`)`은 상대경로로 동작하여 문제없지만, 코드 일관성 측면에서 공통 인스턴스 사용을 권장한다.

**심각도**: 정상 확인 완료 (systemService.js 코드 정리 권장)

### 1.4 CORS 설정

[정합성 확인] S3 `finance-excel-uploads` 버킷의 CORS 설정에 `https://d3ipfpkjg02npk.cloudfront.net`과 `http://localhost:3000`이 Allowed Origins로 설정되어 있다. 프론트엔드에서 S3 Presigned URL을 통한 직접 업로드(XMLHttpRequest PUT) 시 CORS가 필요하며, 이 설정이 올바르게 구성되어 있다.

[정합성 확인] 백엔드 Spring Security의 CORS 설정에도 `localhost:3000`과 CloudFront 도메인이 포함되어 있다.

**심각도**: 정상 확인 완료

### 1.5 CloudFront와 ALB 간 HTTP 통신

[위험 사항] CloudFront에서 ALB로의 통신이 HTTP(비암호화)로 이루어진다. 인프라 문서에서 `ALB | N/A | HTTP (CloudFront -> ALB 구간)`으로 명시하고 있다. Authorization 헤더에 JWT 토큰이 포함된 요청이 이 구간에서 평문으로 전송된다. CloudFront -> ALB 구간이 AWS 내부 네트워크이므로 위험도는 낮지만, 금융 데이터를 다루는 애플리케이션 특성상 HTTPS 적용을 권장한다.

**심각도**: Warning

### 1.6 CloudFront 캐시와 API 응답

[개선 제안] `/api/*` Cache Behavior가 "캐시 비활성화"로 설정되어 있어 API 응답이 캐시되지 않는다. 이는 올바른 설정이다. 다만 Default(`*`) 경로의 DefaultTTL이 86400초(24시간)로 설정되어 있으므로, 프론트엔드 배포 후 반드시 CloudFront Invalidation(`/*`)을 수행해야 한다. 배포 스크립트에 이미 포함되어 있음을 확인했다.

**심각도**: 정상 확인 완료

### 1.7 WAF Body Size 제한 대응

[정합성 확인] 프론트엔드 `costReductionService.js`에서 Long List 선택 저장 시 `saveLongListSelectionsByIds()`라는 경량 저장 메서드를 별도로 구현하여 "WAF body size 제한 우회"를 대응하고 있다. WAF가 활성화된 인프라 구성과 잘 맞는 방어 코드이다.

**심각도**: 정상 확인 완료

---

## 2. 프론트엔드 <-> 백엔드 API 연동 정합성

### 2.1 API URL 매핑 전수 검사

프론트엔드 `services/` 디렉토리의 모든 API 호출 URL을 백엔드 `api_endpoints.md`와 대조 검증했다.

#### authService.js
| 프론트엔드 호출 | 백엔드 엔드포인트 | 결과 |
|----------------|-----------------|------|
| `POST /api/auth/register` | `POST /api/auth/register` | 일치 |
| `POST /api/auth/login` | `POST /api/auth/login` | 일치 |
| `GET /api/auth/me` | `GET /api/auth/me` | 일치 |
| `PUT /api/auth/profile` | `PUT /api/auth/profile` | 일치 |
| `PUT /api/auth/profile/password` | `PUT /api/auth/profile/password` | 일치 |
| `POST /api/auth/refresh` | `POST /api/auth/refresh` | 일치 |

#### projectService.js
| 프론트엔드 호출 | 백엔드 엔드포인트 | 결과 |
|----------------|-----------------|------|
| `POST /api/projects` | `POST /api/projects` | 일치 |
| `GET /api/projects` | `GET /api/projects` | 일치 |
| `GET /api/projects/{projectId}` | `GET /api/projects/{projectId}` | 일치 |
| `PUT /api/projects/{projectId}` | `PUT /api/projects/{projectId}` | 일치 |
| `DELETE /api/projects/{projectId}` | `DELETE /api/projects/{projectId}` | 일치 |
| `POST /api/projects/{projectId}/members` | `POST /api/projects/{projectId}/members` | 일치 |
| `PUT /api/projects/{projectId}/members/{userId}` | `PUT /api/projects/{projectId}/members/{userId}` | 일치 |
| `DELETE /api/projects/{projectId}/members/{userId}` | `DELETE /api/projects/{projectId}/members/{userId}` | 일치 |
| `POST /api/projects/{projectId}/complete` | `POST /api/projects/{projectId}/complete` | 일치 |
| `GET /api/projects/{projectId}/files` | `GET /api/projects/{projectId}/files` | 일치 |

#### uploadService.js - 파일 세션 추가 URL 불일치

[누락 사항] `addFilesToSession` 메서드의 URL이 백엔드와 불일치한다.

- **프론트엔드**: `POST /api/projects/{projectId}/upload/sessions/{sessionId}/files`
- **백엔드**: `POST /api/projects/{projectId}/upload/sessions/{sessionId}/add-files`

프론트엔드에서는 `/files` 경로를 사용하지만 백엔드 api_endpoints.md에는 `/add-files`로 정의되어 있다.

**심각도**: Critical

#### uploadService.js - 세션 컬럼 설정 URL

[정합성 확인] 백엔드에 `PUT .../sessions/{sessionId}/columns` 엔드포인트가 있으나, 프론트엔드에서는 이 API를 직접 호출하는 메서드가 없다. 대신 파일 단위 컬럼 설정(`PUT .../upload/files/{fileId}/columns`)을 사용하고 있다. 세션 레벨 컬럼 설정은 `updateDashboardColumns`로 대체되는 것으로 보인다.

**심각도**: Info

#### uploadService.js - 파싱 상태 조회 URL

[정합성 확인] 백엔드에 `GET .../sessions/{sessionId}/parsing-status` 엔드포인트가 정의되어 있으나, 프론트엔드에서는 `getUploadStatus()`(`GET .../upload/status/{uploadId}`)를 uploadId 기반으로 사용한다. 세션 단위 파싱 상태 조회는 사용하지 않는 것으로 보인다.

**심각도**: Info

#### 모든 서비스 종합 결과

나머지 모든 서비스(preprocessingService, transformService, clusteringService, detailClusteringService, exportService, costReductionService, adminService, systemService)의 API URL은 백엔드 api_endpoints.md와 모두 일치함을 확인했다.

### 2.2 인증 흐름 양측 일치 여부

[정합성 확인] 인증 흐름이 양측에서 일치한다.

| 항목 | 프론트엔드 | 백엔드 | 일치 |
|------|-----------|--------|------|
| 로그인 | `POST /api/auth/login` -> accessToken, refreshToken 수신 | Access Token 1시간, Refresh Token 7일 발급 | 일치 |
| 토큰 저장 | `localStorage.authToken`, `localStorage.refreshToken` | - | N/A |
| Authorization 헤더 | `Bearer {accessToken}` | `JwtAuthenticationFilter`에서 추출 | 일치 |
| 토큰 갱신 | `POST /api/auth/refresh` { refreshToken } | `AuthService.refreshToken()` | 일치 |
| 만료 버퍼 | 30초 사전 갱신 (`isTokenExpired(token, 30)`) | - | 적절 |
| 세션 검증 | 1분 주기 `GET /api/auth/me` | `@CurrentUser` 어노테이션 | 일치 |

[개선 제안] 프론트엔드에서 Refresh Token을 `localStorage`에 저장하고 있다. XSS 공격 시 탈취 위험이 있다. `httpOnly` 쿠키를 사용하는 방식으로의 전환을 검토할 수 있다. 다만 현재 아키텍처에서는 양측의 구현이 일관되게 맞추어져 있다.

**심각도**: Info (보안 개선 검토 사항)

### 2.3 파일 업로드 흐름 (Presigned URL -> S3 직접 업로드)

[정합성 확인] 파일 업로드 흐름이 양측에서 일치한다.

1. 프론트엔드: `POST /api/projects/{projectId}/upload/presigned-url` -> presignedUrl, uploadId, s3Key 수신
2. 프론트엔드: XMLHttpRequest PUT으로 S3 직접 업로드 (Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)
3. 프론트엔드: `POST /api/projects/{projectId}/upload/files`로 업로드 완료 처리
4. 백엔드: S3 이벤트 -> Lambda ExcelCoordinator -> SQS -> Lambda ExcelWorker
5. 프론트엔드: `GET /api/projects/{projectId}/upload/status/{uploadId}`로 1초 간격 폴링

[정합성 확인] S3 CORS 설정에서 `PUT` 메서드가 허용되어 있고, `Content-Type`, `x-amz-*` 헤더가 Allowed Headers에 포함되어 있어 Presigned URL 직접 업로드가 정상 동작한다.

**심각도**: 정상 확인 완료

### 2.4 에러 응답 처리 호환성

[정합성 확인] 백엔드 `GlobalExceptionHandler`의 JSON 에러 응답 형식:
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "에러 메시지",
  "timestamp": "..."
}
```

프론트엔드 `api.js` Response Interceptor에서:
- 401: Refresh Token으로 재시도 -> 실패 시 로그아웃
- 403: `responseData.error === 'FORBIDDEN' || 'UNAUTHORIZED'`로 백엔드 인증 403과 CloudFront/WAF 403을 구분
- 500+: 연속 에러 카운팅

[정합성 확인] 403 구분 로직이 적절하다. 백엔드는 인증 실패 시 JSON 형태의 에러를 반환하지만, CloudFront/WAF의 403은 HTML 형태일 수 있으므로 `typeof responseData === 'object'` 체크로 구분하는 로직이 올바르다.

[정합성 확인] CloudFront HTML 응답 감지 로직(`text/html` content-type 체크)이 있어 프록시 타임아웃 시 사용자에게 적절한 에러 메시지를 표시한다. 클러스터링 서비스에서도 `<!DOCTYPE` 문자열 체크로 이중 방어하고 있다.

**심각도**: 정상 확인 완료

---

## 3. UX/기능 관점 피드백

### 3.1 백엔드 API 중 프론트엔드에서 UI로 노출하지 않는 기능

[누락 사항] 다음 백엔드 API들은 프론트엔드 서비스 레이어에서 호출하지 않는다.

| 백엔드 API | 설명 | 평가 |
|-----------|------|------|
| `GET /api/auth/health` | Auth 서비스 헬스 체크 | 운영 전용, UI 불필요 |
| `GET /api/health` | 앱 헬스 체크 | 운영 전용, UI 불필요 |
| `GET /api/health/db` | DB 상태 진단 | 운영 전용, UI 불필요 |
| `GET /api/info` | 앱 정보 | 운영 전용, UI 불필요 |
| `POST /api/data/test` | MongoDB 삽입 테스트 | 개발/디버깅용, UI 불필요 |
| `GET /api/data/count` | 전체 데이터 개수 | 개발/디버깅용, UI 불필요 |
| `GET /api/data/session/{sessionId}` | 세션별 데이터 (캐시 지원) | 대체 API 사용 |
| `GET /api/data` | 전체 데이터 페이징 | 개발/디버깅용, UI 불필요 |
| `POST /api/cache/test` | Redis 저장 테스트 | 개발/디버깅용, UI 불필요 |
| `GET /api/cache/test/{key}` | Redis 조회 테스트 | 개발/디버깅용, UI 불필요 |
| `POST /api/cache/session` | 세션 저장 테스트 | 개발/디버깅용, UI 불필요 |
| `GET /api/cache/session/{sessionId}` | 세션 조회 테스트 | 개발/디버깅용, UI 불필요 |
| `POST /api/cache/upload/progress` | 업로드 진행률 저장 | 내부용 |
| `GET /api/cache/upload/progress/{uploadId}` | 업로드 진행률 조회 | 내부용 |
| `GET .../sessions/{sessionId}/parsing-status` | 세션 파싱 상태 | uploadId 기반 API 사용 |
| `PUT .../sessions/{sessionId}/columns` | 세션 컬럼 설정 | 파일 단위 API 사용 |

위 항목은 대부분 운영/개발/디버깅 목적의 API이므로 프론트엔드에서 UI 노출이 불필요한 것은 적절하다.

**심각도**: Info

### 3.2 프론트엔드에서 필요하지만 백엔드가 지원하지 않는 기능

[정합성 확인] 현재 프론트엔드에서 호출하는 모든 API가 백엔드에 존재한다. `addFilesToSession`의 URL 경로 불일치를 제외하면 기능적 누락은 없다.

**심각도**: 정상 확인 완료

### 3.3 페이지네이션 양측 구현 일치

[정합성 확인] 프론트엔드 페이지네이션 설정:
- 페이지 크기 옵션: [100, 500, 1000, 5000, 10000]
- 기본 페이지 크기: 1000
- 요청 파라미터: `page`, `size` (0-based)

백엔드가 Spring Data의 `Pageable` 인터페이스를 사용하므로 0-based page 인덱스와 size 파라미터가 양측에서 일치한다.

[개선 제안] 페이지 크기 최대값이 10,000이다. 대용량 Excel 데이터를 다루는 애플리케이션 특성상 10,000건 단위 조회 시 응답 시간이 길어질 수 있다. 백엔드에서 최대 페이지 크기 제한을 설정했는지 확인이 필요하다.

**심각도**: Info

---

## 4. 배포/환경 관점 피드백

### 4.1 환경 변수와 인프라 엔드포인트 일치

[정합성 확인] `.env` 파일의 환경 변수 검증:

| 파일 | 변수 | 값 | 인프라 실제값 | 일치 |
|------|------|-----|-------------|------|
| `.env` | `VITE_API_BASE_URL` | `http://finance-alb-1506892035.ap-northeast-2.elb.amazonaws.com` | ALB DNS: `finance-alb-1506892035.ap-northeast-2.elb.amazonaws.com` | 일치 |
| `.env.production` | `VITE_API_BASE_URL` | (빈 값) | CloudFront 프록시 사용 | 적절 |

[개선 제안] 개발 환경(`.env`)에서 ALB에 직접 HTTP로 접속하도록 설정되어 있다. 개발 시 CloudFront를 거치지 않으므로 WAF/캐시 관련 이슈를 사전에 발견하기 어렵다. 개발/스테이징 환경에서도 CloudFront를 경유하는 테스트를 병행하는 것을 권장한다.

**심각도**: Info

### 4.2 빌드 -> S3 배포 -> CloudFront Invalidation 흐름

[정합성 확인] `deploy.ps1` 배포 흐름 검증:

1. `npm run build` -> `frontend/build/` 디렉토리 생성 (Vite `outDir: 'build'` 설정 일치)
2. 정적 자산: `Cache-Control: public, max-age=31536000, immutable` (1년 캐시)
3. `index.html`: `Cache-Control: no-cache, no-store, must-revalidate` (항상 최신)
4. CloudFront Invalidation: `/*` (Distribution ID: `E2WSY238E3ZG9N` 일치)

[정합성 확인] Vite의 Content Hash 기반 파일명(`assets/index-abc123.js`)과 장기 캐시 전략이 결합되어 효율적인 캐시 무효화가 구현되어 있다. `index.html`만 no-cache로 항상 최신 번들 참조를 보장한다.

**심각도**: 정상 확인 완료

### 4.3 VITE_API_BASE_URL 폴백 로직

[위험 사항] `api.js`에서 `VITE_API_BASE_URL`이 빈 값일 때 `??` 연산자로 `http://localhost:8080`으로 폴백하는 코드가 있다:

```javascript
const API_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';
```

`.env.production`에서 `VITE_API_BASE_URL=`로 설정하면 빈 문자열(`""`)이 된다. JavaScript에서 빈 문자열은 `??`(Nullish Coalescing)에서 null/undefined가 아니므로 폴백이 발생하지 않고 빈 문자열이 그대로 `baseURL`로 사용된다. 이 경우 Axios가 상대 경로 요청을 하게 되어 CloudFront 프록시가 정상 동작한다. 이 동작은 의도된 것이며 올바르다.

단, 만약 `.env.production` 파일 자체가 누락되거나 `VITE_API_BASE_URL` 키가 없는 경우에는 `undefined`가 되어 `localhost:8080`으로 폴백되므로, 프로덕션에서 API 호출이 실패할 수 있다.

**심각도**: Warning

---

## 5. 누락 또는 불일치 사항

### 5.1 addFilesToSession API URL 불일치

[누락 사항] 앞서 2.1에서 식별한 사항의 상세:

- **프론트엔드** (`uploadService.js` 라인 577-584):
  ```javascript
  addFilesToSession: async (projectId, sessionId, fileIds) => {
      const response = await api.post(
          `/api/projects/${projectId}/upload/sessions/${sessionId}/files`,
          { fileIds }
      );
  ```
- **백엔드** (`api_endpoints.md`):
  `POST .../sessions/{sessionId}/add-files` - 세션에 파일 추가

경로가 `/files` vs `/add-files`로 불일치한다. 이 API가 호출되면 404 에러가 발생할 수 있다.

**심각도**: Critical

### 5.2 인프라 문서에 Presigned URL 업로드 흐름 설명 차이

[개선 제안] 인프라 아키텍처 문서(section 6.3)에서는 Excel 업로드를 "ECS가 S3에 PutObject"로 설명하고 있으나, 실제 구현에서는 프론트엔드가 Presigned URL을 받아 S3에 직접 업로드한다. 인프라 문서의 비동기 처리 흐름도를 수정하여 "클라이언트가 Presigned URL로 S3 직접 업로드 -> ECS가 메타데이터만 MongoDB 저장"으로 갱신할 것을 권장한다.

**심각도**: Warning

### 5.3 백엔드 아키텍처 문서의 Lambda 트리거 설명 불일치

[개선 제안] 백엔드 아키텍처 문서(section 6.3, Lambda 함수 테이블)에서 `ExcelCoordinatorHandler`의 트리거를 "S3 이벤트 (파일 업로드)"로 설명하고 있으나, 인프라 문서(section 6.2)에서는 SQS Trigger로 설명하고 있다. 실제 흐름은 "ECS가 S3 업로드 + SQS 메시지 전송 -> SQS Trigger -> ExcelCoordinator"인 것으로 보인다. 백엔드 문서에서 트리거 설명의 정확도를 재확인할 필요가 있다.

**심각도**: Warning

### 5.4 systemService.js에서 별도 Axios 인스턴스 사용

[개선 제안] `systemService.js`는 공통 `api.js` 인스턴스를 사용하지 않고 직접 `axios`를 import하여 별도 요청을 수행한다. 이유는 유지보수 상태 조회가 인증 토큰 없이도 가능해야 하기 때문으로 보인다. 그러나 이로 인해:
- Request/Response 인터셉터(토큰 자동 갱신, CloudFront HTML 감지 등)가 적용되지 않음
- 에러 핸들링이 일관되지 않음

인증 토큰이 있으면 첨부하는 로직은 이미 구현되어 있으므로 동작에는 문제없지만, 인터셉터 우회에 따른 일관성 저하를 인지해야 한다.

**심각도**: Info

### 5.5 프론트엔드 빌드 출력 디렉토리명

[개선 제안] Vite의 기본 빌드 출력 디렉토리는 `dist`이지만, 이 프로젝트에서는 `build`로 변경했다. 인프라 배포 스크립트에서도 `./build`를 참조하고 있어 일치한다. 다만 Vite 생태계의 컨벤션과 다르므로, 신규 개발자가 혼동할 수 있다는 점을 문서에 명시해둘 것을 권장한다.

**심각도**: Info

### 5.6 단일 AZ 장애 시 프론트엔드 영향

[위험 사항] 인프라 문서에서 DocumentDB/Redis가 모두 단일 AZ(2c)에, NAT Gateway가 단일 AZ(2a)에 배치되어 있음을 경고하고 있다. AZ 장애 시:
- **AZ 2c 장애**: DocumentDB + Redis 불가 -> 모든 API 실패 -> 프론트엔드에서 500 에러 다수 발생 -> 연속 에러 카운팅(5회) 경고 발생
- **AZ 2a 장애**: NAT Gateway 불가 -> Private Subnet의 인터넷 아웃바운드 불가 -> Lambda S3 접근 불가 -> Excel 처리 실패

프론트엔드의 연속 에러 감지 로직(`consecutiveServerErrors >= 5`)이 이런 상황을 감지할 수 있으나, 사용자에게는 콘솔 경고만 출력된다. 사용자 대면 에러 메시지나 서비스 상태 알림을 표시하는 UI를 추가하는 것을 권장한다.

**심각도**: Warning

### 5.7 CloudFront DefaultTTL과 정적 자산 캐시

[정합성 확인] CloudFront Default Cache Behavior의 DefaultTTL이 86400초(24시간)이고, 배포 스크립트에서 정적 자산에 `Cache-Control: max-age=31536000, immutable`을 명시적으로 설정한다. CloudFront는 Origin의 Cache-Control 헤더를 우선하므로, 정적 자산은 1년 캐시, `index.html`은 no-cache로 정확히 동작한다.

**심각도**: 정상 확인 완료

---

## 6. 종합 요약

### 심각도별 분류

| 심각도 | 건수 | 항목 |
|--------|------|------|
| Critical | 1 | `addFilesToSession` API URL 경로 불일치 (`/files` vs `/add-files`) |
| Warning | 4 | CloudFront->ALB HTTP 통신, `.env.production` 누락 시 폴백 위험, Presigned URL 흐름 문서 불일치, 단일 AZ 장애 대응 |
| Info | 7 | systemService.js 코드 일관성, 미사용 백엔드 API, 페이지네이션 최대값, 개발환경 ALB 직접 접속, 빌드 디렉토리명, Refresh Token localStorage 저장, Lambda 트리거 문서 불일치 |

### 즉시 조치 필요 항목

1. **`addFilesToSession` URL 수정**: 프론트엔드 `uploadService.js`의 `addFilesToSession` 메서드 경로를 `/add-files`로 수정하거나, 백엔드 컨트롤러의 매핑을 `/files`로 변경하여 양측을 일치시켜야 한다.

### 권장 개선 항목

1. 인프라 문서의 Excel 업로드 흐름도에서 "Presigned URL -> 클라이언트 직접 업로드" 패턴을 정확히 반영
2. 단일 AZ 장애 시 프론트엔드에서 사용자 대면 알림 표시 로직 추가
3. `.env.production` 파일 존재 여부를 빌드 스크립트에서 사전 검증
