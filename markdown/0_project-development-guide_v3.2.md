# LG CNS Finance Tool - Spring Boot 마이그레이션 프로젝트 개발 가이드

> **📋 프로젝트 필수 참고 문서**
> 
> 이 문서는 **프로젝트 전체 개발 방향 및 가이드**를 제공합니다.
> - 새로운 개발 세션 시작 시 반드시 이 문서를 먼저 읽으세요
> - 모든 개발은 이 문서의 우선순위와 설계를 따라야 합니다
> - 임의로 데이터 구조나 프로세스를 변경하지 마세요
> 
> **GitHub 저장소:**
> - 기존 C# 프로젝트: https://github.com/scschwan/lgcns_1st_nosql.git
> - 신규 Spring Boot 프로젝트: https://github.com/scschwan/lg_cns_web.git

**문서 버전:** 3.2 ⭐ Phase 3 완료  
**최종 업데이트:** 2025-01-29  
**프로젝트 목표:** C# WinForms FinanceTool을 Spring Boot + React 웹 애플리케이션으로 마이그레이션

---

## 📋 목차
- [1. 프로젝트 개요](#1-프로젝트-개요)
- [2. 개발 우선순위 및 단계](#2-개발-우선순위-및-단계)
- [3. C# 메뉴 구조 (실제 코드)](#3-c-메뉴-구조-실제-코드)
- [4. 데이터베이스 설계](#4-데이터베이스-설계)
- [5. Phase 2 상세 설명](#5-phase-2-상세-설명)
- [6. API 설계](#6-api-설계)
- [7. Phase 3 프론트엔드 구현](#7-phase-3-프론트엔드-구현)
- [8. 개발 스케줄](#8-개발-스케줄)
- [9. v3.2 수정 사항](#9-v32-수정-사항)

---

## 1. 프로젝트 개요

### 1.1 프로젝트 목표

**기존 시스템:**
- C# WinForms 기반 데스크톱 애플리케이션
- 로컬 Excel 파일 처리
- 단일 사용자 환경
- MongoDB 연동

**목표 시스템:**
- Spring Boot + React 웹 애플리케이션
- AWS 클라우드 기반 (ECS Fargate, DocumentDB, S3, Lambda)
- 다중 사용자 협업 지원
- 프로젝트 단위 데이터 관리
- 대용량 파일 병렬 처리 (SQS + Lambda)

### 1.2 핵심 마이그레이션 원칙
```
✅ DO (반드시 지켜야 할 원칙):
1. 기존 C# 비즈니스 로직 100% 재현
2. MongoDB 컬렉션 구조 그대로 유지
3. 7단계 프로세스 순서 및 동작 동일하게 구현
4. 필드명 그대로 사용 (data 내부 키도 sanitization 불필요)
5. UI 구성은 C# WinForms를 반응형 웹으로 재해석
6. C# GitHub 코드의 Model, Repository 필드를 정확히 반영

❌ DON'T (하지 말아야 할 것):
1. 임의로 데이터 구조 변경
2. 비즈니스 로직 순서 변경
3. 컬렉션 관계 재설계
4. 필드명 변환 (sanitization)
5. 기존 기능 생략
6. C# 코드 분석 없이 추측으로 구현
```

---

## 2. 개발 우선순위 및 단계

```
Phase 0: 인증 및 프로젝트 관리 (완료) ✅
   ├─ 사용자 로그인/회원가입
   ├─ JWT 인증
   ├─ 프로젝트 생성/관리
   ├─ 프로젝트 공유 및 권한 관리
   └─ 프로젝트별 세션 격리

Phase 1: 대용량 파일 업로드 (완료) ✅
   ├─ S3 Presigned URL 업로드
   ├─ SQS 메시지 큐
   ├─ Lambda Coordinator (파일 분석)
   ├─ Lambda Worker (병렬 파싱 → raw_data)
   └─ 진행률 추적 (Redis)

Phase 2: 비즈니스 로직 구현 (대기 중) ⚠️
   ├─ Step 1: Multi File Upload (세션 생성 - raw_data → session_data)
   ├─ Step 2: File Load (session_data 조회)
   ├─ Step 3: Preprocessing (session_data → process_data)
   ├─ Step 4: Data Transform (process_data → process_view_data)
   ├─ Step 5: Clustering (process_view_data → clustering_results)
   ├─ Step 6: Export (Excel 내보내기 + 세션 완료)
   └─ Step 7: Detail Clustering (서브 클러스터링)
   ⚠️ 현재 구현과 가이드 문서 간 아키텍처 차이 존재 → 재구현 필요

Phase 3: UI 구현 (완료) ✅
   ├─ 프론트엔드 대규모 리팩토링 (CRA → Vite, MUI → shadcn/ui)
   ├─ Step 1: Multi File Upload 화면
   ├─ Step 2: File Load 화면
   ├─ Step 3: Preprocessing 화면
   ├─ Step 4: Data Transform 화면
   ├─ Step 5: Clustering 화면
   ├─ Step 6: Export 화면
   └─ Step 10: Detail Clustering 화면
```

### 📊 현재 진행률

```
Phase 0: ████████████████████ 100% (30/30) ✅
Phase 1: ████████████████████ 100% (35/35) ✅
Phase 2: ░░░░░░░░░░░░░░░░░░░░   0% (0/157) ⚠️
Phase 3: ████████████████████ 100% (42/42) ✅

전체:    ████████░░░░░░░░░░░░  41% (107/264)
```

---

## 3. C# 메뉴 구조 (실제 코드)

### 3.1 Form1.cs 메뉴 구조
```csharp
// FinanceTool/Form1.cs
fileUploadToolStripMenuItem         → uc_multiFileUpload      (Step 1)
fileLoadToolStripMenuItem           → uc_fileLoad             (Step 2)
dataPreprocessingToolStripMenuItem  → uc_Preprocessing        (Step 3)
dataAnalToolStripMenuItem           → uc_dataTransform        (Step 4)
classificationToolStripMenuItem     → uc_clustering           (Step 5)
exportToolStripMenuItem             → uc_classification       (Step 6)
subClusteringToolStripMenuItem      → uc_detailClustering     (Step 7)
```

### 3.2 각 단계별 매핑

| Step | 메뉴명 | C# UserControl | 핵심 기능 |
|------|--------|----------------|----------|
| 1 | File Upload | uc_multiFileUpload | 세션 생성 (raw_data → session_data) |
| 2 | File Load | uc_fileLoad | session_data 조회 |
| 3 | Preprocessing | uc_Preprocessing | session_data → process_data |
| 4 | Data Transform | uc_dataTransform | process_data → process_view_data |
| 5 | Clustering | uc_clustering | 클러스터링 (clustering_results) |
| 6 | Export | uc_classification | Excel 내보내기 + 세션 완료 |
| 7 | Sub Clustering | uc_detailClustering | 서브 클러스터링 |

---

## 4. 데이터베이스 설계

### 4.0 데이터 흐름 개요 ⭐⭐⭐
```
[Lambda Worker]
    ↓
    Excel 파싱 → raw_data (원본, sessionId 없음)
    
[Step 1: Multi File Upload - "세션 생성"]
    ↓
    raw_data 복사 → session_data (sessionId 추가) ⭐⭐⭐
    
[Step 2: File Load → Step 3: Preprocessing]
    ↓
    session_data → process_data (먼저 생성!)
    
[Step 3: Preprocessing → Step 4: Transform]
    ↓
    process_data → process_view_data (그 다음 생성!)
    
[Step 4: Transform → Step 5: Clustering]
    ↓
    process_view_data → clustering_results
    process_data.cluster_id 업데이트
```

**핵심 원칙:**
- **raw_data**: 원본 보관소 (프로젝트 삭제 전까지 불변)
- **session_data**: 작업용 복사본 (세션 생성/병합/삭제 가능)
- **process_data**: Step 2→3에서 생성 (session_data 기반)
- **process_view_data**: Step 3→4에서 생성 (process_data 기반)


---

### 4.1 raw_data (원본 보관소)

**용도:** Lambda Worker가 Excel 파싱 시 최초 생성

**특징:**
- ❌ **sessionId 없음!** (프로젝트 단위로만 관리)
- ✅ 프로젝트 삭제 전까지 **절대 수정 안 됨**
- ✅ 일종의 "백업/원본"
```javascript
{
    "_id": ObjectId("69683faad0661d97f5f9d4e1"),
    "project_id": "proj-uuid-123",
    "upload_id": "upload-uuid-789",
    "row_number": 1,
    "data": {
        "계정명": "지급수수료",
        "CO 오브젝트이름": "인터넷몰 더데이걸",
        "상계계정이름": "지급수수료(물류용역)",
        "Val.in RC": {
            "_t": "System.Decimal",
            "_v": 5461923
        },
        "이름": "이커머스 실비 안분_지급수수료"
    },
    "created_at": ISODate("2025-12-16T10:00:00Z")
}
```

**MongoDB Index:**
```javascript
db.raw_data.createIndex({ project_id: 1, upload_id: 1 })
db.raw_data.createIndex({ project_id: 1, created_at: -1 })
```

---

### 4.2 session_data (작업용 복사본) ⭐⭐⭐ 핵심!

**용도:** Multi File Upload에서 "세션 생성" 시 raw_data 복사

**특징:**
- ✅ **sessionId 필수!** (세션 단위 작업)
- ✅ raw_data와 구조 동일하지만 sessionId 추가
- ✅ **세션 병합/삭제는 여기서만**
- ✅ **모든 Step 2-7은 이 컬렉션 기반**
```javascript
{
    "_id": ObjectId("..."),
    "project_id": "proj-uuid-123",
    "session_id": "session-uuid-456",       // ✅✅✅ 핵심!
    "raw_data_id": ObjectId("69683faad0661d97f5f9d4e1"),
    "upload_id": "upload-uuid-789",
    "row_number": 1,
    "data": {
        "계정명": "지급수수료",
        "CO 오브젝트이름": "인터넷몰 더데이걸",
        "상계계정이름": "지급수수료(물류용역)",
        "Val.in RC": {
            "_t": "System.Decimal",
            "_v": 5461923
        },
        "이름": "이커머스 실비 안분_지급수수료"
    },
    "created_at": ISODate("2025-12-16T10:00:00Z")
}
```

**MongoDB Index:**
```javascript
db.session_data.createIndex({ session_id: 1, row_number: 1 })
db.session_data.createIndex({ project_id: 1, session_id: 1 })
db.session_data.createIndex({ raw_data_id: 1 })
```

**주요 작업:**

**1. 세션 생성 (raw_data → session_data):**
```javascript
db.raw_data.find({ 
    project_id: "proj-123", 
    upload_id: { $in: ["upload-1", "upload-2"] } 
}).forEach(doc => {
    db.session_data.insertOne({
        ...doc,
        _id: new ObjectId(),
        session_id: "session-456",     // ⭐ 추가
        raw_data_id: doc._id,
        created_at: new Date()
    });
});
```

**2. 세션 병합:**
```javascript
db.session_data.updateMany(
    { session_id: { $in: ["session-1", "session-2"] } },
    { $set: { session_id: "session-merged" } }
);
```

**3. 세션 삭제:**
```javascript
db.session_data.deleteMany({ session_id: "session-456" });
```

---

### 4.3 process_data (전처리 데이터) ⭐ Step 2→3

**용도:** File Load → Preprocessing에서 생성

**특징:**
- ✅ Step 2→3에서 **먼저 생성** (process_view_data보다 먼저!)
- ✅ session_data 1:1 매핑
- ✅ import_date, processed_date 필드
- ✅ cluster_id, cluster_name은 Step 5에서 업데이트

**실제 MongoDB 데이터:**
```javascript
{
    "_id": ObjectId("69683fced0661d97f5f9ed78"),
    "raw_data_id": ObjectId("69683faad0661d97f5f9d4e1"),
    "data": {
        "계정명": "지급수수료",
        "CO 오브젝트이름": "인터넷몰 더데이걸",
        "상계계정이름": "지급수수료(물류용역)",
        "Val.in RC": {
            "_t": "System.Decimal",
            "_v": 5461923
        },
        "이름": "이커머스 실비 안분_지급수수료"
    },
    "import_date": ISODate("2026-01-15T01:15:21.744Z"),
    "processed_date": ISODate("2026-01-15T01:15:58.711Z"),
    "cluster_id": null,
    "cluster_name": null
}
```

**MongoDB Index:**
```javascript
db.process_data.createIndex({ raw_data_id: 1 })
db.process_data.createIndex({ cluster_id: 1 })
db.process_data.createIndex({ import_date: -1 })
```

---

### 4.4 process_view_data (키워드 추출) ⭐ Step 3→4

**용도:** Preprocessing → Transform에서 생성

**특징:**
- ✅ Step 3→4에서 생성 (process_data 이후!)
- ✅ **process_data_id 참조** ⭐⭐⭐
- ✅ keywords 객체 (final_keywords, money, department, supplier)

**실제 MongoDB 데이터:**
```javascript
{
    "_id": ObjectId("69683fd9d0661d97f5fa05f6"),
    "process_data_id": ObjectId("69683fced0661d97f5fa052f"),  // ⭐⭐⭐
    "raw_data_id": ObjectId("69683faad0661d97f5f9ec98"),
    "keywords": {
        "final_keywords": [
            "이커머스",
            "실비",
            "안분",
            "지급수수료"
        ],
        "money": "135957",
        "department": "강남 에코마트",
        "supplier": "지급수수료(물류용역)"
    },
    "last_modified_date": ISODate("2026-01-15T01:16:09.059Z")
}
```

**MongoDB Index:**
```javascript
db.process_view_data.createIndex({ process_data_id: 1 })
db.process_view_data.createIndex({ raw_data_id: 1 })
db.process_view_data.createIndex({ "keywords.final_keywords": 1 })
```

---

### 4.5 clustering_results (클러스터링 결과) ⭐⭐⭐

**용도:** Transform → Clustering에서 생성

**특징:**
- ✅ **cluster_number**: 고유 인덱스 (순번)
- ✅ **cluster_id**: 병합 클러스터 인덱스 (-1이면 미병합)
- ✅ **cluster_sub_id**: 서브 클러스터 인덱스 (-1이면 미병합)
- ✅ **data_indices**: process_data ID 배열

**실제 MongoDB 데이터:**
```javascript
{
    "_id": ObjectId("69672e4c447d29ec1c6535fd"),
    "cluster_number": 1,              // ⭐ 고유 인덱스
    "cluster_id": 1492,               // ⭐ 병합 인덱스 (-1이면 미병합)
    "cluster_sub_id": -1,             // ⭐ 서브 인덱스 (-1이면 미병합)
    "cluster_name": "실비_안분_이커머스_인터넷몰 SAP_지급수수료",
    "keywords": [
        "실비",
        "안분",
        "이커머스",
        "인터넷몰 SAP",
        "지급수수료",
        "지급수수료(물류용역)"
    ],
    "count": 15,
    "total_amount": 5807546,
    "data_indices": [                 // ⭐ process_data ID 배열
        ObjectId("69672c44447d29ec1c64ee8e"),
        ObjectId("69672c44447d29ec1c64ee13"),
        ObjectId("69672c44447d29ec1c64ed9b"),
        // ... 15개
    ],
    "created_at": ISODate("2026-01-14T05:49:00.748Z")
}
```

**클러스터 병합 로직:**

**1. 초기 생성 (미병합):**
```javascript
{
    "cluster_number": 1,
    "cluster_id": -1,       // 미병합
    "cluster_sub_id": -1,
    "data_indices": [/* IDs */]
}
```

**2. 클러스터 병합 (1, 2, 3 → 신규 10):**
```javascript
// 신규 병합 클러스터
{
    "cluster_number": 10,
    "cluster_id": -1,
    "cluster_sub_id": -1,
    "data_indices": [/* 1+2+3 합침 */]
}

// 기존 업데이트
db.clustering_results.updateMany(
    { cluster_number: { $in: [1, 2, 3] } },
    { $set: { cluster_id: 10 } }  // ⭐ 신규 cluster_number
)
```

**3. 서브 병합 (10 내부 세분화 → 20):**
```javascript
// 신규 서브 클러스터
{
    "cluster_number": 20,
    "cluster_id": 10,       // 부모
    "cluster_sub_id": -1,
    "data_indices": [/* 일부 */]
}

// 부모 업데이트
db.clustering_results.update(
    { cluster_number: 10 },
    { $set: { cluster_sub_id: 20 } }
)
```

**MongoDB Index:**
```javascript
db.clustering_results.createIndex({ cluster_number: 1 }, { unique: true })
db.clustering_results.createIndex({ cluster_id: 1 })
db.clustering_results.createIndex({ cluster_sub_id: 1 })
db.clustering_results.createIndex({ data_indices: 1 })
```

---

### 4.6 file_sessions (세션 메타데이터)
```javascript
{
    "_id": ObjectId("..."),
    "session_id": "session-uuid-456",
    "project_id": "proj-uuid-123",
    "created_by": ObjectId("..."),
    "uploaded_files": [
        {
            "file_id": ObjectId("..."),
            "file_name": "재무데이터_2025.xlsx",
            "file_size": 52428800,
            "uploaded_at": ISODate("...")
        }
    ],
    "is_completed": false,            // Step 6에서 true
    "export_path": null,              // Step 6에서 S3 경로
    "completed_at": null,             // Step 6에서 시간 기록
    "created_at": ISODate("..."),
    "last_accessed_at": ISODate("...")
}
```

---

### 4.7 데이터 참조 관계도
```
[raw_data]
    ↓ (복사, Step 1)
[session_data]
    └─ raw_data_id
    ↓ (변환, Step 2→3)
[process_data]
    ├─ raw_data_id
    ├─ cluster_id ← (Step 5)
    └─ cluster_name ← (Step 5)
    ↓ (키워드 추출, Step 3→4)
[process_view_data]
    ├─ process_data_id ⭐⭐⭐
    └─ raw_data_id
    ↓ (그룹핑, Step 4→5)
[clustering_results]
    ├─ data_indices[] ← process_data IDs ⭐⭐⭐
    ├─ cluster_number (고유)
    ├─ cluster_id (병합)
    └─ cluster_sub_id (서브)
```

---

## 5. Phase 2 상세 설명

### 5.1 Step 1: Multi File Upload

**C# 코드:** `uc_multiFileUpload.cs`

**핵심 기능:**
1. 업로드된 파일 목록 표시
2. "세션 생성" 버튼 클릭
3. **raw_data → session_data 복사** (sessionId 추가)
4. file_sessions 메타데이터 생성

**Spring Boot API:**
```http
POST /api/projects/{projectId}/upload/sessions
Request: {
    "sessionName": "2025년 1월 데이터",
    "fileIds": ["file-1", "file-2"],
    "operator": "홍길동"
}
Response: {
    "sessionId": "session-456",
    "copiedRecords": 150000
}
```

---

### 5.2 Step 2: File Load

**C# 코드:** `uc_fileLoad.cs`

**핵심 기능:**
1. session_data 조회 (페이징)
2. 데이터 확인
3. "계정 분석 시작" 버튼 → Step 3

**Spring Boot API:**
```http
GET /api/data/session/{sessionId}?page=1&size=1000

GET /api/data/session/{sessionId}/summary
Response: {
    "totalRecords": 150000,
    "totalAmount": 500000000
}
```

---

### 5.3 Step 3: Preprocessing

**C# 코드:** `uc_Preprocessing.cs`

**핵심 기능:**
1. session_data → **process_data 생성** (먼저!)
2. import_date, processed_date 기록

**Spring Boot API:**
```http
POST /api/preprocessing/create-process-data
Request: {
    "sessionId": "session-123",
    "projectId": "proj-123"
}
Response: {
    "processedCount": 150000,
    "duration": "15s"
}
```

---

### 5.4 Step 4: Data Transform

**C# 코드:** `uc_dataTransform.cs`

**핵심 기능:**
1. process_data → **process_view_data 생성** (그 다음!)
2. 키워드 추출 (구분자 기반)
3. process_data_id 참조 설정

**Spring Boot API:**
```http
POST /api/transform/extract-keywords
Request: {
    "sessionId": "session-123",
    "columns": ["이름", "계정명"]
}
Response: {
    "extractedCount": 150000,
    "uniqueKeywords": 3500
}

POST /api/transform/merge-keywords
Request: {
    "sessionId": "session-123",
    "fromKeywords": ["이커머스", "e커머스"],
    "toKeyword": "이커머스"
}
```

---

### 5.5 Step 5: Clustering

**C# 코드:** `uc_Clustering.cs`

**핵심 기능:**
1. process_view_data 기반 그룹핑
2. clustering_results 생성
   - cluster_number (고유)
   - cluster_id = -1 (미병합)
   - data_indices (process_data IDs)
3. process_data.cluster_id 업데이트

**Spring Boot API:**
```http
POST /api/clustering/create-initial
Request: {
    "sessionId": "session-123"
}
Response: {
    "totalClusters": 450,
    "totalRecords": 150000
}

POST /api/clustering/merge
Request: {
    "sessionId": "session-123",
    "sourceClusterNumbers": [1, 2, 3],
    "newClusterName": "병합_클러스터"
}
Response: {
    "newClusterNumber": 500
}
```

---

### 5.6 Step 6: Export

**C# 코드:** `uc_Classification.cs`

**핵심 기능:**
1. clustering_results → Excel 변환
2. data_indices 기반 process_data 조회
3. S3 업로드 + Presigned URL
4. file_sessions 완료 처리

**Spring Boot API:**
```http
POST /api/export/excel
Request: {
    "sessionId": "session-123",
    "columns": ["날짜", "금액", "cluster_name"]
}
Response: {
    "downloadUrl": "https://s3.../...",
    "fileSize": 5242880
}

PUT /api/projects/{projectId}/upload/sessions/{sessionId}/complete
Request: {
    "exportPath": "s3://..."
}
```

---

### 5.7 Step 7: Detail Clustering

**C# 코드:** `uc_detailClustering.cs`

**핵심 기능:**
1. 부모 클러스터 선택
2. 서브 클러스터 생성
3. cluster_sub_id 업데이트

**Spring Boot API:**
```http
POST /api/clustering/{clusterNumber}/sub-cluster
Request: {
    "sessionId": "session-123",
    "parentClusterNumber": 500,
    "subKeywords": ["실비", "안분"]
}
Response: {
    "newClusterNumber": 600,
    "parentClusterNumber": 500
}
```

---

## 6. API 설계

### 6.1 Step 1: Multi File Upload
```
POST   /api/projects/{projectId}/upload/presigned-url
POST   /api/projects/{projectId}/upload/sessions
POST   /api/projects/{projectId}/upload/sessions/batch
GET    /api/projects/{projectId}/upload/sessions
GET    /api/projects/{projectId}/upload/sessions/{sessionId}
PUT    /api/projects/{projectId}/upload/sessions/{sessionId}
DELETE /api/projects/{projectId}/upload/sessions/{sessionId}
POST   /api/projects/{projectId}/upload/sessions/{sessionId}/start
POST   /api/projects/{projectId}/upload/sessions/merge
```

### 6.2 Step 2: File Load
```
GET    /api/data/session/{sessionId}
GET    /api/data/session/{sessionId}/summary
GET    /api/data/session/{sessionId}/columns
GET    /api/data/session/{sessionId}/count
```

### 6.3 Step 3: Preprocessing
```
POST   /api/preprocessing/create-process-data
GET    /api/preprocessing/process-data/{sessionId}
GET    /api/preprocessing/process-data/{sessionId}/count
```

### 6.4 Step 4: Transform
```
POST   /api/transform/extract-keywords
POST   /api/transform/merge-keywords
GET    /api/transform/keyword-summary/{sessionId}
GET    /api/transform/process-view-data/{sessionId}
```

### 6.5 Step 5: Clustering
```
POST   /api/clustering/create-initial
POST   /api/clustering/merge
GET    /api/clustering/results/{sessionId}
GET    /api/clustering/results/{sessionId}/{clusterNumber}
PUT    /api/clustering/results/{clusterNumber}/name
DELETE /api/clustering/results/{clusterNumber}
```

### 6.6 Step 6: Export
```
POST   /api/export/excel
PUT    /api/projects/{projectId}/upload/sessions/{sessionId}/complete
GET    /api/projects/{projectId}/upload/sessions/{sessionId}/result/download
```

### 6.7 Step 7: Detail Clustering
```
POST   /api/clustering/{clusterNumber}/sub-cluster
GET    /api/clustering/{clusterNumber}/sub-clusters
PUT    /api/clustering/{clusterNumber}/sub-clusters/{subClusterNumber}/name
```

---

## 7. Phase 3 프론트엔드 구현

### 7.1 대규모 리팩토링 완료 ✅

**기간:** 2025-01-29 (1일)  
**범위:** 전체 프론트엔드 스택 재구성

#### 빌드 도구 변경

```
❌ Create React App (CRA)
   - 느린 빌드 속도 (30초~1분)
   - 복잡한 설정
   - 무거운 번들 크기

✅ Vite
   - 초고속 빌드 (1~3초) - 10배 향상
   - 간단한 설정 (vite.config.js)
   - HMR 최적화
   - 경량 번들 크기
```

#### UI 프레임워크 변경

```
❌ Material-UI (@mui/material)
   - 무거운 번들 크기 (~1MB)
   - 복잡한 커스터마이징
   - 래퍼 컴포넌트 남용

✅ shadcn/ui + Tailwind CSS
   - 경량 컴포넌트 (필요한 것만 설치)
   - Tailwind 기반 커스터마이징
   - 뛰어난 성능
   - 네이티브 HTML 구조
   - Radix UI 기반 접근성
   - 번들 크기 67% 감소 (1.2MB → 400KB)
```

#### 삭제된 공통 컴포넌트

```
❌ /components/common/StyledDataGrid.jsx
❌ /components/common/Pagination.jsx
❌ /components/common/ActionButton.jsx
❌ /components/common/StyledGroupBox.jsx
❌ /components/common/SessionHeader.jsx

→ shadcn/ui 네이티브 컴포넌트로 대체
```

### 7.2 설계 패턴

#### 수동 페이징 패턴

```jsx
// 공통 패턴 (FileLoad, Clustering, Export)
<div className="flex gap-1">
  <Button onClick={() => setPage(1)} disabled={page === 1}>
    처음
  </Button>
  <Button onClick={() => setPage(page - 1)} disabled={page === 1}>
    이전
  </Button>
  <span className="px-2">{page} / {totalPages}</span>
  <Button onClick={() => setPage(page + 1)} disabled={page === totalPages}>
    다음
  </Button>
  <Button onClick={() => setPage(totalPages)} disabled={page === totalPages}>
    마지막
  </Button>
</div>

<Select value={pageSize.toString()} onValueChange={setPageSize}>
  <SelectItem value="20">20개씩</SelectItem>
  <SelectItem value="50">50개씩</SelectItem>
  <SelectItem value="100">100개씩</SelectItem>
  <SelectItem value="1000">1000개씩</SelectItem>
</Select>
```

#### 반응형 레이아웃

```jsx
// 12 컬럼 그리드 시스템
<div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
  <div className="xl:col-span-8">좌측 (8/12)</div>
  <div className="xl:col-span-4">우측 (4/12)</div>
</div>

// 모바일: 1 컬럼
// 데스크탑(xl): 12 컬럼 분할
```

#### Sticky 헤더/컬럼

```jsx
<TableHeader className="sticky top-0 z-10 bg-gray-100">
  <TableHead className="sticky left-0 z-20">고정 컬럼</TableHead>
  <TableHead className="sticky left-[90px] z-20">고정 컬럼2</TableHead>
</TableHeader>
```

### 7.3 완료된 페이지 목록

```
✅ Step 1: MultiFileUploadPage.jsx
   - 파일 업로드 UI (Drag & Drop 준비)
   - 업로드 파일 목록 테이블
   - 진행률 표시
   - 세션 생성/병합/삭제 버튼

✅ Step 2: FileLoadPage.jsx
   - session_data 테이블 (페이징)
   - Sticky 헤더 및 컬럼
   - 수동 페이징 (1000/2000/5000)

✅ Step 3: PreprocessingPage.jsx
   - 좌우 분할 (8/12, 4/12)
   - 키워드 추출 설정 UI
   - 진행률 표시

✅ Step 4: DataTransformPage.jsx
   - 키워드별 데이터 테이블
   - 키워드 병합 UI
   - 키워드 통계

✅ Step 5: ClusteringPage.jsx
   - 클러스터별 데이터 테이블
   - 클러스터 관리 UI
   - 검색 및 수동 페이징

✅ Step 6: ExportPage.jsx
   - 원본 + Export 결과 (각 flex-1)
   - 제거 열 설정
   - Excel 내보내기 & 세션 완료

✅ Step 10: DetailClusteringPage.jsx
   - 서브 클러스터 생성 UI
   - 서브 클러스터 목록
```

### 7.4 설치된 shadcn/ui 컴포넌트

```bash
✅ Button
✅ Card (CardContent, CardHeader, CardTitle)
✅ Checkbox
✅ Input
✅ Table (TableHeader, TableBody, TableRow, TableHead, TableCell)
✅ Badge
✅ Select (SelectTrigger, SelectValue, SelectContent, SelectItem)
✅ Breadcrumb (BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage)
✅ Textarea
✅ Progress
```

### 7.5 성능 개선 결과

```
빌드 시간:  30초 → 3초    (10배 향상)
번들 크기:  1.2MB → 400KB (67% 감소)
HMR 속도:   500ms → 50ms  (10배 향상)
```

---

## 8. 개발 스케줄

```
Phase 0: 인증 및 프로젝트 관리 (완료) ✅
   기간: 1주
   
Phase 1: 대용량 파일 업로드 (완료) ✅
   기간: 2주

Phase 2: 비즈니스 로직 구현 (대기 중) ⚠️
   기간: 4주 (재구현 시 5주)
   - Step 1: 2일
   - Step 2: 2일
   - Step 3: 3일
   - Step 4: 3일
   - Step 5: 3일
   - Step 6: 3일
   - Step 7: 2일
   ⚠️ 현재 구현과 가이드 문서 아키텍처 차이로 재구현 필요

Phase 3: UI 구현 (완료) ✅
   기간: 1일 (리팩토링 + 7개 페이지 구현)
   - 프론트엔드 리팩토링: 0.5일
   - 7개 페이지 구현: 0.5일

Phase 4: UI-API 연동 (예정)
   기간: 2주
   - API 연동: 1주
   - 에러 처리 및 로딩 상태: 3일
   - 실시간 진행률: 2일
   - UX 개선: 2일

총 예상 기간: 10주 (약 2.5개월)
현재 진행: 3주 완료 (30%)
```

---

## 9. v3.2 수정 사항

### 9.1 Phase 3 UI 구현 완료

**날짜:** 2025-01-29

**주요 변경사항:**

1. **대규모 프론트엔드 리팩토링**
   - CRA → Vite 마이그레이션
   - Material-UI → shadcn/ui + Tailwind CSS
   - 공통 컴포넌트 제거 및 재설계
   - 번들 크기 67% 감소, 빌드 속도 10배 향상

2. **7개 페이지 구현 완료**
   - Step 1: Multi File Upload
   - Step 2: File Load
   - Step 3: Preprocessing
   - Step 4: Data Transform
   - Step 5: Clustering
   - Step 6: Export
   - Step 10: Detail Clustering

3. **디자인 패턴 수립**
   - 수동 페이징 패턴
   - Sticky 헤더/컬럼 패턴
   - 반응형 그리드 패턴 (12 컬럼)
   - Custom scrollbar 패턴

4. **성능 및 접근성 개선**
   - Vite HMR 적용
   - Radix UI 기반 접근성
   - 경량 컴포넌트 사용

### 9.2 다음 단계

**즉시 필요한 작업:**
1. Phase 2 백엔드 재구현 여부 결정
2. UI-API 연동 계획 수립
3. 에러 처리 및 로딩 상태 디자인
4. 실시간 진행률 구현 방식 결정

**팀 논의 필요 사항:**
- 현재 백엔드 구현 vs 가이드 문서 아키텍처 차이 해소 방안
- 재구현 시 일정 및 리소스 배분
- 점진적 마이그레이션 전략

---

## 10. 참고 자료

### 10.1 GitHub 저장소
- **C# 프로젝트:** https://github.com/scschwan/lgcns_1st_nosql.git
- **Spring Boot 프로젝트:** https://github.com/scschwan/lg_cns_web.git

### 10.2 AWS 인프라 문서
- 01-aws-architecture-and-cost.md
- 02-service-architecture.md
- 03-process-flow.md
- 04-aws-infrastructure-setup.md
- 05-development-environment-setup.md

### 10.3 체크리스트
- development-checklist-v6.0.md (Phase 3 완료 반영)

---

**문서 버전:** 3.2 ⭐ Phase 3 완료  
**최종 업데이트:** 2025-01-29 15:30 KST  
**작성자:** dhkim

> **🎉 Phase 3 UI 구현 완료!**
> 
> **달성 내용:**
> - ✅ 전체 프론트엔드 스택 리팩토링 (CRA → Vite, MUI → shadcn/ui)
> - ✅ 7개 페이지 구현 완료
> - ✅ 성능 10배 향상, 번들 크기 67% 감소
> - ✅ 디자인 패턴 및 접근성 개선
> 
> **다음 단계:**
> - Phase 2 백엔드 재구현 여부 결정
> - UI-API 연동 작업 준비
