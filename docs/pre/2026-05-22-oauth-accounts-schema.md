# 작업 계획: OAuth Accounts 분리 스키마

- **날짜:** 2026-05-22
- **담당:** CEO (workers: dba, security)
- **작업 범위:** `prisma/schema.prisma`, `prisma/migrations/`

## TL;DR

users 테이블에 박혀 있던 OAuth 식별자를 별도 `oauth_accounts` 테이블로 분리한다. 한 계정의 대표 이메일은 `users.email` 로 고정하고, 여러 OAuth provider 연결을 1:N 으로 모델링한다.

## 목표

한 사용자가 **대표 이메일 1개 + 여러 OAuth provider** 를 자유롭게 연결·해제할 수 있도록 데이터 모델을 재설계한다. 본 사이클은 **schema 파일과 마이그레이션 SQL까지만** 작성하며, 실제 service / controller / repository 연동은 후속 사이클(사용자 직접 작업)에서 수행한다.

## 작업 항목

- [x] `prisma/schema.prisma` — `users` 모델에서 `oauth_provider`, `oauth_id` 컬럼 제거 (password nullable 유지)
- [x] `prisma/schema.prisma` — `oauth_accounts` 모델 신설 (FK→users, UNIQUE 2종, INDEX 1종, soft delete)
- [x] `prisma/migrations/20260521000000_add_oauth_fields/` — 이전 미적용 마이그레이션 폐기 (디렉토리 삭제)
- [x] `prisma/migrations/20260522000000_oauth_accounts_table/migration.sql` — 신규 마이그레이션 작성
- [x] `prisma validate` 통과 확인
- [x] `prisma format` 통과 확인

## 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `prisma/schema.prisma` | `users` 모델 정리(OAuth 컬럼 2개 제거) + `oauth_accounts` 모델 추가 |
| `prisma/migrations/20260521000000_add_oauth_fields/` | **디렉토리 삭제** (staging 미적용 → 안전) |
| `prisma/migrations/20260522000000_oauth_accounts_table/migration.sql` | 신규 — `users` 컬럼 정리 + `oauth_accounts` 테이블 생성 |

## 결정사항 (Decisions)

| ID | 결정 | 근거 |
|----|------|------|
| D-001 | OAuth 식별자를 `oauth_accounts` 로 분리 (이전 세션 합의 재확정) | 다중 provider 1:N 표현, UNIQUE 무결성, account linking 메타 |
| D-002 | `UNIQUE(provider, provider_user_id)` 강제 | 동일 Google sub 로 별개 user 생성 차단 (보안) |
| D-003 | `UNIQUE(user_id, provider)` 강제 | 한 user 가 같은 provider 를 중복 연결하는 시도 차단 |
| D-004 | `oauth_accounts.email` nullable, 인증 신뢰 X | 대표 이메일은 `users.email` 단일 소스. provider email 은 참조용 메타 |
| D-005 | 이전 미적용 마이그레이션 폐기 (옵션 1) | history 오염 방지, DROP COLUMN 손실 마이그레이션 회피 |
| D-006 | `last_used_at` 등 부가 메타는 보류 | 현 요구사항 외 — YAGNI |

## 가입·연동 흐름 (참조용, 본 사이클 구현 범위 아님)

본 schema 가 가능하게 하는 사용자 시나리오:

1. **이메일 가입** — 기존과 동일. `users` row 생성, `oauth_accounts` 없음.
2. **OAuth 신규 가입** — OAuth 인증 → 대표 이메일 입력 → 이메일 검증 → `users` 생성 + `oauth_accounts` row 1개 동시 생성 (트랜잭션).
3. **기존 계정에 OAuth 추가 연동** — 로그인 세션에서 OAuth 인증 → `oauth_accounts` row 추가.
4. **OAuth 연동 해제** — `oauth_accounts.deleted_at` 갱신 (soft delete). `users.password` 가 NULL 이면 마지막 OAuth 해제 차단 정책 필요(후속 구현).

## 참고 사항

- **회의 트리거 정책:** T1 stage-transition 스킵 (워커 2명 → mini-meeting inline), `--no-rebuttal` 등가 단일 라운드. 이전 세션의 D-001 합의를 출발점으로 사용.
- 본 사이클은 코드(`src/`) 를 건드리지 않는다. `user.repository.ts` 의 `findByOAuthId` / `createOAuthUser` 와 `auth.service.ts` 의 `handleGoogleLogin` 은 schema 변경 후 컴파일 에러가 발생하므로 **사용자가 직접 후속 PR 로 재작성** 한다.
- `prisma generate` 는 의도적으로 실행하지 않았다(실행 시 위 파일이 즉시 타입 에러). 사용자 작업 시작 시점에 `npx prisma generate` 로 클라이언트 재생성 후 코드 수정.
- 마이그레이션 적용: staging 검증 후 `npx prisma migrate deploy` 권장. dev 환경 reset 이 가능하면 `npx prisma migrate dev` 도 무방.
- 차단 요소: 없음.
