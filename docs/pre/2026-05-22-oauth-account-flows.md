# 작업 계획: OAuth 회원가입·연동·해제 흐름 정비 (확정본)

- **날짜:** 2026-05-22
- **담당:** CEO 하네스 (pm · security · dba · backend-1) — 회의록 `.omc/meetings/2026-05-22-1830-oauth-account-flows.md`
- **작업 범위:** `src/auth/**`, `src/user/user.repository.ts`, `src/redis/redis.keys.ts`, `prisma/migrations/*` (신규)
- **TL;DR:** Google OAuth 흐름을 ticket+complete 2-step 으로 분리하고, 자동 이메일 매칭을 제거(409 차단)하며, 기존 사용자가 본인 의지로 link/unlink 할 수 있게 한다. 동시에 `user.repository.ts` 의 깨진 OAuth 메서드를 `OAuthAccountRepository` 로 일원화하고, partial unique index·CSRF state·email_verified 검증·sendMail 응답 정화·비밀번호 설정 API 까지 한 PR 로 묶는다.

## 목표
- OAuth 인증 결과를 **명시적 회원가입**과 **기존 계정 link** 로 분리한다.
- 이메일 일치에 의한 자동 link 를 제거하고, 이메일 충돌 시 enumeration 완화된 409 응답으로 차단한다.
- `users` 테이블 직접 접근 OAuth 코드를 제거하고 `oauth_accounts` 정규화 테이블 + `OAuthAccountRepository` 로 일원화한다.
- 마지막 인증 수단 unlink 차단 + 사용자가 미리 비밀번호를 설정할 수 있게 한다.
- 보안 표면 정리: OAuth CSRF state, email_verified 검증, sendMail 응답에서 authCode 노출 제거, PII 로그 제거.

## 사용자 결정 (확정)

| ID | 결정 |
|---|---|
| D-001 | OAuth 가입 = ticket+complete 2-step (Redis 5분 TTL, GETDEL 1회 소진) |
| D-002 | 이메일 충돌 → 409 차단 + `users.email @unique` 유지 + P2002 catch |
| D-003 | 스키마-코드 갭 한 PR 묶음 (순서: generate→repo→service→spec→migrate deploy) |
| D-004 | Redis nonce (HMAC 기각). 단일 `/auth/google/callback` + state.mode 분기 |
| D-005 | Unlink = `$transaction` + `SELECT FOR UPDATE` + `LAST_AUTH_METHOD` 가드 |
| D-006 | Partial unique index (`WHERE deleted_at IS NULL`) 마이그레이션 본 PR 포함 |
| D-007 | `PATCH /auth/password` 엔드포인트 본 PR 포함 |
| D-008 | OAuth 가입 username = 기존 `SignUpBody` 규칙과 동일 |
| D-009 | GoogleStrategy `state: true` + `passReqToCallback: true` + state.mode 분기 |
| D-010 | `profile.emails[0].verified === true` 검증 — false 시 ticket 발급 거부 |
| D-011 | `sendMail` 응답에서 `{code: authCode}` 제거 (CRITICAL) |
| D-012 | 이메일 충돌 409 = generic 메시지 + 200~300ms 인위 지연 (enumeration 완화) |
| D-013 | ticket = `crypto.randomBytes(32).toString('base64url')`, Redis `GETDEL` atomic |
| D-014 | Redis 키 prefix 분리: `oauth:signup_ticket:{...}` / `oauth:link_state:{...}` |
| D-015 | `OAuthAccountRepository` 위치/메서드 (아래 작업 항목 참조) |
| D-016 | 신규 4종 엔드포인트 가드 정책 |
| D-017 | `console.log(req.user)` 제거 (auth.controller.ts:128) |

## 작업 항목

### A. 스키마·repository 정리 (D-003, D-015)
- [ ] `npx prisma generate` 실행 후 `user.repository.ts:45-65` 의 `findByOAuthId`, `createOAuthUser` 제거.
- [ ] 신규 `src/auth/oauth/oauth-account.repository.ts` (@Injectable, PrismaService 주입):
  - `findByProviderSubject(provider, providerUserId)` — `deleted_at IS NULL`
  - `findByUserAndProvider(userId, provider)` — `deleted_at IS NULL`
  - `listActiveByUser(userId)` — GET /links 응답용
  - `countActiveByUser(userId)` — unlink 잠금 가드용
  - `createForUser(userId, provider, providerUserId, email)` — **soft-deleted row 발견 시 update revive (D-006 마이그레이션 전 보조)**
  - `softDeleteByUserAndProvider(userId, provider)` — `updateMany(where: deleted_at: null)` idempotent
- [ ] `auth.module.ts` 의 providers 에 `OAuthAccountRepository` 등록 (PrismaModule 의존 확인).

### B. OAuth 회원가입(2-step) 흐름 (D-001, D-002, D-010, D-013)
- [ ] `auth.service.handleGoogleLogin` 동작 재작성:
  - oauth_accounts(`provider+provider_user_id`, `deleted_at IS NULL`) 매치 → `{ kind: "login", accessToken, refreshToken }`
  - 매치 없음:
    - `profile.emails[0].verified === true` 검증 (실패 시 401)
    - 동일 이메일의 기존 `users` 행 존재 시 409 (D-012 generic + 인위 지연)
    - 통과 시 ticket 발급: `crypto.randomBytes(32).toString('base64url')` → Redis `SET oauth:signup_ticket:{ticket} {payload} EX 300 NX`
    - 응답: `{ kind: "signup_required", ticket }`
- [ ] 신규 엔드포인트 `POST /auth/oauth/signup/complete` (public — ticket 검증으로 대체):
  - body: `{ ticket, username, agreedToTerms: true }` (username 은 SignUpBody 규칙 동일 — D-008)
  - Redis `GETDEL oauth:signup_ticket:{ticket}` atomic. 실패 시 401.
  - `$transaction([users.create({password: null}), oauth_accounts.create])`. P2002 catch → 409.
  - 성공 시 `{ accessToken, refreshToken }`.

### C. Link / Unlink / Links (D-004, D-005, D-009, D-014, D-016)
- [ ] `google.strategy.ts` 보강:
  - 옵션에 `state: true` + `passReqToCallback: true`
  - `validate()` 시 `profile.emails[0].verified` 검증 + state.mode 분기 정보 전달
- [ ] `GET /auth/oauth/link/google` (`@UseGuards(JwtAuthGuard)`):
  - nonce 생성 → Redis `SET oauth:link_state:{nonce} {user_id, mode:"link"} EX 300 NX` → Google authorize redirect (state=nonce)
- [ ] `GET /auth/google/callback` 통합 처리:
  - state 가 nonce 면 Redis `GETDEL` 후 user_id 매칭 → oauth_accounts 추가 (이미 active 면 409, 다른 user 가 동일 provider_user_id 사용 중이면 409)
  - state 가 없으면 login/signup_required 흐름
- [ ] `DELETE /auth/oauth/link/google` (`@UseGuards(JwtAuthGuard)`):
  ```ts
  prisma.$transaction(async (tx) => {
    const user = await tx.users.findUnique({where:{user_id}, select:{password:true}});
    const remaining = (await tx.$queryRaw<{count:bigint}[]>`
      SELECT COUNT(*) AS count FROM oauth_accounts
      WHERE user_id=${user_id}::uuid AND deleted_at IS NULL
      FOR UPDATE
    `)[0].count - 1n;
    if (user.password === null && remaining < 1n) throw ConflictException('LAST_AUTH_METHOD');
    const r = await tx.oauth_accounts.updateMany({where:{user_id, provider, deleted_at:null}, data:{deleted_at:new Date()}});
    if (r.count === 0) throw NotFoundException('NOT_LINKED');
  });
  ```
- [ ] `GET /auth/oauth/links` (`@UseGuards(JwtAuthGuard)`): `[{provider, email, createdAt}]`

### D. 비밀번호 설정 (D-007)
- [ ] `PATCH /auth/password` (`@UseGuards(JwtAuthGuard)`):
  - body: `{ currentPassword?: string, newPassword: string }` — `currentPassword` 는 password 가 이미 설정된 사용자만 필수
  - bcrypt 해시 후 `users.password` update
  - 응답: 200 + 1줄 메시지

### E. 보안·위생 정리 (D-011, D-017)
- [ ] `auth.service.sendMail` 응답에서 `{code: authCode}` 제거 — 응답은 `{ ok: true }` 만
- [ ] `auth.controller.ts:128` `console.log(req.user)` 제거
- [ ] 신규 엔드포인트 controller spec 에 `@UseGuards(JwtAuthGuard)` 누락 회귀 테스트

### F. 마이그레이션 (D-006)
- [ ] `prisma/migrations/20260522020000_oauth_accounts_partial_unique/migration.sql`:
  ```sql
  DROP INDEX "uq_oauth_accounts_provider_subject";
  DROP INDEX "uq_oauth_accounts_user_provider";
  CREATE UNIQUE INDEX "uq_oauth_accounts_provider_subject_active"
    ON "oauth_accounts" ("provider", "provider_user_id")
    WHERE "deleted_at" IS NULL;
  CREATE UNIQUE INDEX "uq_oauth_accounts_user_provider_active"
    ON "oauth_accounts" ("user_id", "provider")
    WHERE "deleted_at" IS NULL;
  ```
- [ ] `prisma/schema.prisma` 에서 두 `@@unique` 제거 + `@@index` 만 유지. 머리에 drift 주석 추가.

### G. Redis 키 (D-014)
- [ ] `src/redis/redis.keys.ts` 추가:
  - `OAUTH_SIGNUP_TICKET: (ticket) => 'oauth:signup_ticket:' + ticket`
  - `OAUTH_LINK_NONCE: (nonce) => 'oauth:link_state:' + nonce`

### H. 테스트
- [ ] `auth.service.spec.ts` — `OAuthAccountRepository` mock 으로 교체, 신규 케이스 (login / signup_required / email_verified=false reject / 이메일 충돌 409 / unlink 잠금 / link 중복) 추가.
- [ ] `auth.controller.spec.ts` — 가드 누락 회귀, 새 4 엔드포인트 + PATCH /auth/password 케이스.
- [ ] e2e: AC-CB-1/2, AC-SC-1~6, AC-LK-1~5, AC-UL-1~3, AC-LS-1/2 (회의록 Action A-012).

## 영향 범위

| 파일 | 변경 종류 |
|------|-----------|
| `src/auth/auth.controller.ts` | OAuth 흐름 + signup/complete + link + unlink + links + PATCH /password + console.log 제거 |
| `src/auth/auth.service.ts` | handleGoogleLogin 재작성, sendMail 응답 정화, password change |
| `src/auth/strategy/google.strategy.ts` | state + passReqToCallback + email_verified 검증 |
| `src/auth/oauth/oauth-account.repository.ts` (신규) | oauth_accounts CRUD |
| `src/auth/dtos/*` | OAuthSignupCompleteBody, OAuthLinkItemDto, PatchPasswordBody, generic 409 응답 매핑 |
| `src/auth/auth.module.ts` | providers + PrismaModule 의존 |
| `src/user/user.repository.ts` | OAuth 메서드 제거 |
| `prisma/schema.prisma` | 두 `@@unique` 제거 + drift 주석 |
| `prisma/migrations/20260522020000_oauth_accounts_partial_unique/migration.sql` (신규) | partial unique index |
| `src/redis/redis.keys.ts` | 2개 키 정의 |
| `src/auth/auth.controller.spec.ts`, `auth.service.spec.ts` | mock + 신규 케이스 |
| `test/auth.e2e-spec.ts` (있다면) | 회귀 시나리오 |
| `mock/google-login.html` | (선택) ticket → complete → link/unlink 흐름 테스트 UI |

## MoSCoW 우선순위 (PM 산출)

| 항목 | Priority |
|------|----------|
| user.repository OAuth 메서드 제거 + OAuthAccountRepository 신설 | **Must** |
| Partial unique index 마이그레이션 | **Must** |
| OAuth 콜백 분기 (login / signup_required) + ticket 발급 | **Must** |
| signup/complete + email_verified + P2002 catch | **Must** |
| Unlink 잠금방지 가드 ($transaction + FOR UPDATE) | **Must** |
| Link / Unlink / Links 엔드포인트 + Redis nonce + state.mode | **Must** |
| PATCH /auth/password | **Must** (D-007) |
| sendMail 응답 정화 + console.log 제거 | **Must** (보안 위생) |
| 409 generic + 인위 지연 | **Should** |
| `mock/google-login.html` 업데이트 | **Could** |

## 회의 트리거 정책

| Trigger | 시점 | 비고 |
|---|---|---|
| T1-R1 | 본 문서 컨펌 직후 | ✅ 완료 (2026-05-22 18:30, 수렴) |
| T1-verify | 구현 완료 직후 | qa + security 합류, A-012/A-013 |
| T3 | 워커 충돌 발생 시 | mini-meeting |

## 참고 사항
- 회의록: `.omc/meetings/2026-05-22-1830-oauth-account-flows.md`
- 선행 머지 문서: `docs/pre/2026-05-21-google-oauth.md`, `docs/pre/2026-05-22-oauth-accounts-schema.md`
- 모든 결정의 근거·dissent·rationale 은 회의록 D-001~D-017 표 참조.
