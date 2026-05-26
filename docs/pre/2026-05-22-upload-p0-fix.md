# 작업 계획: upload-p0-fix

- **날짜:** 2026-05-22
- **담당:** CEO + backend-1, backend-3, qa (3 워커)
- **작업 범위:** `src/upload/**`, `prisma/schema.prisma`, `src/upload/*.spec.ts`, `test/upload.e2e-spec.ts`

## TL;DR

직전 리뷰 사이클(`2026-05-22-upload-multi-review`)이 합의한 P0 5건을 사용자 결정 반영(공개 URL 유지·부분 노출 응답·테스트 PR 포함·deleted_at 도입)에 맞춰 실행한다.

## 목표

- 머지 차단 결함 5건을 제거해 본 PR이 출시 가능 상태가 되게 한다.
- 회귀를 막을 unit + e2e 테스트를 함께 머지한다.

## 작업 항목

### backend-1 (src/upload 코드)
- [ ] A-001 `upload.service.ts`에 `users_workspaces` 멤버십 검증 추가 (deleted_at null + role 검사). 비멤버 → `ForbiddenException`.
- [ ] A-002 `uploadMany`를 `Promise.allSettled`로 전환. 실패 항목에 대해 best-effort `s3Service.deleteFile(key)` 호출. 응답 DTO를 `{ succeeded: UploadResponseDto[], failed: { index, originalName, reason }[] }` 구조의 신규 DTO(`UploadManyResponseDto`)로 분리.
- [ ] A-003 `uploadOne`을 try/catch로 감싸 DB create 실패 시 `s3Service.deleteFile(uploaded.key)` 보상 호출.
- [ ] controller 응답 타입·`@ApiSuccessResponse` 업데이트.

### backend-3 (prisma schema)
- [ ] A-004 `files` 모델에 다음 추가:
  - FK relation: `users @relation(owner_user_id → users.user_id, onDelete: Restrict)`
  - FK relation: `workspaces @relation(workspace_id → workspaces.workspace_id, onDelete: Cascade)`
  - `updated_at DateTime @default(now()) @db.Timestamptz(6)`
  - `deleted_at DateTime? @db.Timestamptz(6)`
  - back-relation: `users.files files[]`, `workspaces.files files[]`
- [ ] `pnpm exec prisma generate` 실행 (마이그레이션 SQL은 만들지 말 것 — 사용자 환경에서 별도 수행).

### qa (테스트, 위 두 작업 완료 후)
- [ ] `src/upload/upload.controller.spec.ts` — MIME 거부, workspaceId 누락, 파일 없음, 11개 초과 시 422/400 분기.
- [ ] `src/upload/upload.service.spec.ts` — S3Service mock, 멤버십 검증 통과/실패, uploadOne DB 실패 시 보상 deleteFile 호출, uploadMany partial failure 응답 분리.
- [ ] `src/upload/s3.service.spec.ts` — `@aws-sdk/client-s3` mock, PutObject 성공/실패, getPublicUrl 포맷, deleteFile 호출.
- [ ] `test/upload.e2e-spec.ts` — Nest application, JWT 401, multer 10MB+1 거부, MIME 화이트리스트.

## 영향 범위

| 파일 | 변경 |
|---|---|
| `src/upload/upload.service.ts` | 수정 (멤버십 가드 + 보상 삭제 + allSettled) |
| `src/upload/upload.controller.ts` | 수정 (응답 DTO 교체, uploadMany 시그니처) |
| `src/upload/dto/upload-many-response.dto.ts` | 신규 |
| `prisma/schema.prisma` | files 모델 확장, users/workspaces back-relation |
| `src/upload/upload.controller.spec.ts` | 신규 |
| `src/upload/upload.service.spec.ts` | 신규 |
| `src/upload/s3.service.spec.ts` | 신규 |
| `test/upload.e2e-spec.ts` | 신규 |

## 회의 트리거 정책

| Trigger | 적용 | 비고 |
|---|---|---|
| T1 stage transition | 있음 | exec→verify 진입 직전 |
| T2 on-demand | 있음 | 사용자 요청 시 |
| T3 conflict-driven | 있음 | backend-1 ↔ backend-3 충돌 시 |

- max-rounds: 3
- 플래그: `--workers=backend-1,backend-3,qa`

## 차단 요소

- backend-1 작업 완료 전 qa 테스트 작성 불가 (직렬 의존).
- migration SQL은 사용자가 수동 실행(테스트 환경 한정 가능).

## 참고

- 직전 리뷰: `docs/pr/2026-05-22-upload-multi-review.md`
- 사용자 결정: 공개 URL 유지(A-005 SKIP), 부분 노출(A-002), 테스트 PR 포함(A-006), deleted_at 도입(A-004).
