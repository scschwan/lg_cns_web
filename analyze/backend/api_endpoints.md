최종 수정일: 2026-03-19 (Phase 4 피드백 반영 완료)

# Finance Tool - REST API 엔드포인트 목록

## 목차
1. [Auth (인증)](#1-auth-인증)
2. [Admin (관리자)](#2-admin-관리자)
3. [Project (프로젝트)](#3-project-프로젝트)
4. [Upload (파일 업로드)](#4-upload-파일-업로드)
5. [FileSession (파일 세션)](#5-filesession-파일-세션)
6. [Data (데이터 조회/테스트)](#6-data-데이터-조회테스트)
7. [Preprocessing (전처리)](#7-preprocessing-전처리---step-3)
8. [Transform (데이터 변환)](#8-transform-데이터-변환---step-4)
9. [Clustering (클러스터링)](#9-clustering-클러스터링---step-5)
10. [Detail Clustering (세부 클러스터링)](#10-detail-clustering-세부-클러스터링---step-7)
11. [Export (내보내기)](#11-export-내보내기---step-6)
12. [Cost Reduction Dashboard (원가절감 대시보드)](#12-cost-reduction-dashboard-원가절감-대시보드)
13. [Long List](#13-long-list)
14. [Short List](#14-short-list)
15. [Able Task](#15-able-task)
16. [Dashboard Generation (대시보드 생성)](#16-dashboard-generation-대시보드-생성)
17. [Clustering Import (클러스터링 Import)](#17-clustering-import-클러스터링-import)
18. [Common (공통)](#18-common-공통)

---

## 1. Auth (인증)

**Base Path**: `/api/auth`

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `/api/auth/register` | 회원가입 | X |
| POST | `/api/auth/login` | 로그인 (JWT 토큰 발급) | X |
| POST | `/api/auth/refresh` | Access Token 갱신 | X |
| GET | `/api/auth/me` | 현재 사용자 정보 조회 | O |
| PUT | `/api/auth/profile` | 사용자 프로필 수정 (이름) | O |
| PUT | `/api/auth/profile/password` | 비밀번호 변경 | O |
| GET | `/api/auth/health` | Auth 서비스 헬스 체크 | X |

---

## 2. Admin (관리자)

**Base Path**: `/api/admin`

### 사용자 관리

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `/api/admin/users` | 전체 사용자 목록 조회 | O (Admin) |
| PUT | `/api/admin/users/{userId}/approve` | 사용자 승인 | O (Admin) |
| PUT | `/api/admin/users/{userId}/revoke` | 사용자 승인 취소 | O (Admin) |
| DELETE | `/api/admin/users/{userId}` | 사용자 삭제 | O (Admin) |
| PUT | `/api/admin/users/bulk-approve` | 사용자 일괄 승인 | O (Admin) |
| PUT | `/api/admin/users/bulk-revoke` | 사용자 일괄 승인 취소 | O (Admin) |
| PUT | `/api/admin/users/{userId}/info` | 사용자 정보 수정 (이름, 이메일) | O (Admin) |
| PUT | `/api/admin/users/{userId}/password` | 사용자 비밀번호 초기화 | O (Admin) |
| PUT | `/api/admin/profile/password` | 관리자 비밀번호 변경 | O (Admin) |

### 프로젝트 관리

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `/api/admin/projects` | 전체 프로젝트 목록 조회 | O (Admin) |
| GET | `/api/admin/projects/{projectId}` | 프로젝트 상세 조회 | O (Admin) |
| PUT | `/api/admin/projects/{projectId}/members/{userId}/role` | 멤버 역할 변경 | O (Admin) |
| POST | `/api/admin/projects/{projectId}/members` | 프로젝트 멤버 추가 | O (Admin) |
| DELETE | `/api/admin/projects/{projectId}/members/{userId}` | 프로젝트 멤버 제거 | O (Admin) |

### S3 파일 관리

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `/api/admin/s3/files` | S3 전체 파일 목록 | O (Admin) |
| GET | `/api/admin/s3/orphaned` | 고아 파일 목록 (DB 참조 없는 파일) | O (Admin) |
| DELETE | `/api/admin/s3/files` | S3 파일 삭제 (s3Keys 지정) | O (Admin) |
| POST | `/api/admin/s3/cleanup` | 고아 파일 정리 | O (Admin) |

### 세션/통계/로그

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `/api/admin/sessions` | 전체 세션 모니터링 | O (Admin) |
| POST | `/api/admin/sessions/{sessionId}/reset` | 세션 초기화 | O (Admin) |
| GET | `/api/admin/stats` | 대시보드 통계 | O (Admin) |
| GET | `/api/admin/logs` | 감사 로그 조회 | O (Admin) |
| POST | `/api/admin/user-activity` | 사용자 활동 로그 기록 | O |

### 유지보수

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `/api/admin/maintenance-mode` | 유지보수 모드 on/off | O (Admin) |
| POST | `/api/admin/reset-lambda-status` | Lambda 상태 강제 초기화 | O (Admin) |

---

## 3. Project (프로젝트)

**Base Path**: `/api/projects`

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `/api/projects` | 프로젝트 생성 | O |
| GET | `/api/projects` | 내 프로젝트 목록 조회 | O |
| GET | `/api/projects/{projectId}` | 프로젝트 상세 조회 | O |
| PUT | `/api/projects/{projectId}` | 프로젝트 정보 수정 | O |
| DELETE | `/api/projects/{projectId}` | 프로젝트 삭제 | O |
| POST | `/api/projects/{projectId}/members` | 멤버 초대 | O |
| PUT | `/api/projects/{projectId}/members/{userId}` | 멤버 권한 변경 | O |
| DELETE | `/api/projects/{projectId}/members/{userId}` | 멤버 삭제 | O |
| POST | `/api/projects/{projectId}/complete` | 프로젝트 완료 처리 | O |
| GET | `/api/projects/{projectId}/files` | 프로젝트 파일 목록 조회 | O |

---

## 4. Upload (파일 업로드)

**Base Path**: `/api/projects/{projectId}/upload`

### 페이지 잠금

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `.../upload/page-lock/acquire` | 업로드 페이지 잠금 획득 | O |
| POST | `.../upload/page-lock/heartbeat` | 잠금 하트비트 (TTL 갱신) | O |
| POST | `.../upload/page-lock/release` | 잠금 해제 | O |

### 파일 업로드

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `.../upload/presigned-url` | S3 Presigned URL 생성 | O |
| GET | `.../upload/status/{uploadId}` | 업로드/파싱 상태 조회 | O |
| GET | `.../upload/files` | 프로젝트 파일 목록 | O |
| POST | `.../upload/files` | 파일 업로드 완료 (메타데이터 저장) | O |
| PUT | `.../upload/files/{fileId}/columns` | 파일 컬럼 설정 (계정명/금액) | O |
| POST | `.../upload/files/{fileId}/extract-accounts` | 계정명 값 추출 | O |
| POST | `.../upload/files/{fileId}/calculate-amount` | 금액 합계 계산 | O |
| DELETE | `.../upload/files/{fileId}` | 파일 삭제 | O |

### 분석

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `.../upload/analyze` | 파일 분석 (계정명 추출, 파티션 제안) | O |
| POST | `.../upload/analyze-partitions` | 파티션 분석 (계정명별 파일 그룹핑) | O |
| POST | `.../upload/reanalyze` | 엑셀 데이터 재분석 (raw_data 재생성) | O |

---

## 5. FileSession (파일 세션)

**Base Path**: `/api/projects/{projectId}/upload/sessions`

### 세션 잠금

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `.../sessions/{sessionId}/lock/acquire` | 세션 잠금 획득 | O |
| POST | `.../sessions/{sessionId}/lock/heartbeat` | 세션 잠금 하트비트 | O |
| POST | `.../sessions/{sessionId}/lock/release` | 세션 잠금 해제 | O |
| GET | `.../sessions/{sessionId}/lock/status` | 세션 잠금 상태 조회 | O |

### 세션 CRUD

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `.../sessions` | 세션 생성 | O |
| POST | `.../sessions/batch` | 세션 일괄 생성 (파티션 기반) | O |
| GET | `.../sessions` | 프로젝트 세션 목록 조회 | O |
| GET | `.../sessions/{sessionId}` | 세션 상세 조회 | O |
| PUT | `.../sessions/{sessionId}` | 세션 정보 수정 (세션명/작업자명) | O |
| DELETE | `.../sessions/{sessionId}` | 세션 삭제 (소프트 삭제) | O |
| DELETE | `.../sessions/{sessionId}/reset` | 세션 초기화 (전체 데이터 삭제) | O |
| POST | `.../sessions/merge` | 세션 병합 | O |
| POST | `.../sessions/{sessionId}/add-files` | 세션에 파일 추가 | O | **[Phase 3 피드백 반영]** 백엔드 실제 매핑은 `/{sessionId}/add-files` (FileSessionController.java line 375). 프론트엔드 uploadService.js는 `/{sessionId}/files`로 호출하여 URL 불일치. 양측 중 하나를 수정 필요. |
| POST | `.../sessions/delete-batch` | 세션 일괄 삭제 | O |

### 세션 처리

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| PUT | `.../sessions/{sessionId}/columns` | 컬럼 설정 (계정명/금액) | O |
| POST | `.../sessions/{sessionId}/start` | 세션 시작 (Step 2 진입) | O |
| POST | `.../sessions/{sessionId}/complete` | 세션 완료 (Lambda 파싱 트리거) | O |
| GET | `.../sessions/{sessionId}/parsing-status` | 세션 파싱 진행 상태 (폴링) | O |
| GET | `.../sessions/{sessionId}/result/download` | 결과 다운로드 URL | O |
| PUT | `.../sessions/{sessionId}/step-history` | step_history 업데이트 | O |

### 계정 분석 (Step 2)

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `.../sessions/{sessionId}/analyze` | 계정 분석 시작 (raw_data -> session_data) | O |
| GET | `.../sessions/{sessionId}/analyze/status` | 분석 진행 상태 조회 (폴링) | O |

### 세션 데이터 관리

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `.../sessions/{sessionId}/data` | 세션 데이터 페이징 조회 | O |
| GET | `.../sessions/{sessionId}/data/search` | 세션 데이터 검색 | O |
| GET | `.../sessions/{sessionId}/data/distinct-values` | 컬럼 고유 값 조회 | O |
| GET | `.../sessions/{sessionId}/data/distinct-values-status` | 고유 값 + hidden 상태 조회 | O |
| POST | `.../sessions/{sessionId}/data/hide` | 데이터 행 숨김 | O |
| POST | `.../sessions/{sessionId}/data/restore` | 데이터 행 원복 | O |
| POST | `.../sessions/{sessionId}/data/hide-by-values` | 컬럼 값 기반 데이터 숨김 | O |
| POST | `.../sessions/{sessionId}/data/restore-by-values` | 컬럼 값 기반 데이터 원복 | O |
| GET | `.../sessions/{sessionId}/data/group-by-two` | 두 컬럼 그룹바이 | O |
| POST | `.../sessions/{sessionId}/data/standardize` | 표준화 수행 (최빈값 통일) | O |
| POST | `.../sessions/{sessionId}/data/prepare-process` | process_data 생성 (Step 2 -> 3) | O |
| GET | `.../sessions/{sessionId}/data/process-status` | process_data 생성 상태 (폴링) | O |

### 컬럼 매핑

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `.../sessions/{sessionId}/column-mappings` | 컬럼 매핑 조회 | O |
| PUT | `.../sessions/{sessionId}/column-mappings/{columnName}/visibility` | 컬럼 가시성 변경 | O |
| PUT | `.../sessions/{sessionId}/column-mappings/batch` | 컬럼 매핑 일괄 업데이트 | O |
| PUT | `.../sessions/{sessionId}/dashboard-columns` | 대시보드 컬럼 매핑 저장 | O |

---

## 6. Data (데이터 조회/테스트)

**Base Path**: `/api/data`

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `/api/data/test` | MongoDB 삽입 테스트 | O |
| GET | `/api/data/count` | 전체 데이터 개수 조회 | O |
| GET | `/api/data/session/{sessionId}` | 세션별 데이터 조회 (캐시 지원) | O |
| GET | `/api/data` | 전체 데이터 페이징 조회 | O |

---

## 7. Preprocessing (전처리 - Step 3)

**Base Path**: `/api/projects/{projectId}/sessions/{sessionId}/preprocessing`

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `.../preprocessing/session-info` | 세션 정보 조회 (필수항목 매핑 포함) | O |
| GET | `.../preprocessing/data` | process_data 페이징 조회 | O |
| GET | `.../preprocessing/config` | 구분자/불용어 설정 조회 | O |
| PUT | `.../preprocessing/config` | 구분자/불용어 설정 저장 | O |
| GET | `.../preprocessing/extract-progress` | 키워드 추출 진행 상태 (폴링) | O |
| POST | `.../preprocessing/extract-keywords` | 키워드 추출 (구분자 기반) | O |
| POST | `.../preprocessing/remove-single-char` | 1글자 키워드 제거 | O |
| POST | `.../preprocessing/extract-keywords-nlp` | NLP 기반 키워드 추출 (형태소 분석) | O |

---

## 8. Transform (데이터 변환 - Step 4)

**Base Path**: `/api/projects/{projectId}/sessions/{sessionId}/transform`

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `.../transform/keyword-stats` | 키워드 통계 (건수 + 금액 합산) | O |
| GET | `.../transform/search-keywords` | 키워드 검색 (like 검색) | O |
| POST | `.../transform/replace-keywords` | 키워드 변환 (치환) | O |
| GET | `.../transform/original-data` | 원본 데이터 조회 (visible columns + 페이징) | O |
| GET | `.../transform/search-data` | 검색 결과 데이터 조회 | O |

---

## 9. Clustering (클러스터링 - Step 5)

**Base Path**: `/api/projects/{projectId}/sessions/{sessionId}/clustering`

### 클러스터 생성/조회

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `.../clustering/generate` | 클러스터 생성 | O |
| GET | `.../clustering/unmerged` | 미병합 클러스터 목록 (페이징) | O |
| GET | `.../clustering/unmerged-ids` | 미병합 클러스터 번호 전체 목록 | O |
| GET | `.../clustering/keyword-stats` | 키워드 통계 | O |
| GET | `.../clustering/supplier-stats` | 공급업체 통계 | O |
| GET | `.../clustering/merged` | 병합된 클러스터 목록 | O |
| GET | `.../clustering/merged/{clusterNumber}/children` | 병합 클러스터 자식 목록 | O |
| GET | `.../clustering/statistics` | 클러스터링 통계 | O |

### 병합/해제

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `.../clustering/merge` | 클러스터 병합 | O |
| POST | `.../clustering/merge/start` | 병합 시작 (신규 병합 클러스터 생성) | O |
| POST | `.../clustering/merge/batch` | 병합 배치 (클러스터 추가) | O |
| POST | `.../clustering/merge/finalize` | 병합 완료 (통계 갱신) | O |
| GET | `.../clustering/merge/active` | 병합 진행 중 여부 | O |
| GET | `.../clustering/merge/progress/{taskId}` | 병합 진행률 조회 | O |
| POST | `.../clustering/unmerge` | 클러스터 병합 해제 (전체) | O |
| POST | `.../clustering/unmerge-partial` | 클러스터 부분 해제 | O |
| POST | `.../clustering/merge-merged` | 병합 클러스터 간 재병합 | O |
| POST | `.../clustering/add-to-merged` | 기존 병합 클러스터에 추가 | O |
| PUT | `.../clustering/rename` | 클러스터명 변경 | O |
| POST | `.../clustering/auto-merge-undefined` | 미분류 자동 병합 | O |

### 고급 검색

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `.../clustering/advanced-search` | 고급 검색 (다중 조건) | O |
| POST | `.../clustering/advanced-search-ids` | 고급 검색 클러스터 번호 목록 | O |
| GET | `.../clustering/searchable-columns` | 검색 가능한 컬럼 목록 | O |

### 키워드 계층 (Lv1/Lv2/Lv3)

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `.../clustering/keyword-hierarchy` | 키워드 계층 조회 | O |
| POST | `.../clustering/keyword-hierarchy` | 키워드 계층 추가 | O |
| PUT | `.../clustering/keyword-hierarchy/{id}` | 키워드 계층 수정 | O |
| DELETE | `.../clustering/keyword-hierarchy/{id}` | 키워드 계층 삭제 | O |

---

## 10. Detail Clustering (세부 클러스터링 - Step 7)

**Base Path**: `/api/projects/{projectId}/sessions/{sessionId}/detail-clustering`

> 모든 API에 `clusterId` 파라미터가 추가됨. `cluster_sub_id` 기준으로 동작.

### 클러스터 조회

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `.../detail-clustering/unmerged` | 미병합 세부 클러스터 목록 | O |
| GET | `.../detail-clustering/unmerged-ids` | 미병합 세부 클러스터 번호 목록 | O |
| GET | `.../detail-clustering/keyword-stats` | 키워드 통계 | O |
| GET | `.../detail-clustering/supplier-stats` | 공급업체 통계 | O |
| GET | `.../detail-clustering/merged` | 병합된 세부 클러스터 목록 | O |
| GET | `.../detail-clustering/merged/{clusterNumber}/children` | 병합 클러스터 자식 목록 | O |
| GET | `.../detail-clustering/statistics` | 세부 클러스터링 통계 | O |

### 병합/해제

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `.../detail-clustering/merge` | 세부 클러스터 병합 | O |
| POST | `.../detail-clustering/unmerge` | 세부 클러스터 병합 해제 | O |
| POST | `.../detail-clustering/unmerge-partial` | 세부 클러스터 부분 해제 | O |
| POST | `.../detail-clustering/merge-merged` | 병합 클러스터 간 재병합 | O |
| POST | `.../detail-clustering/add-to-merged` | 기존 병합 클러스터에 추가 | O |
| PUT | `.../detail-clustering/rename` | 클러스터명 변경 | O |

### 고급 검색

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `.../detail-clustering/advanced-search` | 고급 검색 | O |
| POST | `.../detail-clustering/advanced-search-ids` | 고급 검색 클러스터 번호 목록 | O |
| GET | `.../detail-clustering/searchable-columns` | 검색 가능한 컬럼 목록 | O |

### 키워드 계층

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `.../detail-clustering/keyword-hierarchy` | 키워드 계층 조회 | O |
| POST | `.../detail-clustering/keyword-hierarchy` | 키워드 계층 추가 | O |
| PUT | `.../detail-clustering/keyword-hierarchy/{id}` | 키워드 계층 수정 | O |
| DELETE | `.../detail-clustering/keyword-hierarchy/{id}` | 키워드 계층 삭제 | O |

---

## 11. Export (내보내기 - Step 6)

**Base Path**: `/api/projects/{projectId}/sessions/{sessionId}/export`

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `.../export/all-data` | 전체 데이터 조회 (클러스터명 포함) | O |
| GET | `.../export/merged-clusters` | 병합된 클러스터 목록 (세부 포함) | O |
| GET | `.../export/cluster/{clusterNumber}/data` | 클러스터별 상세 데이터 | O |
| PUT | `.../export/cluster/{clusterNumber}/name` | 클러스터명 수정 | O |
| GET | `.../export/columns` | 제거열 목록 조회 | O |
| PUT | `.../export/columns` | 제거열 설정 업데이트 | O |
| POST | `.../export/export/selected` | 선택된 클러스터 Excel 내보내기 | O |
| POST | `.../export/export/all` | 전체 클러스터 Excel 내보내기 | O |
| GET | `.../export/download-url` | Export 다운로드 URL 조회 | O |
| POST | `.../export/complete` | 세션 완료 처리 (비동기, mode 지원) | O |
| GET | `.../export/complete/progress/{taskId}` | 세션 완료 진행률 조회 | O |
| GET | `.../export/complete/active` | 세션 완료 활성 여부 | O |

---

## 12. Cost Reduction Dashboard (원가절감 대시보드)

**Base Path**: `/api/projects/{projectId}/dashboard`

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `.../dashboard/init` | 대시보드 초기화 | O |
| GET | `.../dashboard/status` | 대시보드 상태 조회 | O |
| POST | `.../dashboard/lock/acquire` | 편집자 잠금 획득 | O |
| POST | `.../dashboard/lock/heartbeat` | 편집자 잠금 하트비트 | O |
| POST | `.../dashboard/lock/release` | 편집자 잠금 해제 | O |
| POST | `.../dashboard/transition` | 페이즈 전환 | O |
| POST | `.../dashboard/unlock-list` | 리스트 잠금 해제 | O |
| GET | `.../dashboard/lock-status` | 잠금 상태 확인 | O |
| DELETE | `.../dashboard/reset` | 대시보드 전체 초기화 | O |

---

## 13. Long List

**Base Path**: `/api/projects/{projectId}/longlist`

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `.../longlist/tree` | 트리 데이터 조회 | O |
| GET | `.../longlist/stats` | Long List 통계 | O |
| GET | `.../longlist/chart/{statisticsId}` | 차트 데이터 (Top N) | O |
| GET | `.../longlist/item-stats/{statisticsId}` | 항목별 통계 | O |
| GET | `.../longlist/chart/account/{accountName}` | 계정명별 차트 데이터 | O |
| GET | `.../longlist/item-stats/account/{accountName}` | 계정명별 항목 통계 | O |
| POST | `.../longlist/save` | Long List 선택 저장 | O |
| POST | `.../longlist/save-by-ids` | statisticsId로 선택 저장 (경량) | O |
| GET | `.../longlist/selections` | 저장된 선택 항목 조회 | O |
| GET | `.../longlist/raw-data/{statisticsId}` | Raw 데이터 조회 (페이징) | O |
| GET | `.../longlist/raw-data/account/{accountName}` | 계정명별 Raw 데이터 조회 | O |

---

## 14. Short List

**Base Path**: `/api/projects/{projectId}/shortlist`

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `.../shortlist/tree` | 트리 데이터 조회 | O |
| GET | `.../shortlist/stats` | Short List 통계 | O |
| GET | `.../shortlist/chart/{statisticsId}` | 차트 데이터 (Top N) | O |
| GET | `.../shortlist/item-stats/{statisticsId}` | 항목별 통계 | O |
| GET | `.../shortlist/chart/account/{accountName}` | 계정명별 차트 데이터 | O |
| GET | `.../shortlist/item-stats/account/{accountName}` | 계정명별 항목 통계 | O |
| GET | `.../shortlist/selection-tree` | 선택 트리 조회 | O |
| POST | `.../shortlist/save` | Short List 선택 저장 | O |
| GET | `.../shortlist/selections` | 저장된 선택 항목 조회 | O |
| GET | `.../shortlist/raw-data/{statisticsId}` | Raw 데이터 조회 (페이징) | O |
| GET | `.../shortlist/raw-data/account/{accountName}` | 계정명별 Raw 데이터 조회 | O |

---

## 15. Able Task

**Base Path**: `/api/projects/{projectId}/tasks`

### Task 관리

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `.../tasks` | Task 생성 | O |
| GET | `.../tasks` | Task 목록 조회 | O |
| GET | `.../tasks/locked-statistics` | 잠긴 statistics ID 목록 | O |
| GET | `.../tasks/summary` | Task 요약 (전체 통계) | O |
| GET | `.../tasks/{taskId}` | Task 상세 조회 | O |
| PUT | `.../tasks/{taskId}` | Task 수정 | O |
| POST | `.../tasks/{taskId}/reset` | Task 초기화 | O |
| DELETE | `.../tasks/{taskId}` | Task 삭제 | O |

### 문서/링크 관리

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `.../tasks/{taskId}/documents` | 문서 목록 조회 | O |
| POST | `.../tasks/{taskId}/documents/link` | 링크 추가 | O |
| POST | `.../tasks/{taskId}/documents/upload-url` | 파일 업로드 URL 생성 | O |
| GET | `.../tasks/{taskId}/documents/{documentId}/download-url` | 문서 다운로드 URL | O |
| DELETE | `.../tasks/{taskId}/documents/{documentId}` | 문서 삭제 | O |

### 주간 진행 관리

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `.../tasks/{taskId}/weekly-progress` | 주간 진행 목록 | O |
| POST | `.../tasks/{taskId}/weekly-progress` | 주간 진행 생성 | O |
| PUT | `.../tasks/{taskId}/weekly-progress/{progressId}` | 주간 진행 수정 | O |
| DELETE | `.../tasks/{taskId}/weekly-progress/{progressId}` | 주간 진행 삭제 | O |

---

## 16. Dashboard Generation (대시보드 생성)

**Base Path**: `/api/projects/{projectId}/dashboard/generate`

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `.../dashboard/generate/batch` | 배치 데이터 생성 시작 | O |
| GET | `.../dashboard/generate/status` | 배치 생성 진행 상태 | O |

---

## 17. Clustering Import (클러스터링 Import)

**Base Path**: `/api/projects/{projectId}/dashboard/import`

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `.../dashboard/import/process` | 클러스터링 완료 Excel Import (multipart) | O |

---

## 18. Common (공통)

### Cache 테스트

**Base Path**: `/api/cache`

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | `/api/cache/test` | Redis 저장 테스트 | O |
| GET | `/api/cache/test/{key}` | Redis 조회 테스트 | O |
| POST | `/api/cache/session` | 세션 저장 테스트 | O |
| GET | `/api/cache/session/{sessionId}` | 세션 조회 테스트 | O |
| POST | `/api/cache/upload/progress` | 업로드 진행률 저장 | O |
| GET | `/api/cache/upload/progress/{uploadId}` | 업로드 진행률 조회 | O |

### System

**Base Path**: `/api/system`

> **[Phase 3 피드백 반영]** `/api/system/**` 경로는 SecurityConfig에서 `permitAll`로 설정되어 있지 않다. `anyRequest().authenticated()` 규칙에 의해 **인증 필요**. 프론트엔드 `systemService.js`가 별도 axios 인스턴스로 호출하며 토큰 미첨부 시 401 발생 가능. 상세 내용은 architecture.md 4.2절 참조.

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `/api/system/maintenance-status` | 유지보수/Lambda 상태 조회 | O (authenticated 필수) |
| GET | `/api/system/upload-progress` | Lambda 업로드 진행률 조회 | O (authenticated 필수) |

### Health

**Base Path**: `/api`

| Method | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | `/api/health` | 앱 헬스 체크 | X |
| GET | `/api/health/db` | DB 상태 진단 (ping, 커넥션, Semaphore) | X |
| GET | `/api/info` | 앱 정보 | X |

---

## 엔드포인트 요약 통계

| 도메인 | 엔드포인트 수 |
|--------|-------------|
| Auth | 7 |
| Admin | 19 |
| Project | 10 |
| Upload | 14 |
| FileSession | 38 |
| Data | 4 |
| Preprocessing | 8 |
| Transform | 5 |
| Clustering | 24 |
| Detail Clustering | 18 |
| Export | 12 |
| Dashboard | 9 |
| Long List | 11 |
| Short List | 11 |
| Able Task | 13 |
| Dashboard Generation | 2 |
| Clustering Import | 1 |
| Common | 12 |
| **합계** | **~218** |
