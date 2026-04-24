# Aideep Backend

협업 그래프 기반 워크스페이스 플랫폼의 NestJS 백엔드 서버입니다.  
사용자는 워크스페이스 안에서 노드와 엣지로 구성된 그래프를 실시간으로 함께 편집하고, Claude AI와 대화하며 아이디어를 기획 문서로 저장할 수 있습니다.

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| Framework | NestJS 11 (TypeScript) |
| Database | PostgreSQL 16 + Prisma 6 ORM |
| Cache | Redis 5 |
| WebSocket | Socket.io 4 |
| CRDT | Yjs 13 (실시간 협업 편집) |
| AI | Anthropic Claude API (Haiku / Sonnet) |
| Storage | AWS S3 (pre-signed URL) |
| Auth | JWT + Passport |
| Logging | Winston |
| Metrics | Prometheus |
| Package | pnpm |
| Deploy | Docker + docker-compose |

---

## 아키텍처 개요

```
클라이언트
    │
    ├─ REST  ──► /aideep/api          (HTTP, Swagger: /docs)
    │
    └─ WS    ──► /workspace (Socket.io)
                    │
                    ├─ 워크스페이스 이벤트 (join, cursor, node_position)
                    └─ Yjs CRDT (yjs:join / yjs:sync / yjs:awareness)

백엔드
    ├─ NestJS 모듈 레이어
    ├─ Prisma  ──► PostgreSQL
    ├─ Redis   ──► Yjs 상태 캐시 (30s TTL) / 이메일 인증 코드
    └─ Claude  ──► AI 채팅 스트리밍 / 요약 → 노드 저장
```

### 요청 처리 파이프라인

```
HTTP 요청
  → ValidationPipe (whitelist, transform)
  → LoggingInterceptor
  → HttpMetricsInterceptor
  → Controller
  → Service
  → ResponseInterceptor (표준 응답 envelope)
  → AllExceptionsFilter (에러 시)
```

---

## 모듈 구조

```
src/
├── app.module.ts
├── main.ts
│
├── auth/          # JWT + Passport 인증, 이메일 인증, 회원가입/로그인
├── user/          # 유저 CRUD
├── workspace/     # 워크스페이스 CRUD, 멤버 역할 관리
├── node/          # 그래프 노드 (PROJECT / DATA / RESOURCE / ARCHIVE)
├── edge/          # 그래프 엣지, depth 재조정 로직
│
├── ws/            # Socket.io WebSocket Gateway
├── yjs/           # Yjs CRDT 실시간 협업 편집
│
├── chat/          # Claude AI 채팅 + 대화 → 노드 저장
├── upload/        # AWS S3 pre-signed URL
├── redis/         # Redis 클라이언트
├── prisma/        # Prisma ORM 클라이언트
│
└── common/
    ├── error/     # HttpExceptionFilter, DB 에러 핸들러
    ├── exception/ # 도메인 예외 클래스
    ├── response/  # ResponseInterceptor, 표준 응답 DTO
    ├── logging/   # Winston 로깅 인터셉터
    └── metrics/   # Prometheus HTTP/WS 메트릭스
```

---

## 데이터베이스 스키마

```
users ──── users_workspaces ──── workspaces
                                     │
                                ┌────┴────┐
                              nodes      edges
```

| 테이블 | 주요 컬럼 |
|--------|-----------|
| `users` | user_id (UUID), email, username, password |
| `workspaces` | workspace_id (UUID), title |
| `users_workspaces` | role (OWNER / EDITOR / VIEWER) |
| `nodes` | node_id, node_type, title, content (JSON), position_x/y, yjs_state (Bytes), depth |
| `edges` | edge_id, source_id, target_id, source_handle, target_handle |

- 모든 PK: UUID (`gen_random_uuid()`)
- 소프트 삭제: `deleted_at` 필드
- 낙관적 동시성: `version` 필드 (nodes, edges)

---

## 실시간 WebSocket

**엔드포인트:** `ws://host/workspace`  
**인증:** `handshake.auth.token` (JWT)

### 클라이언트 → 서버

| 이벤트 | 페이로드 | 설명 |
|--------|----------|------|
| `join_workspace` | `{ workspaceId }` | 워크스페이스 룸 입장 |
| `node_position_live` | `{ workspaceId, nodeId, x, y }` | 실시간 노드 위치 (DB 저장 없음) |
| `cursor_move` | `{ workspaceId, x, y, userName, color }` | 실시간 커서 위치 |
| `yjs:join` | `{ nodeId }` | Yjs 노드 편집 참여 |
| `yjs:sync` | `{ nodeId, data }` | Yjs 동기화 메시지 |
| `yjs:awareness` | `{ nodeId, data }` | Yjs 에디터 인지 상태 |
| `yjs:leave` | `{ nodeId }` | Yjs 노드 편집 종료 |
| `ws:awareness` | `{ workspaceId, data }` | 워크스페이스 레벨 인지 상태 |

### 서버 → 클라이언트

| 이벤트 | 설명 |
|--------|------|
| `workspace_event` | NODE_CREATE / NODE_DELETE / NODE_UPDATE / NODE_MOVE / EDGE_CREATE |
| `node_position_live` | 다른 유저의 실시간 노드 드래그 |
| `cursor_move` | 다른 유저의 커서 위치 |
| `cursor_leave` | 유저 연결 해제 알림 |

### Yjs CRDT 동작 흐름

1. 클라이언트가 `yjs:join` 이벤트 전송
2. 서버: Redis → DB 순서로 YDoc 상태 로드
3. SyncStep1 전송 (표준 Yjs 핸드셰이크)
4. 변경 발생 시 같은 노드 룸에 브로드캐스트
5. debounce 후 Redis + DB 동시 저장
6. 클라이언트 0명이 되면 idle timeout 후 메모리 해제

---

## AI 채팅 기능

| 기능 | 모델 | 설명 |
|------|------|------|
| 스트리밍 채팅 | claude-haiku-4-5 | 기획 전문가 페르소나, SSE 스트리밍 |
| 대화 요약 저장 | claude-sonnet-4-6 | 대화 → 마크다운 요약 → Lexical JSON → DATA 노드 |

---

## 환경 변수

`.env` 파일을 `Aideep_backend/` 에 생성하세요.

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Server
PORT=3320

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_USERNAME=
REDIS_PASSWORD=

# Auth
JWT_SECRET=your_jwt_secret

# Email
MAIL_USER=your@email.com
MAIL_PASS=your_email_password

# AWS S3
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...
```

---

## 실행 방법

### 사전 요구사항
- Node.js 20+
- pnpm
- PostgreSQL
- Redis

### 개발 환경

```bash
# 의존성 설치
pnpm install

# DB 마이그레이션
npx prisma migrate dev

# 개발 서버 실행 (watch mode)
pnpm run start:dev
```

### 프로덕션

```bash
# 빌드
pnpm run build

# 실행
pnpm run start:prod
```

### Docker

```bash
docker-compose up
```

---

## 데이터베이스 관리

```bash
# 마이그레이션 적용 (개발)
npx prisma migrate dev

# Prisma 클라이언트 재생성 (schema 변경 후)
npx prisma generate

# Prisma Studio GUI
npx prisma studio
```

---

## 테스트

```bash
# 전체 유닛 테스트
pnpm run test

# 특정 모듈 테스트
pnpm run test -- --testPathPattern=auth

# E2E 테스트
pnpm run test:e2e

# 커버리지
pnpm run test:cov
```

---

## API 문서

서버 실행 후 아래 URL에서 Swagger UI를 확인할 수 있습니다.

```
http://localhost:3320/docs
```

API 기본 경로: `/aideep/api` (또는 `/v1/aideep/api`)

---

## 모니터링

Prometheus 메트릭은 `/metrics` 엔드포인트에서 수집됩니다.

- `http_requests_total` — HTTP 요청 수 (method, route, status_code)
- `ws_connections_active` — 현재 WebSocket 연결 수
