# 작업 완료: upload-p0-fix (S3 업로드 P0 결함 해소)

- **날짜:** 2026-05-22
- **담당:** CEO + backend-1, backend-3, qa (3 워커, 단일 라운드 수렴)

## TL;DR

- 직전 리뷰 사이클의 P0 5건(워크스페이스 권한 미검증·partial 실패·트랜잭션 보상·files 모델 정합성·테스트 부재)을 한 사이클에 모두 해소.
- 사용자 결정 4건(공개 URL 유지·`{succeeded, failed}` 부분 노출·테스트 PR 포함·`deleted_at` 도입) 그대로 반영.
- `pnpm build` exit 0, unit 19/19 + e2e 7/7 = **26/26 통과**.

## 한눈에 보기

| 항목 | 결과 |
|---|---|
| P0 결함 해소 | 5/5 |
| 변경 파일 수 | 코드 4 + 신규 1 + 스키마 1 + 테스트 4 + e2e config 1 = 11 |
| `pnpm build` | exit 0 |
| Unit tests | 19/19 PASS (controller 7 + service 7 + s3.service 5) |
| E2E tests | 7/7 PASS |
| 마이그레이션 | 미실행 (사용자 환경에서 별도 수행 예정) |

**한 줄 결론:** 본 PR은 직전 리뷰의 머지 차단 결함을 모두 제거했고, 회귀를 막을 테스트 26건을 함께 머지한다.

## 사용자 결정 필요 (Action Required)

- **마이그레이션 실행**: `files` 모델에 컬럼 2개(`updated_at`, `deleted_at`) + FK 제약 2개가 schema에 추가되었으나 SQL 마이그레이션은 만들지 않았다. 사용자가 적절한 환경에서 `npx prisma migrate dev --name upload_files_fk_softdelete` 또는 `prisma migrate deploy` 형태로 직접 적용 필요.
- **그 외**: 없음.

## 변경 요약

### A-001 워크스페이스 멤버십 검증
`UploadService.uploadOne`/`uploadMany` 진입 시 `prisma.client.users_workspaces.findUnique` 로 멤버십 조회 → 없거나 `deleted_at != null` 이면 `ForbiddenException('해당 워크스페이스에 접근 권한이 없습니다.')`.

### A-002 다중 업로드 부분 노출 응답
`uploadMany`를 `Promise.allSettled` 전환. 신규 `UploadManyResponseDto = { succeeded: UploadResponseDto[], failed: { index, originalName, reason }[] }`로 응답 분리. 실패 항목은 인덱스·원본명·사유 포함.

### A-003 S3-DB 트랜잭션 보상
`uploadOne` 내부 try/catch: `s3Service.uploadFile` 성공 후 `prisma.client.files.create` 가 실패하면 `s3Service.deleteFile(uploaded.key)` best-effort 보상 호출, 보상 실패는 swallow하고 `InternalServerErrorException` 발생.

### A-004 files 모델 정합성
`prisma/schema.prisma` 변경:
- `files` 모델에 `updated_at`, `deleted_at` 컬럼 추가
- `users @relation(owner_user_id → users.user_id, onDelete: Restrict)` FK 추가
- `workspaces @relation(workspace_id → workspaces.workspace_id, onDelete: Cascade)` FK 추가
- `users.files files[]`, `workspaces.files files[]` back-relation 추가
- `pnpm exec prisma generate` 통과

### A-006 테스트 셋
4개 spec 파일 신규 작성, 총 26 케이스 모두 PASS. e2e 설정(`test/jest-e2e.json`)에 `moduleNameMapper`/`transformIgnorePatterns` 추가(pnpm hoist=false, uuid@13 ESM 대응) — 부수 변경이지만 기존 `app.e2e-spec.ts`도 같은 이유로 깨져 있어 인프라 fix 성격.

### A-005 (SKIP)
사용자 결정으로 S3 공개 URL 모델 유지. `file_url` 컬럼·`getPublicUrl` 그대로.

## 추가/수정된 파일

| 파일 | 변경 |
|---|---|
| `src/upload/upload.service.ts` | 멤버십 가드 + Promise.allSettled + S3 보상 삭제 적용 |
| `src/upload/upload.controller.ts` | `uploadMany` 반환 타입 `UploadManyResponseDto`로 교체, Swagger 데코레이터 동기화 |
| `src/upload/dto/upload-many-response.dto.ts` | 신규 — `UploadFailureDto`, `UploadManyResponseDto` |
| `prisma/schema.prisma` | files 모델에 FK 2개·`updated_at`·`deleted_at` 추가, users/workspaces back-relation 추가 |
| `src/upload/upload.controller.spec.ts` | 신규 (7 케이스) |
| `src/upload/upload.service.spec.ts` | 신규 (7 케이스) |
| `src/upload/s3.service.spec.ts` | 신규 (5 케이스) |
| `test/upload.e2e-spec.ts` | 신규 (7 케이스) |
| `test/jest-e2e.json` | `moduleNameMapper`/`transformIgnorePatterns` 추가 (e2e 실행 인프라 fix) |
| `docs/pre/2026-05-22-upload-p0-fix.md` | 작업 계획서 |
| `docs/pr/2026-05-22-upload-p0-fix.md` | 본 보고서 |

## PR 설명

### 배경

직전 사이클(`docs/pr/2026-05-22-upload-multi-review.md`)에서 5명 워커(nfr, security, qa, dba, customer)가 만장일치로 다음 P0 결함을 머지 차단 사유로 지목:
1. workspaceId 인가 검증 부재 (IDOR)
2. `uploadMany`의 `Promise.all` fail-fast로 인한 S3·DB 고아
3. S3 put 성공 + DB create 실패 시 S3 orphan
4. `files` 모델이 다른 모델(nodes, edges, users_workspaces) 일관성 위반 (FK·deleted_at·updated_at 부재)
5. upload 모듈 테스트 자산 0건

본 사이클은 사용자 정책 결정 4건을 받아 이 5건을 단일 PR에 묶어 처리.

### 테스트

- `pnpm build` → exit 0 (컴파일 클린).
- `pnpm exec jest src/upload --runInBand` → 3 suites, 19 tests PASS.
- `pnpm exec jest --config test/jest-e2e.json --testPathPatterns=upload --runInBand` → 1 suite, 7 tests PASS.
- 실제 S3·DB 호출 없음 (전부 mock).

### 주의사항 / 후속 작업

- **마이그레이션 미실행**: schema 변경만 적용. 사용자가 적절한 시점에 `prisma migrate` 실행 필요. 빈 테이블이라 backfill 불필요·다운타임 없음 예상.
- **multer hoist 이슈**: pnpm `hoist=false` + jest 환경에서 multer/uuid를 못 찾는 문제를 `jest.mock` + `moduleNameMapper` 로 우회. 추후 `.npmrc`의 `hoist` 정책을 변경하면 이 우회 코드는 제거 가능.
- **P1 백로그 미반영 (다음 사이클)**: magic byte MIME 검사, DELETE 엔드포인트, `req: any` 타입 제거, `MULTER_OPTIONS` DRY 정리, `original_name` 컬럼, `(workspace_id, created_at)` 복합 인덱스, 구조화 로깅·메트릭, throttler.

## Round 정보

- **라운드 수:** 1/3 (수렴=true, 종료 사유=모든 워커가 정의된 mandate를 한 번에 완료).
- 워커 간 충돌 없음 (backend-1/backend-3은 파일 영역 분리, qa는 두 워커 완료 후 직렬 실행).

## Dissent

없음.

## 부록 A: 라운드 요약 생략 (단일 라운드)
