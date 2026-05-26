# 작업 완료: OAuth Accounts 분리 스키마

- **날짜:** 2026-05-22
- **담당:** CEO (workers: dba, security)

## TL;DR

users 테이블에 박혀 있던 OAuth 식별자 2개를 별도 `oauth_accounts` 테이블로 분리했다. 한 계정 = 대표 이메일 1개 + 다중 OAuth provider 연결을 표현할 수 있는 1:N 모델로 전환했다. 본 변경은 schema 와 마이그레이션 SQL까지이며, repository / service 연동은 후속 사용자 작업 범위다.

## 한 줄 결론

`oauth_accounts` 테이블 분리·마이그레이션 SQL 작성까지 완료 — 후속 코드 연동(`user.repository.ts`, `auth.service.ts`) 은 사용자가 직접 진행해야 한다.

## 한눈에 보기

| 항목 | 결과 |
|------|------|
| Schema 모델 변경 | `users` -2 컬럼, `oauth_accounts` 신설 |
| 마이그레이션 | 기존 미적용분 폐기 + 신규 1건 작성 |
| 제약 추가 | UNIQUE 2종, INDEX 1종, FK 1종 |
| 코드 영향 | `src/` 미변경 (사용자 후속 작업) |
| 검증 | `prisma validate` ✅ / `prisma format` ✅ |

## 변경 요약

`users.oauth_provider` / `users.oauth_id` 컬럼 제거, `oauth_accounts` 테이블 신설(UUID PK + `UNIQUE(provider, provider_user_id)` + `UNIQUE(user_id, provider)` + `INDEX(user_id)` + FK CASCADE + soft delete).

## 추가/수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `prisma/schema.prisma` | `users` 모델에서 `oauth_provider`, `oauth_id` 제거. `oauth_accounts` 모델 신설(상세 컬럼/제약은 PR 설명 참조). `password` nullable 유지. |
| `prisma/migrations/20260521000000_add_oauth_fields/` | **디렉토리 삭제** (staging 미적용 상태로 폐기) |
| `prisma/migrations/20260522000000_oauth_accounts_table/migration.sql` | 신규 — `users.password` NOT NULL 해제, OAuth 컬럼 제거(IF EXISTS 가드), `oauth_accounts` CREATE + UNIQUE/INDEX/FK |
| `docs/pre/2026-05-22-oauth-accounts-schema.md` | 작업 계획서 |
| `docs/pr/2026-05-22-oauth-accounts-schema.md` | 본 보고서 |

## PR 설명

### 배경

issue #23 (Google OAuth) 1차 작업은 `users` 테이블에 `oauth_provider` / `oauth_id` 컬럼을 직접 추가하는 방식이었다. 이번 사이클의 CEO 회의에서 사용자 요구(한 계정에 여러 OAuth 동시 연동, OAuth 연동 추가·삭제 API 필요)와 보안 요건(`(provider, sub)` UNIQUE 무결성)을 충족하려면 1:N 분리 테이블이 필요하다고 합의했다. 마이그레이션이 아직 적용되지 않은 시점이라 컬럼 추가를 폐기하고 처음부터 분리 테이블로 가는 비용이 가장 낮았다.

### 변경 내용

**`oauth_accounts` 모델 정의 (Prisma):**

```prisma
model oauth_accounts {
  oauth_account_id String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id          String    @db.Uuid
  provider         String    @db.VarChar(50)
  provider_user_id String    @db.VarChar(255)
  email            String?   @db.VarChar(255)
  created_at       DateTime  @default(now()) @db.Timestamptz(6)
  updated_at       DateTime  @default(now()) @db.Timestamptz(6)
  deleted_at       DateTime? @db.Timestamptz(6)
  users            users     @relation(fields: [user_id], references: [user_id], onDelete: Cascade, onUpdate: NoAction)

  @@unique([provider, provider_user_id], map: "uq_oauth_accounts_provider_subject")
  @@unique([user_id, provider],         map: "uq_oauth_accounts_user_provider")
  @@index([user_id],                    map: "idx_oauth_accounts_user")
}
```

**제약 의미:**
- `uq_oauth_accounts_provider_subject` — 동일 Google `sub` 로 두 계정이 생성되는 것을 DB 단에서 차단.
- `uq_oauth_accounts_user_provider` — 한 user 가 같은 provider 를 중복 연결하는 시도를 차단.
- `email` (nullable) — provider 가 알려준 이메일 보관용 메타. 인증·로그인용 신뢰 소스 아님(대표 이메일은 `users.email`).
- `deleted_at` — OAuth 연동 해제 API 를 soft delete 로 구현하기 위한 컬럼.

**마이그레이션 전략:**
- 이전 마이그레이션 `20260521000000_add_oauth_fields` 는 staging 미적용이었으므로 디렉토리째 폐기.
- 신규 마이그레이션 `20260522000000_oauth_accounts_table` 은 idempotent 가드(`DROP COLUMN IF EXISTS`) 를 포함해, 누가 실수로 이전 마이그레이션을 일부 적용했더라도 안전하게 수렴.

**가입·연동 흐름 (schema 가 가능하게 하는 것):**
1. 이메일 가입 — 기존 흐름 그대로(`users` 만).
2. OAuth 신규 가입 — OAuth 인증 → 대표 이메일 입력 → 이메일 검증 → `users` + `oauth_accounts` 트랜잭션 생성.
3. 기존 계정에 OAuth 추가 연동 — `oauth_accounts` row INSERT.
4. OAuth 연동 해제 — `oauth_accounts.deleted_at` UPDATE (마지막 인증 수단 보호 정책은 service 레이어 책임).

### 테스트

- `npx prisma validate` — 통과 ✅
- `npx prisma format` — 통과 ✅
- 실제 DB 적용 / `prisma generate` / `pnpm build` — **본 사이클에서 미실행** (현 시점에 generate 하면 `user.repository.ts` 의 `oauth_provider` 참조가 즉시 타입 에러를 일으키므로, 사용자가 후속 코드 작업과 함께 일괄 실행하도록 의도적으로 유보).

### 주의사항 / 후속 작업 (사용자 직접 진행 범위)

**즉시 깨질 코드:**
- `src/user/user.repository.ts` — `findByOAuthId`, `createOAuthUser` 는 사라진 `oauth_provider` / `oauth_id` 컬럼을 참조 → 제거 또는 oauth_accounts 기반으로 재작성.
- `src/auth/auth.service.ts:handleGoogleLogin` — 흐름 재작성 필요(`oauth_accounts.findFirst` → 없으면 `users.email` 검증 → 신규 가입 케이스/연동 추가 케이스 분기).

**신규 작업 항목:**
- `OauthAccountRepository` 신설 (단일 책임).
- OAuth 신규 가입 흐름: 콜백 후 대표 이메일 입력·검증 단계(이미 존재하는 `sendMail` / `verify` 재사용) → 가입 완료 시 트랜잭션으로 `users` + `oauth_accounts` 동시 생성.
- 추가 API: `POST /auth/oauth/:provider/link` (기존 로그인 세션에서 OAuth 연동 추가), `DELETE /auth/oauth/:provider` (연동 해제, 마지막 인증 수단 보호 가드 필수).
- 테스트 보강: 위 흐름들에 대한 `auth.service.spec.ts` / `auth.controller.spec.ts` 갱신.

**적용 절차:**
1. `npx prisma generate` 로 클라이언트 재생성.
2. 위 코드 수정 / 신규 모듈 작성.
3. staging DB 에 `npx prisma migrate deploy` 로 적용 후 회귀 확인.
4. 운영 적용.

## 사용자 결정 필요 (Action Required)

없음 — 이번 사이클의 결정사항은 모두 회의에서 합의됨. 후속 코드 연동 사이클에서 다음 정책 결정이 필요할 수 있다(참고용):
- OAuth 신규 가입 시 입력한 대표 이메일이 *이미 다른 user* 에 존재하면 (a) 거부 후 로그인 유도 vs (b) 로그인된 세션에서만 명시적 link 허용. **보안상 (b) 권장**.

## 영역별 진단

### DBA — 양호
- 1:N 정규화로 다중 provider 자연스럽게 표현.
- UNIQUE 2종으로 무결성 보장(이전 schema 에는 unique 가 누락되어 silent dup 위험이 있었음).
- FK CASCADE 로 user 삭제 시 OAuth 연결도 함께 정리.
- 인덱스(`idx_oauth_accounts_user`) 로 user 기준 연동 목록 조회 O(log n).

### Security — 양호
- `(provider, provider_user_id)` UNIQUE 가 동일 sub 이용한 계정 복제·탈취 표면을 DB 단에서 차단.
- provider email 은 nullable + 인증 신뢰 X로 명시 → email-trust 기반 자동 링크 공격(account pre-hijack) 방지.
- soft delete(`deleted_at`) 로 연동 해제 시 audit trail 보존.

## Action Items

| ID | Owner | 내용 | 기한 |
|----|-------|------|------|
| A-001 | seoki (사용자) | `npx prisma generate` 실행 + `user.repository.ts`, `auth.service.ts` 수정 | 후속 PR |
| A-002 | seoki (사용자) | `OauthAccountRepository` 신설 및 `handleGoogleLogin` 흐름 재작성 | 후속 PR |
| A-003 | seoki (사용자) | OAuth 연동 추가/삭제 API 엔드포인트 구현 (`/auth/oauth/:provider/link`, `DELETE /auth/oauth/:provider`) | 후속 PR |
| A-004 | seoki (사용자) | staging 에 `prisma migrate deploy` 적용 후 회귀 검증 | 운영 적용 전 |
