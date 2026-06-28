# 작업 계획: JWT 세션 관리 + Google OAuth 추가

- **날짜:** 2026-05-12
- **담당:** be-agent
- **작업 범위:** `src/auth/`, `src/user/`, `src/redis/`, `prisma/schema.prisma`, `.env`

## 목표

1. **다중 디바이스 silent logout 버그 해결**
   현재 `auth.service.ts:75-79`에서 refresh token을 `refreshToken:{userId}` 키 하나에 덮어쓴다. 노트북에서 로그인 → 태블릿에서 로그인 시 노트북 refresh token이 즉시 무효화되어 강제 로그아웃되는 문제를 sessionId 기반 멀티 세션 모델로 해결한다.

2. **현재 로그인 사용자 추적 가능**
   Redis에 활성 세션 목록을 두어 사용자별 세션 조회, 특정 디바이스 강제 로그아웃, 동시 접속자 수 측정이 가능하도록 한다.

3. **Google OAuth 추가**
   가입 진입장벽을 낮추기 위해 Google 로그인 흐름을 추가한다. 동일 email 사용자는 자동 연결, `users.password`는 nullable로 변경한다.

---

## 작업 항목

### 1) 세션 모델 (sessionId 도입)

- [ ] `src/redis/redis.keys.ts` — Redis 키 구조 변경
  - 신규: `SESSION(sessionId)` (Hash, TTL 7d) → `userId, refreshToken, deviceInfo, userAgent, ip, createdAt, lastSeenAt`
  - 신규: `USER_SESSIONS(userId)` (Set) → 해당 유저의 활성 sessionId 목록
  - 신규: `ONLINE_USERS` (Set) → 활성 세션이 1개 이상인 userId
  - 제거: `REFRESH_TOKEN(userId)`, `BLACKLIST(token)`

- [ ] `src/auth/strategy/jwt.strategy.ts`
  - `JwtPayload` 타입에 `session_id: string` 추가
  - validate에서 blacklist 조회 제거 → `session:{session_id}` 존재 여부 확인으로 대체
  - 존재 시 `lastSeenAt` 갱신 후 payload 반환, 미존재 시 401

- [ ] `src/auth/auth.service.ts` 메서드 재작성
  - `login(user, deviceInfo, req)`: sessionId(UUID) 생성 → access(15m)/refresh(7d) 발급(payload에 sessionId 포함) → `SESSION` Hash 저장 + `USER_SESSIONS` SADD + `ONLINE_USERS` SADD
  - `refresh(refreshToken)`: payload 검증 → 저장된 refreshToken과 일치 확인 → 토큰 회전, **sessionId는 유지**
  - `logout(userId, sessionId)`: `SESSION` DEL + `USER_SESSIONS` SREM + (남은 세션 없으면) `ONLINE_USERS` SREM
  - 신규 `logoutAllSessions(userId)`: 모든 세션 일괄 종료
  - 신규 `listSessions(userId)`: 본인 활성 세션 목록 반환
  - 신규 `terminateSession(userId, sessionId)`: 소유권 확인 후 특정 세션 종료
  - `issueMasterToken` 동일 세션 모델로 통합 (`isMaster` flag만 유지)

### 2) Google OAuth

- [ ] `prisma/schema.prisma` users 모델 확장
  - `password String?` (nullable)
  - `provider String?` (NULL = LOCAL, 'GOOGLE')
  - `provider_id String?` (Google sub)
  - `@@unique([provider, provider_id])`

- [ ] 마이그레이션
  - `npx prisma migrate dev --name add_oauth_and_nullable_password`

- [ ] 의존성 추가
  - `passport-google-oauth20`, `@types/passport-google-oauth20`

- [ ] 환경변수 추가 (`.env`)
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `OAUTH_SUCCESS_REDIRECT`

- [ ] 신규 파일
  - `src/auth/strategy/google.strategy.ts` — passport-google-oauth20 Strategy. profile email로 `findByEmail` → 있으면 provider 연결, 없으면 신규 OAuth 사용자 생성
  - `src/auth/guards/google.guards.ts` — `AuthGuard('google')`
  - `src/auth/dtos/sessionResponse.dto.ts` — 세션 목록 응답 DTO

- [ ] `src/user/user.repository.ts` 확장
  - `findByProvider(provider, providerId)`
  - `linkProvider(userId, provider, providerId)` (동일 email 자동 연결용)
  - `createOAuthUser({ email, username, provider, providerId })`

- [ ] `src/auth/auth.module.ts` — GoogleStrategy 등록

### 3) 엔드포인트 변경/추가 (`src/auth/auth.controller.ts`)

| Method   | Path                        | 변경                             |
| -------- | --------------------------- | -------------------------------- |
| `POST`   | `/auth/login`               | body에 `deviceInfo?` 옵셔널 추가 |
| `DELETE` | `/auth/logout`              | **현재 세션만** 종료             |
| `POST`   | `/auth/refresh`             | sessionId 유지하며 회전          |
| `GET`    | `/auth/sessions`            | 신규 — 본인 활성 세션 목록       |
| `DELETE` | `/auth/sessions/:sessionId` | 신규 — 특정 디바이스 세션 종료   |
| `POST`   | `/auth/logout/all`          | 신규 — 모든 세션 종료            |
| `GET`    | `/auth/google`              | 신규 — Google OAuth 시작         |
| `GET`    | `/auth/google/callback`     | 신규 — JWT 발급 후 FE redirect   |

### 4) 정리 작업

- [ ] `src/auth/guards/jwt.guards 2.ts`, `src/auth/guards/local.guards 2.ts` 삭제 (macOS Finder 중복본)

---

## 영향 범위

**수정 파일**

- `prisma/schema.prisma`
- `src/redis/redis.keys.ts`
- `src/auth/auth.module.ts`
- `src/auth/auth.service.ts`
- `src/auth/auth.controller.ts`
- `src/auth/strategy/jwt.strategy.ts`
- `src/auth/dtos/loginBody.dto.ts`
- `src/user/user.repository.ts`
- `.env`, `.env.example`

**신규 파일**

- `src/auth/strategy/google.strategy.ts`
- `src/auth/guards/google.guards.ts`
- `src/auth/dtos/sessionResponse.dto.ts`
- `prisma/migrations/<timestamp>_add_oauth_and_nullable_password/migration.sql`

**삭제 파일**

- `src/auth/guards/jwt.guards 2.ts`
- `src/auth/guards/local.guards 2.ts`

---

## 재사용할 기존 자산

- `RedisService.getClient()` (`src/redis/redis.service.ts:34`) — Hash/Set 명령 그대로 사용
- `UserRepository.findByEmail` (`src/user/user.repository.ts:19`) — OAuth 자동 연결 핵심
- `JwtModule` (`src/auth/auth.module.ts:14-21`) — sign/verify 재사용
- `ApiSuccessResponse` 데코레이터 — 신규 엔드포인트 응답 포맷

---

## 검증 계획

1. **마이그레이션 적용**: `npx prisma migrate dev` 후 `npx prisma studio`로 users 테이블에 provider, provider_id, password nullable 반영 확인.
2. **멀티 디바이스 동시 로그인**:
   - 같은 계정으로 `/auth/login` 2회(다른 deviceInfo) → 두 access token 모두 보호 엔드포인트에서 200.
   - `redis-cli SMEMBERS user:sessions:{userId}` 결과 2개.
   - 한쪽 `/auth/logout` 후 다른 쪽은 여전히 200, 로그아웃 쪽은 401.
3. **Refresh 회전**: `/auth/refresh` 호출 시 sessionId 유지 확인(디코딩), 이전 refreshToken 재사용은 401.
4. **세션 관리 API**: `/auth/sessions`로 모든 디바이스 노출, `/auth/sessions/:id`로 특정 세션 종료.
5. **Google OAuth**:
   - 신규 Google 계정으로 `/auth/google` → 콜백 → FE redirect URL에 토큰 부착.
   - users 테이블에 `provider='GOOGLE'`, `password=NULL`로 row 생성.
   - **자동 연결**: 동일 email로 사전에 local 가입 후 Google 로그인 → 같은 user_id 유지, provider 필드만 'GOOGLE'로 업데이트.
6. **동시 접속자 수**: `redis-cli SCARD online:users`로 측정.
7. **Swagger `/docs`**: 신규 엔드포인트 노출 및 시그니처 확인.
8. **기존 테스트**: `pnpm run test -- --testPathPattern=auth` 그린.

---

## 참고 사항

### 하위 호환 없음

기존 발급된 access/refresh 토큰은 `session_id`가 없으므로 배포와 동시에 모두 무효화된다. 모든 사용자가 재로그인 필요 — 릴리즈 노트 명시 필요.

### 후속 작업 (이번 PR 범위 외 / 별도 필요)

- **WS Gateway 인증 통합**: `src/ws/ws.gateway.ts`의 handshake.auth.token 검증에도 sessionId 존재 확인 필요. 이 PR과 함께 처리하는 것을 권장(누락 시 WS는 무효 세션으로도 연결됨).
- **OAuth-only 사용자의 비밀번호 변경 / 재설정**: `password=NULL` 사용자 분기 처리 별도 작업.
- **Rate limiting**: `/auth/login`, `/auth/refresh`, `/auth/google` IP 기반 throttling.

### 결정 사항 요약

- OAuth Provider: **Google만** (Kakao/Naver/GitHub은 차후 확장)
- 세션 관리 범위: **디바이스별 멀티세션** (노트북 + 태블릿 동시 사용 지원)
- 계정 통합 정책: **동일 email 자동 연결** (이메일 검증된 provider 한정)
- password 필드: **nullable로 변경** (OAuth-only 사용자는 NULL)
