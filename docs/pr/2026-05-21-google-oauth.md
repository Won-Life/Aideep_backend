# 작업 완료: Google OAuth 구현

- **날짜:** 2026-05-21
- **담당:** backend-1

## 변경 요약

passport-google-oauth20 Strategy를 추가하고 `/auth/google`, `/auth/google/callback` 라우트를 구현하여 Google OAuth 로그인 후 JWT 발급 흐름을 완성했다.

## 추가/수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `prisma/schema.prisma` | `users` 모델에 `oauth_provider String?`, `oauth_id String?` 추가, `password` nullable 변경 |
| `src/auth/strategy/google.strategy.ts` | 신규 — `GoogleStrategy` (`passport-google-oauth20`) |
| `src/auth/guards/google.guard.ts` | 신규 — `GoogleAuthGuard extends AuthGuard('google')` |
| `src/auth/auth.service.ts` | `handleGoogleLogin()` 추가 — email 매칭 → 없으면 신규 생성 후 JWT 발급 |
| `src/auth/auth.controller.ts` | `GET /auth/google`, `GET /auth/google/callback` 라우트 추가 |
| `src/auth/auth.module.ts` | `GoogleStrategy` providers 등록 |
| `src/user/user.repository.ts` | `findByOAuthId()`, `createOAuthUser()` 추가 |
| `src/auth/auth.controller.spec.ts` | `WINSTON_MODULE_NEST_PROVIDER` mock, 신규 repo 메서드 mock 추가 |
| `src/auth/auth.service.spec.ts` | `WINSTON_MODULE_NEST_PROVIDER` mock, 신규 repo 메서드 mock 추가 |
| `.env.example` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` 추가 |
| `package.json` | `passport-google-oauth20`, `@types/passport-google-oauth20` 설치 |

## PR 설명

### 배경
issue-23 요청에 따라 Google OAuth 2.0 로그인 기능 추가. 기존 email/password LocalStrategy 패턴을 준수하면서 OAuth 흐름을 통합.

### 변경 내용

**OAuth 흐름:**
1. `GET /auth/google` → `GoogleAuthGuard` → Google 인증 페이지 리다이렉트
2. Google 인증 완료 → `GET /auth/google/callback` → `GoogleStrategy.validate()` → `req.user`에 `GoogleProfile` 주입
3. `AuthService.handleGoogleLogin()` — `oauth_id`로 기존 유저 조회 → 없으면 email로 조회 → 없으면 신규 생성 → JWT 발급

**Schema 변경:**
- `password` nullable(`String?`) — OAuth 유저는 password 없음
- `oauth_provider String?` — 현재 "google", 향후 다른 provider 확장 가능
- `oauth_id String?` — Google sub ID

### 테스트
- `pnpm build` — 컴파일 에러 0
- `pnpm test --testPathPatterns=auth` — 2 suites, 2 tests passed

### 주의사항 / 후속 작업

**마이그레이션 (중요):**
- 마이그레이션 SQL은 `prisma/migrations/20260521000000_add_oauth_fields/migration.sql`에 생성만 되어 있음
- **`npx prisma migrate dev` 실행 금지** — staging 환경 검증 후 수동 적용
- 적용 시: `npx prisma migrate deploy` 사용 (production-safe)
- SQL 내용: `password` NOT NULL 해제, `oauth_provider VARCHAR(50)` 추가, `oauth_id VARCHAR(255)` 추가
- 기존 데이터 호환: 기존 유저의 `password` 값은 유지되며 `oauth_provider`/`oauth_id`는 NULL로 채워짐

**환경 설정:**
- Google Cloud Console에서 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 발급 후 `.env`에 등록
- 콜백 URL `http://localhost:3320/v1/aideep/api/auth/google/callback`을 Google Console authorized redirect URI에 등록

**기타:**
- 현재 콜백은 JSON 응답 (accessToken, refreshToken); 프론트엔드 연동 시 리다이렉트 방식 전환 고려
