---
id: SPEC-MEETING-PROXY-001
title: "`/meeting/transcript` 신규 forward-proxy 엔드포인트 — 인수 기준"
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

# SPEC-MEETING-PROXY-001: 인수 기준 (acceptance.md)

## §A 개요

본 문서는 `spec.md`의 REQ-MEETING-PROXY-001~015에 대응하는 Given-When-Then 시나리오, 엣지 케이스, 품질 게이트 기준, Definition of Done을 정의한다.

## §B Given-When-Then 시나리오

### AC-MEETING-PROXY-001 — 인증 헤더 부재 시 401 + 아웃바운드 호출 없음

- **Given** `POST /meeting/transcript`에 `Authorization` 헤더가 없는 요청이 도착한다
- **When** 요청이 `JwtAuthGuard`를 통과 시도한다
- **Then** 시스템은 HTTP 401을 반환하고, `AiBeClient.post()`(및 그 내부의 `fetch`)는 단 한 번도 호출되지 않는다(mock spy 카운트 0으로 검증)
- **REQ 매핑**: REQ-MEETING-PROXY-002, REQ-MEETING-PROXY-015(a)

### AC-MEETING-PROXY-002 — 유효한 인증이지만 워크스페이스 비멤버인 경우 404 + 아웃바운드 호출 없음

- **Given** 유효한 JWT를 가진 사용자가 `POST /meeting/transcript`를 호출하지만, `body.workspaceId`의 멤버가 아니다
- **When** 요청이 `JwtAuthGuard`를 통과한 뒤 `MeetingService`가 `checkWorkspace()`를 호출한다
- **Then** 시스템은 HTTP 404를 반환하고, `AiBeClient.post()`는 호출되지 않는다
- **REQ 매핑**: REQ-MEETING-PROXY-006, REQ-MEETING-PROXY-015(b)

### AC-MEETING-PROXY-003 — 유효한 요청의 `Authorization` 헤더가 아웃바운드 호출에 그대로 실린다

- **Given** 유효한 JWT를 가진 워크스페이스 멤버가 `Authorization: Bearer <token-value>` 헤더로 유효한 body를 담아 요청한다
- **When** `MeetingService.forwardTranscriptChunk()`가 `AiBeClient.post()`를 호출한다
- **Then** mock된 `fetch`(또는 `AiBeClient.post` spy)에 전달된 `headers`에 정확히 `Authorization: Bearer <token-value>`(입력값과 문자 그대로 동일)가 포함되어 있다
- **REQ 매핑**: REQ-MEETING-PROXY-004, REQ-MEETING-PROXY-005, REQ-MEETING-PROXY-015(c)

### AC-MEETING-PROXY-004 — 정상 응답이 `TranscriptChunkResponse` 형태로 반환된다

- **Given** AI-BE가 `{ relationType: "CHILD", nodeId: "node-1", parentNodeId: "node-0" }`로 응답한다(mock)
- **When** `POST /meeting/transcript`가 성공적으로 처리된다
- **Then** 클라이언트가 받는 응답 body는 정확히 `{ relationType: "CHILD", nodeId: "node-1", parentNodeId: "node-0" }` 형태(camelCase, 필드명 일치)다
- **REQ 매핑**: REQ-MEETING-PROXY-010

### AC-MEETING-PROXY-005 — AI-BE 5xx/네트워크 실패가 502로 매핑된다

- **Given** AI-BE 호출이 5xx를 반환하거나(mock) `fetch`가 네트워크 오류로 reject된다
- **When** `MeetingService.forwardTranscriptChunk()`가 이 오류를 받는다
- **Then** 클라이언트는 HTTP 502를 받고, 응답 body에 AI-BE의 원본 응답 본문이 노출되지 않는다(`AiBeUnavailableError` 재사용 확인)
- **REQ 매핑**: REQ-MEETING-PROXY-011, REQ-MEETING-PROXY-015(d)

### AC-MEETING-PROXY-006 — AI-BE 4xx가 그대로 전파된다

- **Given** AI-BE가 422를 반환한다(mock, 예: body 검증 실패)
- **When** `MeetingService.forwardTranscriptChunk()`가 이 오류를 받는다
- **Then** 클라이언트는 해당 4xx 상태 코드(`AiBeBadRequestError` 재사용)를 받는다
- **REQ 매핑**: REQ-MEETING-PROXY-012

### AC-MEETING-PROXY-007 — 기존 `AiBeClient` 호출부 회귀 없음

- **Given** `AiService.chat()`/`AiService.retrieve()`가 여전히 `this.aiBeClient.post(path, payload)`를 2개 인자로 호출한다(3번째 `extraHeaders` 인자 생략)
- **When** `ai-be.client.spec.ts`의 기존 4개 테스트(정상 응답/네트워크 오류/5xx/4xx)를 재실행한다
- **Then** 4개 테스트 모두 코드 수정 없이 그대로 통과한다 — 아웃바운드 `fetch` 호출의 `headers`가 `{ 'Content-Type': 'application/json' }`만 포함하고 변경되지 않는다
- **REQ 매핑**: REQ-MEETING-PROXY-008, REQ-MEETING-PROXY-009, REQ-MEETING-PROXY-015(e)

### AC-MEETING-PROXY-008 — 요청 DTO 필드명/casing/비어있지 않음 검증

- **Given** 유효한 JWT와 워크스페이스 멤버십을 가진 사용자가 `POST /meeting/transcript`를 호출하되, body의 `workspaceId`/`meetingId`/`transcriptChunk` 중 하나가 빈 문자열이거나, AI-BE의 `TranscriptChunkRequest`(`workspaceId`/`meetingId`/`transcriptChunk`/`timestamp`, camelCase)와 다른 필드명/casing을 사용한다
- **When** NestJS `ValidationPipe`가 DTO의 `class-validator` 데코레이터로 body를 검증한다
- **Then** 시스템은 검증 오류(422 또는 이 저장소의 기존 검증 실패 응답 형식)를 반환하고 `AiBeClient.post()`는 호출되지 않는다 — 반대로 필드명·casing이 정확히 일치하고 모든 필드가 비어있지 않은 유효한 요청은 검증을 통과해 다음 단계(멤버십 확인)로 진행된다
- **REQ 매핑**: REQ-MEETING-PROXY-003

## §C 엣지 케이스

- **`Authorization` 헤더가 빈 문자열인 경우**: `JwtAuthGuard`(passport-jwt)가 토큰 파싱에 실패해 401을 반환하는 기존 동작에 위임한다 — 본 SPEC이 별도의 "빈 문자열" 특수 처리를 추가하지 않는다(SPEC-API-004처럼 별도 400 가드를 도입하지 않음 — `Aideep_backend`는 이미 `JwtAuthGuard`라는 강한 검증 계층을 갖고 있으므로 AI-BE 수준의 "헤더 부재만 확인하는 최소 가드"가 필요하지 않다).
- **`workspaceId`/`meetingId`가 안전 패턴을 위반하는 경우**: DTO의 class-validator 데코레이터가 NestJS 표준 `ValidationPipe`를 통해 422(또는 이 저장소의 기존 검증 실패 응답 형식)를 반환한다 — AI-BE의 안전 패턴(`^[A-Za-z0-9_-]+$`)과 동일한 제약을 두는 것을 권장하되, 정확한 검증 규칙은 `/moai run` 구현 세부사항이다.
- **AI-BE 응답이 예상 필드를 누락한 경우**: `AiBeClient.post<T>()`는 JSON을 그대로 파싱해 반환하므로, 필드 누락 시 `undefined`가 그대로 전달된다 — 이는 기존 `AiBeClient` 계약과 동일한 동작이며 본 SPEC이 새로 방어 로직을 추가하지 않는다(AI-BE 측 계약 위반은 AI-BE의 SPEC-API-004/003 책임 영역).
- **동시 다중 요청(같은 사용자, 같은 회의)**: 본 SPEC은 순수 pass-through이므로 세션 상태를 유지하지 않는다 — 동시성 처리는 AI-BE/Agent 측 책임이며 본 SPEC의 범위가 아니다.

## §D Definition of Done

- [ ] `src/meeting/` 모듈(controller/service/module/dto) 신설, `MeetingModule`이 `app.module.ts`에 등록됨
- [ ] `AiBeClient.post()`가 optional `extraHeaders` 파라미터를 지원하며, 기존 `/chat`·`/retrieve` 호출부는 코드 변경 없음
- [ ] AC-MEETING-PROXY-001~008 전부 자동화 테스트로 검증되고 PASS
- [ ] `npm run build` exit 0
- [ ] `npm run lint` — 본 SPEC이 도입한 NEW 이슈 0건(기존 baseline 이슈는 별도)
- [ ] `grep -rn "AskUserQuestion" src/meeting` → 매치 없음
- [ ] `grep -rn "console.log\|logger\." src/meeting`에서 `authorization` 헤더 값을 직접 로깅하는 코드 없음(수동 코드 리뷰로 확인)
- [ ] `/auth/issue/master`, `issueMasterToken()`, `MASTER_USER_IDS` 관련 코드가 변경되지 않았음(git diff로 확인) — REQ-MEETING-PROXY-014
- [ ] `MeetingService`/`MeetingController`에 워크스페이스 멤버십 확인(§3.1 c) 외의 역할(role)/권한 레벨 기반 분기 로직이 도입되지 않았음(코드 리뷰로 확인) — REQ-MEETING-PROXY-007
- [ ] `src/meet/`, `src/node/`, `src/edge/` 등 기존 모듈에 변경 없음(git diff로 확인)

## §E 품질 게이트

- **테스트**: `npm run test -- meeting`(신규 controller/service 테스트) + `npm run test -- ai-be.client`(회귀) 모두 PASS.
- **커버리지**: 신규 파일(`src/meeting/*.ts`, `.spec.ts` 제외)에 대해 이 저장소의 기존 커버리지 기준(TRUST 5 Tested 원칙, 85%+ 권장)을 적용한다 — 정확한 임계값은 이 저장소의 `package.json`/CI 설정을 따른다.
- **빌드**: `npm run build` exit 0.
- **린트**: `npm run lint` — 본 SPEC이 도입한 NEW 위반 0건.
- **보안**: `Authorization` 헤더 비노출(코드 리뷰 + grep) — REQ-MEETING-PROXY-013.

---

Version: 0.1.0
Last Updated: 2026-08-08
