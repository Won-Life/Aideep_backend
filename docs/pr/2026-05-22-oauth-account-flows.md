# 작업 완료: OAuth 회원가입·연동·해제 흐름 정비

- **날짜:** 2026-05-22
- **담당:** backend-1-impl (executor)

## 변경 요약

Google OAuth 흐름을 ticket+complete 2-step 으로 분리하고, 자동 이메일 매칭 제거(409 차단), link/unlink/비밀번호 설정 API 추가, sendMail authCode 노출 제거, 보안 위생 정리.

## 추가/수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/auth/oauth/oauth-account.repository.ts` | **신규** — OAuthAccountRepository (D-015 메서드 6종) |
| `src/user/user.repository.ts` | findByOAuthId / createOAuthUser 제거 (기존 broken OAuth 메서드) |
| `src/auth/auth.module.ts` | OAuthAccountRepository providers 등록 |
| `src/auth/strategy/google.strategy.ts` | passReqToCallback: true + email_verified 검증 + state 전달 (D-009, D-010) |
| `src/auth/auth.service.ts` | handleGoogleLogin 재작성 (login/signup_required/linked 분기), completeOAuthSignup, initiateOAuthLink, listOAuthLinks, unlinkOAuth ($transaction+FOR UPDATE), changePassword, sendMail 응답 정화 |
| `src/auth/auth.controller.ts` | POST /oauth/signup/complete, GET /oauth/link/google, GET /oauth/links, DELETE /oauth/link/:provider, PATCH /password, console.log(req.user) 제거 |
| `src/auth/dtos/oauthSignupComplete.dto.ts` | **신규** — OAuthSignupCompleteBody |
| `src/auth/dtos/patchPassword.dto.ts` | **신규** — PatchPasswordBody |
| `src/redis/redis.keys.ts` | OAUTH_SIGNUP_TICKET / OAUTH_LINK_NONCE 추가 (D-014) |
| `prisma/schema.prisma` | oauth_accounts @@unique 제거 + partial index drift 주석 (D-006) |
| `prisma/migrations/20260522020000_oauth_accounts_partial_unique/migration.sql` | **신규** — partial unique index SQL (D-006) |
| `src/auth/auth.service.spec.ts` | OAuthAccountRepository/PrismaService mock + 신규 케이스 8종 |
| `src/auth/auth.controller.spec.ts` | 신규 엔드포인트 케이스 + JwtAuthGuard 누락 회귀 테스트 |

## PR 설명

### 배경
Google OAuth 흐름이 단일 콜백에서 자동 이메일 매칭으로 계정을 병합하는 구조였고, `users` 테이블에 직접 oauth_provider/oauth_id 를 저장했다. 이로 인해 1:N OAuth 연동이 불가능하고, email enumeration 취약점과 authCode 응답 노출(C4-CRITICAL) 이 존재했다.

### 변경 내용
1. **2-step 가입 흐름 (D-001)**: Google 콜백에서 신규 사용자면 `signup_required + ticket` 만 반환 → 클라이언트가 `POST /auth/oauth/signup/complete` 에 username + ticket 을 제출해 가입 완료.
2. **이메일 충돌 409 + 인위 지연 (D-002, D-012)**: 동일 이메일 기존 사용자 존재 시 자동 링크 대신 ConflictException + 200~300ms 지연.
3. **OAuthAccountRepository 일원화 (D-015)**: `oauth_accounts` 테이블 전담 repository 신설, `user.repository.ts` 의 broken OAuth 메서드 제거.
4. **link / unlink / links 엔드포인트 (D-004, D-005, D-016)**: Redis nonce 로 CSRF 보호, unlink 는 `$transaction + SELECT FOR UPDATE + LAST_AUTH_METHOD` 가드.
5. **PATCH /auth/password (D-007)**: OAuth-only 사용자가 비밀번호 설정 가능, 기존 비밀번호 있으면 currentPassword 검증.
6. **Partial unique index (D-006)**: `deleted_at IS NULL` 조건부 unique — soft-deleted row 재link 허용.
7. **보안 위생 (D-011, D-017)**: sendMail 응답에서 authCode 제거 → `{ok:true}`, logout 핸들러 `console.log(req.user)` 제거.
8. **email_verified 검증 (D-010)**: GoogleStrategy.validate() 에서 `profile.emails[0].verified !== true` 이면 401.

### 테스트
- `pnpm test --testPathPatterns=auth` → **20/20 PASS**
- `npx tsc --noEmit` → **src/ 타입 에러 0건**
- DB 마이그레이션: oauth_accounts 테이블 + partial unique index 직접 적용 완료

### 주의사항 / 후속 작업
- node/edge spec 4개 suite 실패 — `EdgeRepository` 미등록 기존 이슈 (본 PR 범위 외)
- e2e 테스트 (A-012): qa + security verify 단계에서 진행 예정
- `mock/google-login.html` ticket → complete → link/unlink 흐름 UI 업데이트는 Could 우선순위 — 후속 작업

---

## Fast-Follow 보강 (security-verify 피드백)

### #1 MEDIUM — OAuth login-CSRF 차단 (D-009 보완)

**문제**: `GET /auth/google` 가 GoogleAuthGuard 자동 리다이렉트여서 state nonce 미발급 → 공격자 code 주입 가능.

**변경 내용**:
- `auth.service.ts`: `initiateOAuthLogin()` 신설 — `{mode:'login'}` nonce → Redis 저장 → Google URL 반환
- `auth.service.ts`: `initiateOAuthLink()` payload `{mode:'link', user_id}` 로 통일
- `auth.service.ts`: `handleGoogleLogin()` state 필수화 — `!profile.state` 또는 Redis miss → 401
- `auth.service.ts`: Redis payload `mode` 필드로 login/link 분기 처리
- `auth.controller.ts`: `GET /auth/google` → GoogleAuthGuard 제거, 수동 redirect (`initiateOAuthLogin()`)

### #2 MEDIUM — `agreedToTerms` 강제

**변경 내용**:
- `src/auth/dtos/oauthSignupComplete.dto.ts`: `@Equals(true, { message: '약관 동의가 필요합니다.' })` + `@MinLength(2)` / `@MaxLength(100)` (username) 추가

### Fast-Follow 검증
- `npx tsc --noEmit` → src/ 에러 0건 ✅
- `pnpm test --testPathPatterns=auth` → **24/24 PASS** ✅
- 신규 테스트: state 누락 401, invalid state 401, login mode 분기, link mode 분기, initiateOAuthLogin nonce 저장, GET /auth/google redirect

---

## QA-Verify Spec 보강 (qa-verify 핵심 5건)

### 추가된 파일
- `src/auth/strategy/google.strategy.spec.ts` **신규** — AC-CB-2 전용

### 추가된 케이스

| ID | 위치 | 내용 |
|----|------|------|
| AC-CB-2 | google.strategy.spec.ts | verified=false → 401, verified='true'(string) → 성공, emails=[] → 401, state → GoogleProfile.state 포함 |
| AC-SC-5 | auth.service.spec.ts | ticket 1회 소진 — 두 번째 호출 UnauthorizedException |
| AC-SC-6 | auth.service.spec.ts | P2002 에러 → ConflictException(이미 가입된...) |
| AC-LK-4 | auth.service.spec.ts | 다른 사용자 provider_user_id 충돌 → ConflictException(이미 다른 계정에 연동된...) |
| AC-UL-3 | auth.service.spec.ts | updateMany count=0 → NotFoundException(NOT_LINKED) |

### 최종 검증
- `npx tsc --noEmit` → src/ 에러 0건 ✅
- `pnpm test --testPathPatterns=auth` → **33/33 PASS** ✅ (3 suites: controller + service + strategy)
- backlog (후속 PR): AC-SC-2, AC-LK-1, AC-LK-5, AC-LS-2
