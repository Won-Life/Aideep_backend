---
id: SPEC-MEETING-PROXY-001
title: "`/meeting/transcript` 신규 forward-proxy 엔드포인트 — 실사용자 JWT 헤더 릴레이"
version: "0.1.0"
status: in-progress
created: 2026-08-08
updated: 2026-08-08
author: manager-spec
priority: High
phase: "v0.3.0"
module: "src/meeting/, src/ai/ai-be.client.ts"
lifecycle: spec-anchored
tags: "meeting, proxy, gateway, auth, jwt, nestjs, pass-through"
tier: M
---

# SPEC-MEETING-PROXY-001: `/meeting/transcript` 신규 forward-proxy 엔드포인트

## HISTORY

- 2026-08-08: v0.1.0 최초 작성 (manager-spec). `/Users/chs/dev/AiDeep/meeting_plan.md`(옵션 A/B/C 비교 검토 보고서, 작성일 2026-08-06)의 §3 "옵션 A — 전체 pass-through"가 채택 설계로 확정됨에 따라, `Aideep_backend`(이 저장소) 측 구현 범위를 다루는 SPEC. `Aideep_backend`는 현재 `/meeting` 라우트를 전혀 갖고 있지 않다 — `grep -rln "meeting" src`가 매치 0건을 반환함을 확인했다(`meeting_plan.md` §1 "배경"과 일치). 3개 저장소(`AiDeep-AI-BE`의 SPEC-API-004(작성 완료, `status: draft`) / `AiDeep-Agent`의 SPEC-MEETING-AUTH-001(작성 완료, `status: draft`) / 본 SPEC) 중, 본 SPEC이 마지막으로 작성되는 SPEC이자 체인의 **시작점**(실사용자 JWT가 최초로 발급·검증되는 지점)을 다룬다.
- 2026-08-08: **신규 SPEC — `Aideep_backend`에는 이 시점까지 대응할 기존 SPEC이나 `/meeting` 관련 코드가 전혀 없으므로**(위 grep 결과), amendment 여부를 검토할 대상 자체가 없다. `AiDeep-AI-BE`의 SPEC-API-004, `AiDeep-Agent`의 SPEC-MEETING-AUTH-001과 동일한 3-저장소 조율 이니셔티브의 일부로서 신규 SPEC으로 작성한다.
- 2026-08-08: REQ ID는 이 저장소의 신규 도메인("MEETING-PROXY")에서 `REQ-MEETING-PROXY-001`부터 시작한다.
- 2026-08-08: **Tier는 M으로 분류**한다. 영향 파일: 신규 `src/meeting/meeting.{module,controller,service}.ts` + `src/meeting/dto/transcriptChunk.dto.ts` + `src/meeting/meeting.{controller,service}.spec.ts`(신규 5개), 기존 `src/ai/ai-be.client.ts` + `src/ai/ai-be.client.spec.ts`(수정 2개), `src/app.module.ts`(수정 1개, `MeetingModule` 등록) = 총 8개 파일. 순증 코드는 프로덕션 코드 약 150-200 LOC + 테스트 약 150-250 LOC로, 300-1000 LOC 구간(Tier M 가이드)에 해당한다. 신규 외부 의존성은 없다(§5 결정 3 참고 — 기존 `AiBeClient` 재사용). Tier M 산출물 세트(spec.md + plan.md + acceptance.md)에 manager-spec Step 4 HARD 지침에 따라 progress.md를 더한 4파일로 작성한다.
- 2026-08-08: **역할/권한 레벨(VIEWER 등) 정합성은 명시적으로 범위 제외**(사용자 확정 사항, Socratic 확인 완료 — 재논의 대상 아님). `meeting_plan.md` §7-2가 언급하는 워크스페이스 역할별 노드 생성 권한 정합성은 본 SPEC이 다루지 않는다. §3.2 Exclusions에 기록한다.
- 2026-08-08: **인증 가드는 `JwtAuthGuard`(이 저장소의 표준 보호 라우트 메커니즘)를 그대로 사용**(사용자 확정 사항). 새로운 가드나 인증 로직을 발명하지 않는다 — `node.controller.ts`/`ai.controller.ts`/`meet.controller.ts`가 이미 사용 중인 `@UseGuards(JwtAuthGuard)` 패턴을 그대로 적용한다.

---

## 1. 개요

### 1.1 배경

`AiDeep-Agent`는 회의록 청크를 받아 관계를 추론한 뒤, 결과로 만들어진 노드/엣지를 **내부적으로 `Aideep_backend`에 다시 콜백**해서 생성한다(`AiDeep-Agent`의 `app/agent/aideep_backend_client.py`). 이 콜백은 실제 회의 참여자의 신원이 아니라 **공유 개발용 마스터 토큰**(`POST /auth/issue/master`로 발급)을 사용한다. `Aideep_backend`의 `issueMasterToken()`(`src/auth/auth.service.ts`)은 `NODE_ENV === 'production'`일 때 `ForbiddenException`을 던지므로, 이 방식은 프로덕션에서 동작하지 않으며 신원 손실(`created_by`/감사 로그/워크스페이스 역할 체크가 마스터 계정 기준으로 수행됨)과 권한 상승 위험(마스터 자격증명이 정적 env var로 상주)을 발생시킨다. 상세 진단은 `meeting_plan.md` §2를 참고한다.

채택된 설계(`meeting_plan.md` §3 "옵션 A — 전체 pass-through")는 meeting-capture(또는 향후 호출자)가 보유한 실사용자 JWT를 `Authorization` 헤더로 체인 전체(호출자 → **`Aideep_backend`(본 SPEC)** → `AiDeep-AI-BE` → `AiDeep-Agent`)에 그대로 릴레이하는 것이다.

### 1.2 문제 정의 — 이 저장소에 없는 조각

`Aideep_backend`는 현재 `/meeting` 관련 라우트를 자체적으로 전혀 갖고 있지 않다(HISTORY 1번째 항목의 grep 결과 참고). meeting-capture는 `AiDeep-AI-BE`를 직접 호출하도록 설계되어 있지 않다 — `Aideep_backend`를 거쳐야 한다. 즉, 체인의 **첫 홉**이 존재하지 않는다: 실사용자 JWT를 발급/검증하고 그 JWT를 다음 계층으로 전달을 시작하는 지점이 없다.

본 SPEC은 이 빠진 조각을 메운다: 실사용자 JWT를 요구하는(`JwtAuthGuard`) 신규 `POST /meeting/transcript` forward-proxy 엔드포인트를 신설하고, `JwtAuthGuard`가 이미 검증한 그 요청의 `Authorization` 헤더 값을 그대로 `AiDeep-AI-BE`로 전달한다.

### 1.3 목표

- 신규 NestJS 모듈(`src/meeting/`)에 `POST /meeting/transcript` 엔드포인트를 신설하고, `JwtAuthGuard`로 보호한다(모듈 A).
- 인증된 요청의 워크스페이스 멤버십을 확인한 뒤(모듈 C), 인바운드 `Authorization` 헤더 값을 그대로 아웃바운드 `AiDeep-AI-BE` 호출의 `Authorization` 헤더로 전달한다(모듈 B).
- 기존 `AiBeClient`(`src/ai/ai-be.client.ts`)를 확장해 임의 헤더를 실어 보낼 수 있게 하고, 기존 `/chat`·`/retrieve` 호출부는 변경 없이 그대로 동작하게 한다(모듈 D).
- `AiDeep-AI-BE`의 응답/오류를 기존 `AiBeUnavailableError`/`AiBeBadRequestError` 패턴으로 매핑한다(모듈 E).
- 테스트로 인증 가드, 멤버십 체크, 헤더 릴레이, 오류 매핑, 기존 `AiBeClient` 회귀를 모두 검증한다(모듈 F).

---

## 2. 용어 정의

| 용어 | 정의 |
|---|---|
| Forward-proxy(전달 프록시) | 호출자의 요청(과 인증 컨텍스트)을 그대로 다음 계층으로 전달하는 엔드포인트. 본 SPEC의 `POST /meeting/transcript`가 이에 해당한다 — 자체적으로 노드/엣지를 생성하지 않고, `AiDeep-AI-BE`로 릴레이만 수행한다. |
| Pass-through(전체 릴레이) | 실사용자 JWT를 체인 전체(호출자 → `Aideep_backend` → AI-BE → Agent)에 걸쳐 검증·이해 없이(내용 파싱 없이) 그대로 전달하는 방식. 다만 `Aideep_backend` 자신은 `JwtAuthGuard`로 그 토큰을 정상적으로 검증한다 — "이해하지 않는다"는 것은 AI-BE/Agent 구간에 해당하는 표현이며, `Aideep_backend`는 발급 주체이자 최초 검증 주체다. |
| 헤더 릴레이(Header Relay) | 인바운드 요청에서 받은 `Authorization` 헤더의 원본 문자열 값을, 재서명·재발급·파싱 없이 아웃바운드 요청의 동일 헤더에 그대로 실어 보내는 것. |
| Dev 마스터 토큰 | `POST /auth/issue/master`가 발급하는 개발용 JWT. `AiDeep-Agent`의 콜백에서 현재 사용 중이나, 이는 본 저장소의 별개 백도어 기능이며 본 SPEC의 범위가 아니다(§3.2). |

---

## 3. 범위

### 3.1 In Scope

a. **신규 모듈/컨트롤러/서비스** — `src/meeting/` 디렉터리에 `MeetingModule`/`MeetingController`/`MeetingService`를 신설한다. `POST /meeting/transcript`가 `@UseGuards(JwtAuthGuard)` + `@ApiBearerAuth('jwt')`로 보호된다(모듈 A).

b. **요청/응답 DTO** — `AiDeep-AI-BE`의 `TranscriptChunkRequest`/`TranscriptChunkResponse`(`app/schemas/meeting.py`)와 필드명·casing이 동일한 DTO를 정의한다(모듈 A 부속).

c. **워크스페이스 멤버십 확인** — `AiService.checkMembership()`과 동일한 패턴으로 `WorkspaceRepository.checkWorkspace()`를 호출해 인증된 사용자가 `body.workspaceId`의 멤버인지 확인한다. 새로운 역할(role) 판단 로직은 도입하지 않는다(모듈 C).

d. **`Authorization` 헤더 릴레이** — 인바운드 요청의 `Authorization` 헤더 원본 값을 추출해, `AiDeep-AI-BE` `/meeting/transcript`로의 아웃바운드 호출에 동일한 헤더로 그대로 전달한다(모듈 B).

e. **`AiBeClient` 확장** — `src/ai/ai-be.client.ts`의 `post<T>()`에 선택적 `extraHeaders` 파라미터를 추가한다. 기존 `/chat`·`/retrieve` 호출부(`extraHeaders` 미전달)는 동작이 바뀌지 않는다(모듈 D).

f. **응답/오류 매핑** — `AiDeep-AI-BE`의 성공 응답을 `TranscriptChunkResponse` 형태로 반환하고, 5xx/네트워크 실패는 기존 `AiBeUnavailableError`(502)로, 4xx는 기존 `AiBeBadRequestError`로 매핑한다 — 신규 예외 클래스를 만들지 않고 `src/ai/ai-be.exception.ts`를 재사용한다(모듈 E).

g. **회귀 방지 테스트** — 인증 가드, 멤버십 체크, 헤더 릴레이, 오류 매핑, 그리고 `AiBeClient`의 기존 `/chat`·`/retrieve` 호출부가 신규 `extraHeaders` 파라미터 도입 이후에도 그대로 동작함을 검증한다(모듈 F).

### 3.2 Exclusions (What NOT to Build)

### Out of Scope — 역할/권한(Role/Permission) 레벨 정합성

- `meeting_plan.md` §7-2가 언급하는 워크스페이스 역할(예: VIEWER)별 회의 중 노드 생성 권한 정합성은 본 SPEC 범위가 아니다(사용자 확정 사항). 본 SPEC은 이 저장소의 다른 보호 라우트(예: `node.controller.ts`)와 동일한 멤버십 체크만 수행한다.
- `node.controller.ts`가 `@Roles` 데코레이터 없이 `JwtAuthGuard`만 확인한다는 점(meeting_plan.md §7 결정 필요 사항 2)에 대한 정책 변경도 다루지 않는다.
- 후속 SPEC 후보로 기록한다(가칭 `SPEC-MEETING-ROLE-001`).

### Out of Scope — 타 저장소 변경

- `AiDeep-AI-BE` 저장소의 헤더 릴레이 구현(SPEC-API-004, `status: draft`)은 본 SPEC의 산출물이 아니다 — 상호 참조만 한다(§7).
- `AiDeep-Agent` 저장소의 마스터 토큰 제거 + 토큰-per-call 전환(SPEC-MEETING-AUTH-001, `status: draft`)은 본 SPEC의 산출물이 아니다.

### Out of Scope — 토큰 내용 검증(AI-BE/Agent 구간)

- `Aideep_backend` 자신은 `JwtAuthGuard`(기존 표준 메커니즘)로 토큰 서명/만료를 정상적으로 검증한다 — 이는 본 SPEC이 새로 추가하는 동작이 아니라 기존 표준 인증 흐름을 그대로 재사용하는 것이다.
- 다만 아웃바운드로 전달하는 시점에는 헤더 값을 재파싱하거나 다시 검증하지 않는다 — 이미 `JwtAuthGuard`가 검증한 원본 문자열을 그대로 실어 보낸다.

### Out of Scope — 마스터 토큰 백도어 변경

- `POST /auth/issue/master`, `issueMasterToken()`, `MASTER_USER_IDS` 화이트리스트 등 기존 dev/test 마스터 토큰 백도어 코드는 본 SPEC이 건드리지 않는다 — 이는 본 SPEC과 무관한 사전 존재 기능이며 그대로 유지된다.

### Out of Scope — 3홉 쓰기 루프 리스크 해소

- `AiDeep-Agent`의 `_mutate()`류 재시도 회피 정책이나 `Aideep_backend → AI-BE → Agent → Aideep_backend`로 이어지는 3홉 HTTP 쓰기 루프 자체의 리스크 완화(`meeting_plan.md` 옵션 B/C가 다루는 영역)는 본 SPEC의 범위가 아니다 — 본 SPEC은 옵션 A(전체 pass-through)만 구현한다.

### Out of Scope — 토큰 만료/갱신 처리

- 청크 처리 도중(예: 장시간 회의 세션) 호출자가 보유한 JWT가 만료되는 경우의 갱신/재로그인 흐름은 본 SPEC이 다루지 않는다 — 각 요청이 그 시점의 유효한 토큰을 싣고 온다는 전제 하에 동작한다.

---

## 4. GEARS 요구사항

델타 마커: 본 SPEC은 최초 작성이므로 모든 요구사항이 `[NEW]`다. GEARS(v3.0.0 이후 정식 표기)로 작성한다.

### 4.1 모듈 A — 신규 엔드포인트/컨트롤러 (`src/meeting/meeting.controller.ts`)

**REQ-MEETING-PROXY-001** `[NEW]` (Ubiquitous)
The system shall expose `POST /meeting/transcript`, guarded at the controller class level by `JwtAuthGuard` and documented with `@ApiBearerAuth('jwt')` — mirroring the existing class-level guard pattern used by `MeetController`, `NodeController`, and `AiController`. No new authentication mechanism shall be introduced.

**REQ-MEETING-PROXY-002** `[NEW]` (Event-driven)
**When** a request without a valid `Authorization: Bearer <token>` header reaches `POST /meeting/transcript`, the system shall reject it with HTTP 401 before any outbound call to `AiDeep-AI-BE` is attempted — this is delegated entirely to the existing `JwtAuthGuard`/`JwtStrategy` behavior; no new rejection logic is implemented by this SPEC.

**REQ-MEETING-PROXY-003** `[NEW]` (Ubiquitous)
The endpoint shall accept a request body shaped identically to `AiDeep-AI-BE`'s `TranscriptChunkRequest` schema (confirmed by reading `AiDeep-AI-BE/app/schemas/meeting.py`): `workspaceId: string` (non-empty), `meetingId: string` (non-empty), `transcriptChunk: string` (non-empty), `timestamp: string` (ISO-8601 datetime). Field names and casing shall match AI-BE's camelCase aliases exactly.

### 4.2 모듈 B — `Authorization` 헤더 릴레이 (`src/meeting/meeting.controller.ts`, `src/meeting/meeting.service.ts`)

**REQ-MEETING-PROXY-004** `[NEW]` (Event-driven)
**When** a request passes `JwtAuthGuard` validation, the system shall extract the raw `Authorization` header string from the inbound request (via `@Headers('authorization')` or equivalent) and thread it — unmodified — into `MeetingService`'s forwarding call.

**REQ-MEETING-PROXY-005** `[NEW]` (Unwanted Behavior)
The system shall NOT re-issue, re-sign, decode, or otherwise transform the `Authorization` header value before forwarding it to `AiDeep-AI-BE` — the exact string received on the inbound request shall appear as the exact string sent on the outbound request.

### 4.3 모듈 C — 워크스페이스 멤버십 확인 (`src/meeting/meeting.service.ts`)

**REQ-MEETING-PROXY-006** `[NEW]` (Event-driven)
**When** a request passes `JwtAuthGuard` validation, the system shall verify — before forwarding to `AiDeep-AI-BE` — that the authenticated user (`req.user.user_id`) is a member of `body.workspaceId`, using the same membership-check mechanism `AiService.checkMembership()` already uses (`WorkspaceRepository.checkWorkspace()`). **When** the user is not a member, the system shall reject the request with HTTP 404 and shall NOT attempt the outbound `AiDeep-AI-BE` call.

**REQ-MEETING-PROXY-007** `[NEW]` (Unwanted Behavior)
The system shall not introduce any workspace-role-level (e.g., VIEWER) authorization logic beyond the existing membership check — role/permission-level differentiation is explicitly out of scope (§3.2).

### 4.4 모듈 D — `AiBeClient` 확장 (`src/ai/ai-be.client.ts`)

**REQ-MEETING-PROXY-008** `[NEW]` (Ubiquitous)
`AiBeClient.post<T>()` shall accept an optional `extraHeaders?: Record<string, string>` parameter. When provided, its entries shall be merged into the outbound `fetch` call's `headers` object (alongside the existing `Content-Type: application/json`). When omitted, the outbound call's headers shall be byte-for-byte identical to the current behavior.

**REQ-MEETING-PROXY-009** `[NEW]` (Ubiquitous)
The existing `/chat` and `/retrieve` call sites in `AiService` (which do not pass `extraHeaders`) shall remain functionally unchanged by this SPEC — this is a regression constraint verified by REQ-MEETING-PROXY-015(e).

### 4.5 모듈 E — 응답/오류 매핑 (`src/meeting/meeting.service.ts`)

**REQ-MEETING-PROXY-010** `[NEW]` (Ubiquitous)
On a successful `AiDeep-AI-BE` response, the system shall return a `TranscriptChunkResponse`-shaped object (`relationType: string`, `nodeId: string`, `parentNodeId: string | null`), matching the exact camelCase fields AI-BE returns per `app/schemas/meeting.py`.

**REQ-MEETING-PROXY-011** `[NEW]` (Event-driven)
**When** the outbound call to `AiDeep-AI-BE` fails — AI-BE returns HTTP 5xx, or the `fetch` call throws (network failure, timeout) — the system shall respond with HTTP 502, reusing the existing `AiBeUnavailableError` class (`src/ai/ai-be.exception.ts`), without exposing AI-BE's raw response body to the caller.

**REQ-MEETING-PROXY-012** `[NEW]` (Event-driven)
**When** `AiDeep-AI-BE` returns HTTP 4xx, the system shall propagate that status code, reusing the existing `AiBeBadRequestError` class — no new exception class shall be introduced for this SPEC's error paths.

**REQ-MEETING-PROXY-013** `[NEW]` (Unwanted Behavior)
The system shall NOT log, echo, or expose the `Authorization` header value (inbound or outbound) in any log line, exception message, or default object string representation.

**REQ-MEETING-PROXY-014** `[NEW]` (Unwanted Behavior)
The system shall not modify `POST /auth/issue/master`, `AuthService.issueMasterToken()`, or the `MASTER_USER_IDS` whitelist mechanism — these remain unchanged, pre-existing, unrelated dev/test functionality.

### 4.6 모듈 F — 테스트 정합성

**REQ-MEETING-PROXY-015** `[NEW]` (Ubiquitous)
The test suite shall verify, at minimum: (a) a request without an `Authorization` header returns HTTP 401 and no outbound `AiDeep-AI-BE` call is attempted; (b) a request from a non-member of `body.workspaceId` returns HTTP 404 and no outbound call is attempted; (c) a valid request's inbound `Authorization` header value appears verbatim in the outbound `fetch` call's headers (mock/spy assertion); (d) an AI-BE 5xx or network-failure response maps to HTTP 502 via `AiBeUnavailableError`; (e) the existing `AiBeClient.post()` call sites for `/chat` and `/retrieve` (which omit `extraHeaders`) remain unaffected — a regression test on `src/ai/ai-be.client.spec.ts`.

---

## 5. 결정 사항

### 결정 1: 신규 모듈 디렉터리는 `src/meeting/` — 기존 `src/meet/`와 분리

- **채택**: `src/meeting/meeting.{module,controller,service}.ts` + `src/meeting/dto/transcriptChunk.dto.ts`를 신설한다.
- **근거**: 기존 `src/meet/`(`MeetModule`, `@Controller('meet')`, `/meet/structure`)는 LLM 기반 회의 자막 → 마크다운/JSON 구조화를 다루는 완전히 다른 기능이다. 본 SPEC은 인증 프록시 + AI-BE 릴레이를 다루므로 이름이 유사하다는 이유만으로 같은 모듈에 억지로 얹지 않는다(Enforce Simplicity — 억지 재사용은 오히려 복잡도를 높인다).

### 결정 2: 라우트는 `POST /meeting/transcript` (workspaceId는 path param이 아니라 body 필드)

- **채택**: `@Controller('meeting')` + `@Post('transcript')` → 상대 경로 `/meeting/transcript`(전역 prefix 적용 시 `/aideep/api/meeting/transcript`).
- **근거**: `AiDeep-AI-BE`/`AiDeep-Agent`와 동일한 상대 경로를 유지해 체인 전체에서 엔드포인트 이름이 일관되게 한다. `workspaceId`는 AI-BE의 `TranscriptChunkRequest` 스키마와 동일하게 body 필드로 유지한다 — `node.controller.ts`/`ai.controller.ts`가 쓰는 `workspace/:workspaceId/...` prefix 스타일은 채택하지 않는다(AI-BE가 기대하는 body 계약과 충돌하지 않도록 하기 위함).

### 결정 3: 신규 HTTP 클라이언트를 만들지 않고 기존 `AiBeClient`를 확장한다

- **채택**: `src/ai/ai-be.client.ts`의 `post<T>()`에 optional `extraHeaders` 파라미터만 추가한다.
- **근거**: 리서치 결과 이 저장소에는 이미 `AiDeep-AI-BE`를 호출하는 fetch 기반 아웃바운드 클라이언트(`AiBeClient`, `AI_BE_URL` env var, `AbortSignal.timeout(15000)`, `AiBeUnavailableError`/`AiBeBadRequestError` 매핑)가 존재하며 `/chat`·`/retrieve`에서 이미 사용 중임을 확인했다. 작업 지시서 원문은 "이 저장소에 아웃바운드 HTTP 패턴이 없을 수 있다"고 가정했으나, 이는 사실이 아니다 — `@nestjs/axios` 등 신규 의존성을 추가할 필요가 없다(Enforce Simplicity 사다리 §2 "기존 헬퍼/패턴이 있으면 재사용").

### 결정 4: 멤버십 체크는 `AiService.checkMembership()`과 동일한 패턴으로 재사용

- **채택**: `WorkspaceRepository.checkWorkspace(userId, workspaceId)`를 호출해 멤버십을 확인하고, 없으면 404를 던진다.
- **근거**: `AiService`가 이미 동일한 패턴을 `/chat`·`/retrieve` 호출 전에 적용하고 있다 — 새로운 역할/권한 로직을 발명하지 않고 기존 표준을 그대로 따른다. `MeetingService`에 private 메서드로 복제할지, `WorkspaceRepository` 쪽에 공유 헬퍼로 승격할지는 `/moai run` 구현 세부사항으로 남긴다(과도한 사전 추상화를 피함 — 실제 2번째 사용처가 생겼을 때 리팩터링해도 늦지 않다).

### 결정 5: 오류 매핑은 신규 예외 클래스를 만들지 않고 `src/ai/ai-be.exception.ts`를 재사용

- **채택**: `AiBeUnavailableError`(502)/`AiBeBadRequestError`(4xx)를 그대로 import해서 사용한다.
- **근거**: 두 엔드포인트 모두 궁극적으로 같은 `AiDeep-AI-BE` 서비스를 호출하며, 오류 의미(AI-BE 사용 불가/AI-BE가 요청 거부)가 동일하다 — `AllExceptionsFilter`가 이미 `BasicError` 서브클래스를 자동으로 상태 코드/JSON 응답으로 매핑하므로 추가 처리 코드가 필요 없다.

---

## 6. 가정

- **필드명/타입은 실제 확인됨(가정 아님)**: `AiDeep-AI-BE/app/schemas/meeting.py`를 직접 읽어 `TranscriptChunkRequest`(`workspaceId`, `meetingId`, `transcriptChunk`, `timestamp`)/`TranscriptChunkResponse`(`relationType`, `nodeId`, `parentNodeId`)의 정확한 camelCase 필드명을 확인했다. 다만 `/moai run` 구현 시점에 AI-BE 측 스키마가 변경되어 있을 가능성에 대비해, 구현 착수 전 해당 파일을 다시 한번 확인하는 것을 권장한다.
- **`Authorization` 헤더의 `Bearer ` 접두어 처리**: 인바운드에서 받은 헤더 문자열을 그대로(접두어 포함/미포함 여부와 무관하게) 아웃바운드로 전달한다는 것이 본 SPEC의 전제다 — 헤더 값을 파싱/재구성하지 않는다. 이는 `AiDeep-Agent`의 SPEC-MEETING-AUTH-001 OQ-A("`Authorization` 헤더의 정확한 스킴 처리")가 미해결로 남긴 지점과 맞닿아 있다 — 체인 전체에서 `Bearer ` 스킴 처리 방식이 일관되는지는 3개 저장소가 모두 구현된 이후 엔드투엔드로 검증이 필요할 수 있다.
- **`timestamp` 필드의 TypeScript 표현**: AI-BE는 Python `datetime`(ISO-8601 문자열을 파싱)을 사용한다. Aideep_backend DTO 쪽에서는 `class-validator`의 ISO-8601 문자열 검증(예: `@IsISO8601()`)으로 받는 것을 기본안으로 하되, 정확한 데코레이터 선택은 `/moai run` 구현 세부사항으로 남긴다.
- **`AiBeClient`의 기존 타임아웃/재시도 정책은 그대로 유지**: 현재 `AiBeClient`에는 재시도 로직이 없다(단일 시도 + `AbortSignal.timeout(15000)`). 본 SPEC은 이 정책을 바꾸지 않는다 — `AiDeep-AI-BE` 쪽(SPEC-API-003/004)의 재시도 정책과는 무관하게, `Aideep_backend`→AI-BE 구간은 기존 동작을 그대로 유지한다.

---

## 7. 외부 의존성 (Coordination Point)

- **`AiDeep-AI-BE` 저장소의 SPEC-API-003(`status: completed`)과 SPEC-API-004(`status: draft`)의 구분**: SPEC-API-003(완료됨)이 `/meeting/transcript` 라우트와 `TranscriptChunkRequest`/`TranscriptChunkResponse` 스키마를 AI-BE 측에 이미 만들어 두었다 — 이 엔드포인트는 지금 당장 호출 가능하다. SPEC-API-004(`status: draft`)는 그 위에 `Authorization` 헤더 릴레이 + presence-guard 계층만 추가한다. 즉 본 SPEC의 구현(`/moai run`)은 SPEC-API-004의 헤더 릴레이 작업이 완료되기 전이라도, SPEC-API-003이 이미 만들어 둔 AI-BE의 살아있는 엔드포인트를 대상으로 통합 테스트를 즉시 수행할 수 있다.
- **`AiDeep-AI-BE` 저장소의 SPEC-API-004(`status: draft`)**: 본 SPEC이 아웃바운드로 호출하는 직접 대상. SPEC-API-004는 `Authorization` 헤더를 검증 없이 그대로 `AiDeep-Agent`로 릴레이하고, 헤더 부재 시 400을 반환하는 non-validating relay를 구현한다. 본 SPEC의 REQ-MEETING-PROXY-004/005가 SPEC-API-004의 REQ-API-005/006(헤더 존재 여부 확인 + 릴레이)이 소비할 헤더의 **출처**가 된다.
- **`AiDeep-Agent` 저장소의 SPEC-MEETING-AUTH-001(`status: draft`)**: 체인의 마지막 홉. 이 SPEC의 마스터 토큰 제거(REQ-MEETING-AUTH-006) 및 토큰-per-call 전환은, 본 SPEC이 실제로 실사용자 JWT를 생산해 체인에 흘려보내는 것을 전제로 한다 — 본 SPEC 없이는 AI-BE/Agent가 릴레이할 실사용자 신원 자체가 존재하지 않는다.
- **본 SPEC은 3-저장소 조율 이니셔티브의 ROOT다**: 다른 두 SPEC은 이미 "Aideep_backend 저장소의 신규 forward-proxy SPEC(계획 중, 아직 SPEC ID 미부여)"라고 프로즈로 언급해 두었다. 본 SPEC 완료(SPEC ID 확정) 이후, `AiDeep-AI-BE`의 SPEC-API-004와 `AiDeep-Agent`의 SPEC-MEETING-AUTH-001 양쪽의 "외부 의존성"/"관련 문서" 섹션에 `SPEC-MEETING-PROXY-001`이라는 실제 ID를 역참조로 채워 넣는 후속 업데이트가 필요하다 — 단, 이는 각 저장소 자신의 manager-spec이 수행할 작업이며 본 SPEC의 산출물이 아니다(scope discipline, 타 저장소 파일 수정 금지).

---

## 8. 비기능 요구사항

- **보안**: 실사용자 JWT가 로그에 노출되지 않아야 한다(REQ-MEETING-PROXY-013). `meeting_plan.md` §3 옵션 A 단점에서 지적된 대로, 마스터 토큰 하나가 새는 것과 매 사용자 토큰이 새는 것은 파급 범위가 다르다 — Winston 로거 호출부에서 `Authorization` 헤더 값을 문자열로 직접 포함하지 않는다.
- **호환성**: 기존 `AiBeClient`의 `/chat`·`/retrieve` 호출부는 동작이 바뀌지 않는다(REQ-MEETING-PROXY-009). 기존 `src/meet/`, `src/node/`, `src/ai/` 등 다른 모듈의 라우트/동작은 본 SPEC으로 인해 변경되지 않는다.
- **일관성**: 신규 컨트롤러/서비스/DTO는 이 저장소의 기존 파일 구조 컨벤션(`<module>.module.ts` + `<module>.controller.ts` + `<module>.service.ts` + `dto/<name>.dto.ts` + `.spec.ts`)을 그대로 따른다. `AiBeClient`의 오류 매핑 정책(5xx/네트워크 실패 → 502, 4xx → 그대로 전파)도 변경 없이 그대로 승계한다.

---

## 9. 영향받는 파일

### Aideep_backend (본 git 저장소)

- `src/meeting/meeting.module.ts` (신규)
- `src/meeting/meeting.controller.ts` (신규)
- `src/meeting/meeting.service.ts` (신규)
- `src/meeting/dto/transcriptChunk.dto.ts` (신규)
- `src/meeting/meeting.controller.spec.ts` (신규)
- `src/meeting/meeting.service.spec.ts` (신규)
- `src/ai/ai-be.client.ts` (수정) — `post<T>()`에 optional `extraHeaders` 파라미터 추가
- `src/ai/ai-be.client.spec.ts` (수정) — `extraHeaders` 전달/미전달 회귀 테스트 추가
- `src/app.module.ts` (수정) — `MeetingModule` 등록

### AiDeep-AI-BE (별도 git 저장소 — 본 SPEC의 범위 밖)

- `app/routes/meeting.py`, `app/services/agent_client.py` — 본 SPEC에서 수정하지 않음(SPEC-API-004가 다룸)

### AiDeep-Agent (별도 git 저장소 — 본 SPEC의 범위 밖)

- `app/routes/meeting.py`, `app/agent/aideep_backend_client.py` 등 — 본 SPEC에서 수정하지 않음(SPEC-MEETING-AUTH-001이 다룸)

---

Version: 0.1.0
Last Updated: 2026-08-08
