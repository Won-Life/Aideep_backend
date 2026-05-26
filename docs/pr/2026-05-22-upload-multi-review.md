# 작업 완료: upload-multi-review (S3 업로드 다방면 코드 리뷰)

- **날짜:** 2026-05-22
- **담당:** CEO (멀티에이전트 오케스트레이션)
- **참여 워커:** nfr, security, qa, dba, customer (5명, Round 1 단일 라운드 수렴)

## TL;DR

- **현재 업로드 모듈은 "위험" 상태로 출시 차단 권고.** 핵심 결함은 ① 워크스페이스 접근 권한 미검증, ② 다중 업로드 부분 실패 처리 부재(S3·DB 고아 발생), ③ S3 객체를 공개 URL로 노출하는 설계 가정.
- **테스트는 unit/integration/e2e 모두 0건** — 직전 두 사이클(presigned → revert direct) 동안 작성되지 않음. MIME 검증·JWT 가드·10MB 한도 등 모든 보안 분기가 미검증.
- **`files` 모델은 다른 모델(nodes, edges, users_workspaces)과 일관성 위반** — FK 관계·`deleted_at`·`updated_at`이 모두 빠져 있어 정합성·감사 추적 불가.

## 한눈에 보기

| 영역 | 결론 | 핵심 P0 |
|---|---|---|
| 보안(security) | 위험 | 워크스페이스 멤버십 미검증(IDOR), 공개 S3 URL 노출, MIME 스푸핑 |
| 비기능(nfr) | 주의 | uploadMany partial failure, memoryStorage 100MB 부하 |
| QA | 차단 | upload 모듈 전체 테스트 0건 |
| DB(dba) | 위험 | files FK 누락, deleted_at/updated_at 부재, S3-DB 트랜잭션 보상 없음 |
| 고객/UX(customer) | 위험 | partial 실패 응답 불투명, 삭제 API 없음, IDOR + 공개 URL |

**한 줄 결론:** 직전 사이클 multer revert는 컴파일·기본 동작은 통과했지만, 권한·테스트·정합성·UX 측면에서 다섯 페르소나 전원이 "현 상태로 머지 불가"에 합의했다.

## 사용자 결정 필요 (Action Required)

다음 항목은 정책 결정이라 사용자 승인 필요:

1. **S3 버킷 노출 모델**: ① 현행 public + 직링크 유지 ② private + presigned GET 발급(만료) ③ 백엔드 download 프록시(워크스페이스 멤버 가드). security·customer 모두 ②를 권고하지만 비용/지연 트레이드오프 존재.
2. **다중 업로드 부분 실패 응답 스키마**: ① 한 개라도 실패면 전체 롤백(S3 보상 삭제) ② `{ succeeded: [], failed: [{index, originalName, reason}] }`로 부분 노출. customer 권고는 ②.
3. **소프트 삭제 정책**: files도 다른 모델처럼 `deleted_at` 도입 → 운영 데이터 잔존 시 GDPR/감사 영향. 도입 권고지만 백오피스 정책 필요.
4. **테스트 도입 범위**: 본 PR 머지 차단 조건으로 unit + e2e 최소 셋을 요구할지, 별도 후속 이슈로 분리할지.

## 영역별 진단

### 1. 보안 (security-reviewer) — 위험

**Critical**
- `upload.service.ts:15-31` — workspaceId를 body로 받지만 `users_workspaces` 멤버십 검증 부재. 타 워크스페이스에 무단 파일 첨부 가능(IDOR/A01).
- `s3.service.ts:109-111` — `getPublicUrl`이 `bucket.s3.region.amazonaws.com/key` 직링크 반환. 버킷이 public-read면 JWT 우회로 전체 노출(A04), private면 클라이언트 다운로드 불가.

**High**
- `s3.service.ts:51-52` — `path.extname(originalname)`을 검증 없이 S3 key에 결합. 더블 확장자(`evil.pdf.html`), null byte 위험.
- `upload.controller.ts:66-70, 105-107` — `file.mimetype`은 클라이언트 헤더값. magic byte 검사 없어 SVG/HTML을 image/png으로 위장 가능.
- `upload.module.ts` + multer memoryStorage — 10MB×10=100MB 힙, 동시 N개로 OOM 가능(throttler 부재).

**Medium**
- `prisma/schema.prisma:89-101` — `files`에 FK 없음, `deleted_at` 부재로 GDPR 삭제 불가.

### 2. 비기능 (code-reviewer) — 주의

**4축 점수:** 확장성 2/5, 유지보수성 3/5, 성능·관측성 2/5, 보안 위생 2/5.

**P1 핵심**
- `upload.service.ts:50` — `uploadMany`의 `Promise.all`이 fail-fast → 일부 S3 객체 고아.
- `upload.controller.ts:27-30` vs `upload.module.ts:9-11` — `MULTER_OPTIONS`(limits 포함)와 `MulterModule.register`(limits 누락) 중복.
- `upload.controller.ts:60-73, 99-115` — controller 안 validation 산재, `uploadOne/uploadMany` 동일 검증 중복 → `ParseFilePipe` + `FileTypeValidator`로 추출 권고.
- `s3.service.ts:94-104, 116-122` — `deleteFile`/`extractKeyFromUrl` 호출처 0건(dead code) — customer는 삭제 API로 노출 권고, nfr은 미노출이면 삭제 권고 → **합의: 삭제 API 노출** (P1).
- 구조화 로깅·메트릭 부재 → 업로드 성공률·지연·크기 분포 추적 불가.

### 3. QA — 차단

- `find src/upload test -name '*upload*spec*'` 결과 **0건**. unit·integration·e2e 모두 부재.
- 직전 두 사이클(presigned→direct) 동안 신규 작성된 controller/service/s3.service 어디에도 spec 없음.

**최소 작성 권고:**
1. `upload.controller.spec.ts` — MIME 거부, workspaceId 누락, JWT guard mock, 파일 없음, 11개 초과
2. `upload.service.spec.ts` — S3Service mock, S3 실패 시 예외 전파, uploadMany partial-failure
3. `s3.service.spec.ts` — `@aws-sdk/client-s3` mock, PutObject 성공/실패, getPublicUrl 포맷
4. `test/upload.e2e-spec.ts` — 실제 HTTP, `aws-sdk-client-mock`, 10MB+1 거부, MIME 스푸핑

### 4. DB (architect/dba) — 위험

`files` 모델이 다른 모델의 일관성 패턴을 따르지 않음:

| 항목 | nodes/edges/users | files | 영향 |
|---|---|---|---|
| FK relation | 정의됨 (onDelete: Cascade) | **없음** | 임의 UUID 주입·고아 row |
| deleted_at | 보유 | **없음** | soft delete·감사 불가 |
| updated_at | 보유 | **없음** | metadata 갱신 추적 불가 |
| (workspace, time) 복합 인덱스 | 보유 | **없음** | 갤러리 정렬 성능 |

**S3-DB 트랜잭션 경계 부재** (`upload.service.ts:20-31`): S3 put 성공 후 DB create 실패 시 S3 orphan. try/catch로 보상 삭제(`s3Service.deleteFile(key)`) 필요.

권고 schema diff는 DBA 보고에 포함(`original_name`, `@unique`, FK 2개, `deleted_at`/`updated_at`, 복합 인덱스). 빈 테이블이라 backfill 불필요·마이그레이션 안전.

### 5. 고객/UX (critic) — 위험

**Dead-end:**
- 삭제 API controller 미노출 → 사용자가 잘못 올린 파일을 스스로 지울 수 없음 (`S3Service.deleteFile`은 존재).
- partial 실패 시 무엇이 살아남았는지 응답에 없음 → "다 실패한 줄 알았는데 일부만 올라가있음" 시나리오.
- `original_name`이 DB에 없어 CS 추적 시 mime/size 매칭만 가능.

**CS 컴플레인 예측:**
- "친구가 제 PDF 링크로 봤대요" → 공개 버킷이라 의도된 동작이 됨.
- "다른 팀 워크스페이스에 제 파일이…" → workspaceId 검증 부재로 실제 가능.

## 합의된 P0/P1/P2 액션 플랜

### P0 (이번 PR 머지 차단)

| ID | 액션 | 파일 | Owner | 기한 |
|---|---|---|---|---|
| A-001 | workspaceId 멤버십 검증(`users_workspaces` 조회) 추가 | `upload.service.ts` | backend-1 | 다음 사이클 |
| A-002 | `uploadMany`를 `Promise.allSettled`로 전환 + 실패 시 S3 보상 삭제 + 응답 스키마 `{succeeded, failed}` 분리 | `upload.service.ts`, `dto/upload-response.dto.ts` | backend-1 | 다음 사이클 |
| A-003 | `upload.service.ts`의 S3 put + DB create를 try/catch로 감싸 DB 실패 시 `s3Service.deleteFile(key)` 호출 | `upload.service.ts` | backend-1 | 다음 사이클 |
| A-004 | `files` 모델에 FK 2개(users, workspaces) + `deleted_at` + `updated_at` + back-relation 추가 | `prisma/schema.prisma` | backend-3 + dba 합의 후 migrate | 다음 사이클 |
| A-005 | S3 버킷 노출 모델 결정 → private + presigned GET 권고. `getPublicUrl` 사용처(`upload.service.ts:24`)와 `files.file_url` 저장 정책 동시 정리 | `s3.service.ts`, `upload.service.ts`, schema | **사용자 결정 후 backend-1** | 결정 후 다음 사이클 |
| A-006 | unit + e2e 최소 셋 작성 (MIME 거부, JWT 401, 10MB+1 거부, 11개 거부, workspaceId 권한, uploadMany partial) | `src/upload/*.spec.ts`, `test/upload.e2e-spec.ts` | qa(주도) + backend-3 | 다음 사이클 |

### P1 (다음 사이클 내)

| ID | 액션 | 파일 | Owner | 기한 |
|---|---|---|---|---|
| A-101 | magic byte MIME 검사(`file-type` 패키지) 도입, 확장자를 mimetype→ext 매핑으로 결정 | `upload.controller.ts`, `s3.service.ts` | backend-2 | +1 사이클 |
| A-102 | DELETE `/upload/:fileId` 엔드포인트 노출 + 소유자·멤버 검증 + S3·DB 동시 삭제(소프트) | `upload.controller.ts`, `upload.service.ts` | backend-1 | +1 사이클 |
| A-103 | `req: any` → `AuthenticatedRequest` 또는 `@CurrentUser()` 데코레이터, `as any` 제거 | `upload.controller.ts` | backend-2 | +1 사이클 |
| A-104 | `MULTER_OPTIONS` 컨트롤러 상수 제거하고 `MulterModule.registerAsync`로 통합(limits 포함) | `upload.module.ts`, `upload.controller.ts` | backend-2 | +1 사이클 |
| A-105 | `original_name` 컬럼 추가 + 응답 일관화 | `prisma/schema.prisma`, `upload.service.ts`, dto | backend-3 | +1 사이클 |
| A-106 | `(workspace_id, created_at)` 복합 인덱스 + `s3_key @unique` | `prisma/schema.prisma` | backend-3 | +1 사이클 |
| A-107 | 구조화 로깅(JSON) + Prometheus 카운터(`upload_total{status}`, `upload_bytes`) | `s3.service.ts`, `upload.service.ts` | backend-2 | +1 사이클 |
| A-108 | `@nestjs/throttler` 업로드 엔드포인트 적용 + 동시 처리 한도(`p-limit`) | `upload.controller.ts`, `upload.module.ts` | backend-2 | +1 사이클 |

### P2 (백로그)

- 사용자/워크스페이스별 quota 누적 검증
- 이미지 EXIF orientation 정규화
- 큰 파일 stream 업로드(`@aws-sdk/lib-storage`) 전환
- ClamAV 등 비동기 안티바이러스 스캐닝 큐
- `files↔nodes` 연결 모델링(RESOURCE 노드 첨부)
- size 컬럼 `BigInt` 확장(영상 도입 시)
- `file_url` 컬럼 폐기 후 런타임 derive

## Round 정보

- **라운드 수:** 1/3 (수렴=true, 종료 사유=unanimous on P0 안건)
- Round 2 rebuttal 불필요 — 5명 워커가 핵심 P0 6건에 만장일치, A-005(노출 모델)와 A-002(부분 실패 응답 스키마)만 사용자 정책 결정 필요로 Open Question 분류.

## Dissent (이견 기록)

- **A9 deleteFile 처리 (nfr vs customer)**: nfr은 "호출처 없으면 dead code → 삭제", customer는 "삭제 API로 노출 필요". CEO 중재: **customer 채택, A-102로 controller 노출**. nfr 동의 가능한 결정(노출되면 dead code 아님).

## Open Questions (사용자 결정 위임)

1. **S3 노출 모델** (A-005): public 유지 vs private+presigned vs 다운로드 프록시
2. **다중 업로드 부분 실패 응답** (A-002 변형): 전체 롤백 vs `{succeeded, failed}` 부분 노출
3. **테스트 머지 차단 강도** (A-006): 본 PR에서 강제 vs 후속 이슈 분리
4. **`deleted_at` 소프트 삭제 정책**: 운영 백오피스 정리 정책 필요

## 변경된 파일 (이 리뷰 사이클)

| 파일 | 변경 내용 |
|---|---|
| `docs/pre/2026-05-22-upload-multi-review.md` | 리뷰 계획서 신규 |
| `docs/pr/2026-05-22-upload-multi-review.md` | 본 보고서 신규 |

> 실 코드 변경 없음 (read-only 리뷰).

## 부록 A: 워커 보고 요약

| 워커 | 결론 | 핵심 발견 수 (P0/P1/P2) |
|---|---|---|
| security | 위험 | 2/3/3 |
| nfr | 주의 | 0/10/4 |
| qa | 차단 | 5/4/2 |
| dba | 위험 | 3/4/3 |
| customer | 위험 | 4/4/3 |

## 후속 작업 (recommended next cycle)

`/ceo --workers=backend-1,backend-2,backend-3,dba --max-rounds=3 "upload 모듈 P0 6건 + Open Question 4건 사용자 결정 반영"` 형태로 다음 사이클 발주 권고.
