# 작업 계획: Google OAuth 구현

- **날짜:** 2026-05-21
- **담당:** backend-1
- **작업 범위:** `src/auth/` (strategy, controller, service, module)

## 목표

Google OAuth 2.0 로그인 기능을 추가한다.  
기존 email/password 기반 인증(LocalStrategy) 패턴을 그대로 따라 `passport-google-oauth20` Strategy를 추가하고,  
`/auth/google` → Google 인증 → `/auth/google/callback` 흐름으로 JWT를 발급한다.

## 작업 항목

- [ ] `prisma/schema.prisma` — `users` 모델에 `oauth_provider`, `oauth_id` 컬럼 추가 (team-lead 사전 승인 필요)
- [ ] `pnpm add passport-google-oauth20 @types/passport-google-oauth20` 설치
- [ ] `src/auth/strategies/google.strategy.ts` — GoogleStrategy 구현
- [ ] `src/auth/guards/google.guard.ts` — GoogleAuthGuard 구현
- [ ] `src/auth/auth.service.ts` — `handleGoogleLogin()` 추가 (email 매칭 → 없으면 신규 생성)
- [ ] `src/auth/auth.controller.ts` — `GET /auth/google`, `GET /auth/google/callback` 라우트 추가
- [ ] `src/auth/auth.module.ts` — GoogleStrategy 등록
- [ ] `docs/pre` 및 Notion 시작 보고서 업로드
- [ ] 빌드 검증 (`pnpm build`)

## 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `prisma/schema.prisma` | `users` 모델에 `oauth_provider String?`, `oauth_id String?` 컬럼 추가 |
| `src/auth/strategies/google.strategy.ts` | 신규 생성 — GoogleStrategy |
| `src/auth/guards/google.guard.ts` | 신규 생성 — GoogleAuthGuard |
| `src/auth/auth.service.ts` | `handleGoogleLogin()` 메서드 추가 |
| `src/auth/auth.controller.ts` | `/auth/google`, `/auth/google/callback` GET 라우트 추가 |
| `src/auth/auth.module.ts` | GoogleStrategy providers 등록 |
| `src/user/user.repository.ts` | `findByOAuthId()`, `createOAuthUser()` 메서드 추가 |

## 참고 사항

- `passport-google-oauth20` 미설치 상태 → 설치 필요
- prisma schema 변경 시 `npx prisma generate` 필요 (migrate는 dev 환경 DB 없이 불가)
- 환경변수 (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`) 는 `.env.example` 에만 추가
- 실제 `.env` 수정 금지
- LocalStrategy, JwtStrategy 패턴 그대로 준수
- users 모델 `password` 컬럼은 OAuth 유저는 빈 문자열로 저장 (nullable 변경 or 빈값)
