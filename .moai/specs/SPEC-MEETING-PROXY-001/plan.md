---
id: SPEC-MEETING-PROXY-001
title: "`/meeting/transcript` 신규 forward-proxy 엔드포인트 — 구현 계획"
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

# SPEC-MEETING-PROXY-001: 구현 계획 (plan.md)

## §A Context

- **작업 위치**: `/Users/chs/dev/AiDeep/Aideep_backend` (절대 경로 — 이 저장소 전용 작업, 다른 저장소를 건드리지 않는다)
- **현재 브랜치**: `develop` (HEAD `d66742e`, 확인 시점 2026-08-08). `git status --porcelain`은 미추적 `.moai/`만 표시(본 SPEC 산출물).
- **SPEC 산출물 경로**: `.moai/specs/SPEC-MEETING-PROXY-001/{spec,plan,acceptance,progress}.md`
- **plan-auditor 검증**: 미실행(plan-phase 최초 작성 직후) — `/moai run` 진입 전 Phase 1 Plan Audit Gate에서 자동 실행됨.
- **기존 인프라(PRESERVE 대상)**: `src/ai/ai-be.client.ts`(`AiBeClient`), `src/ai/ai-be.exception.ts`(`AiBeUnavailableError`/`AiBeBadRequestError`), `src/auth/guards/jwt.guard.ts`(`JwtAuthGuard`), `src/workspace/workspace.repository.ts`(`checkWorkspace`), `src/common/error/http-exception.filter.ts`(`AllExceptionsFilter`) — 모두 그대로 재사용, 수정은 `ai-be.client.ts`(확장만) 한정.
- **EXTEND 대상**: `src/ai/ai-be.client.ts`(post 시그니처에 optional 파라미터 추가), `src/app.module.ts`(신규 모듈 import 배열에 추가).

## §B Known Issues (NestJS/TypeScript 컨텍스트 필터링)

Go 중심 표준 12개 카테고리(B1-B12) 중 이 TypeScript/NestJS 저장소에 실제 적용되는 항목만 선별했다.

1. **DTO 필드명 불일치 리스크**: AI-BE의 `TranscriptChunkRequest`/`TranscriptChunkResponse`는 camelCase 별칭을 쓴다(spec.md §6 확인 완료). DTO 작성 시 `class-validator` 데코레이터의 필드명이 정확히 일치하는지 재확인할 것 — 오탈자 하나가 조용한 직렬화 실패로 이어질 수 있다.
2. **`AiBeClient` 시그니처 변경의 파급 범위**: `post<T>()`에 파라미터를 추가하면 기존 `/chat`·`/retrieve` 호출부(`ai.service.ts`)와 기존 테스트(`ai-be.client.spec.ts`)에 영향이 갈 수 있다 — optional 파라미터로 추가해 하위 호환을 유지하고, 반드시 기존 테스트가 그대로 통과하는지 확인한다(REQ-MEETING-PROXY-009).
3. **`AllExceptionsFilter` 의존성**: `BasicError` 서브클래스를 **throw**해야 필터가 처리한다 — 서비스 레이어에서 이를 return하면 안 된다(기존 `AiBeClient.post()`가 이미 이 규약을 따르므로, 새 서비스 코드도 그대로 `await this.aiBeClient.post(...)`를 호출하고 에러 처리를 위임하면 자동으로 규약을 지키게 된다).
4. **전역 prefix**: `main.ts`의 `app.setGlobalPrefix('aideep/api', ...)`로 인해 실제 라우트는 `/aideep/api/meeting/transcript`다. e2e/통합 테스트를 작성할 경우 이 prefix를 고려한다(단위 테스트 수준(controller.spec.ts)에서는 영향 없음).
5. **frontmatter 스키마 준수**: `created`/`updated`/`tags`(snake_case 별칭 금지) — 본 SPEC 산출물 4파일 모두 확인 완료.
6. **spec-lint heading convention**: `### Out of Scope — <topic>` H3 서브섹션 형태 준수 — spec.md §3.2에서 확인 완료.
7. **작업 범위 준수(PRESERVE)**: `src/meet/`(무관한 기존 모듈), `src/node/`, `src/edge/`, `src/auth/`(가드 자체는 재사용하되 auth 모듈 내부 로직은 수정하지 않음), `/auth/issue/master` 관련 코드는 절대 건드리지 않는다.
8. **AskUserQuestion 금지**: 구현 중 결정이 필요한 지점을 만나면(예: `extraHeaders`의 정확한 병합 순서, 멤버십 체크 메서드의 위치) 구조화된 blocker report로 반환한다 — 자유 형식 질문 금지.
9. **커밋/푸시**: 이 저장소의 Hybrid Trunk 정책에 따라 manager-develop이 직접 커밋+푸시를 수행하는 것을 원칙으로 하되, 실제 브랜치 전략(direct-to-`develop` 여부)은 이 저장소의 기존 워크플로 관례를 따른다 — `--no-verify` 금지, Conventional Commits 형식 사용.

## §C Pre-flight Check List

`/moai run` 착수 전 manager-develop이 실행할 검증:

```bash
# 1. 브랜치/베이스라인 확인
git branch --show-current
git rev-parse HEAD

# 2. 빌드 가능 여부 확인 (기존 상태 베이스라인)
npm run build 2>&1 | tail -20

# 3. 린트 베이스라인 측정 (NEW vs 기존 이슈 구분용)
npm run lint 2>&1 | tail -20

# 4. AiBeClient의 모든 기존 호출부 열거 (수정 시 회귀 대상 확인)
grep -rn "aiBeClient\.\|AiBeClient" src --include="*.ts" | grep -v ".spec.ts"

# 5. src/meeting/ 미존재 확인 (신규 디렉터리임을 재확인)
ls src/meeting 2>&1 || echo "confirmed: src/meeting does not exist yet"

# 6. app.module.ts의 현재 imports 배열 확인 (등록 위치 파악)
grep -n "imports:" -A 20 src/app.module.ts
```

## §D Constraints (DO NOT VIOLATE)

- PRESERVE 목록: `src/meet/`, `src/node/`, `src/edge/`, `src/auth/`(가드는 import해서 쓰되 내부 로직 수정 금지), `POST /auth/issue/master` 관련 전체 코드 경로.
- 신규 의존성 추가 금지: `@nestjs/axios`, `axios` 등 — 기존 `fetch` 기반 `AiBeClient` 패턴을 그대로 확장한다(spec.md §5 결정 3).
- `AiBeClient.post()`의 기존 시그니처를 깨는 변경 금지 — 반드시 optional 파라미터로 추가해 하위 호환을 유지한다.
- 신규 예외 클래스 생성 금지 — `src/ai/ai-be.exception.ts`의 `AiBeUnavailableError`/`AiBeBadRequestError`를 재사용한다(spec.md §5 결정 5).
- 역할/권한(role) 판단 로직 신규 도입 금지 — 멤버십 체크(존재 여부)만 수행한다(REQ-MEETING-PROXY-007).
- `--no-verify` 커밋 금지, force-push 금지.
- `AskUserQuestion` 호출 금지(서브에이전트) — blocker report로 반환.

## §E Self-Verification Deliverables

manager-develop 완료 보고 시 다음을 포함한다(각 항목은 `verification-claim-integrity.md` §3의 5-섹션 형식 — Claim/Evidence/Baseline-attribution/Gaps/Residual-risk — 로 보고):

1. **AC PASS/FAIL 매트릭스** — `acceptance.md`의 각 시나리오에 대해 실행한 테스트 명령 + 실제 출력.
2. **빌드 결과**: `npm run build` exit code + 출력.
3. **린트 결과**: `npm run lint` exit code + NEW 이슈와 기존 baseline 이슈 구분.
4. **테스트 결과**: `npm run test -- meeting` (또는 동등한 타겟 실행) + `npm run test -- ai-be.client`(회귀) exit code + 출력.
5. **`AskUserQuestion`/`mcp__askuser` 부재 확인**: `grep -rn "AskUserQuestion" src/meeting` → 매치 없음 예상.
6. **`Authorization` 헤더 비노출 확인**: `grep -rn "console.log\|logger\." src/meeting | grep -i "authorization"` → 매치 없음 예상.
7. **브랜치/푸시 상태**: 신규 커밋 SHA 목록 + `git push` 결과.
8. **Blocker report(있는 경우)**: 위임 프롬프트가 명시하지 않은 사용자 결정이 필요했던 지점.

## §F Milestones (decision-reversibility 순 — 변경 가능성이 높은 결정을 앞에)

### M1 — 요청/응답 DTO 정의 (데이터 계약 — 가장 변경 가능성이 높은 결정)

- `src/meeting/dto/transcriptChunk.dto.ts` 신설: `TranscriptChunkBody`(workspaceId/meetingId/transcriptChunk/timestamp, class-validator 데코레이터) + `TranscriptChunkResponseDto`(relationType/nodeId/parentNodeId).
- AI-BE의 실제 스키마(`app/schemas/meeting.py`)를 다시 한번 대조해 필드명/nullable 여부를 확정한다(spec.md §6 가정 참고).
- `createNode.dto.ts`/`chat.dto.ts`의 기존 `@ApiProperty` + class-validator 데코레이터 스타일을 그대로 따른다.

### M2 — 컨트롤러 라우트/가드 설계 (API 표면 — 사용자/호출자에게 보이는 계약)

- `src/meeting/meeting.controller.ts` 신설: `@Controller('meeting')` + `@UseGuards(JwtAuthGuard)` + `@ApiBearerAuth('jwt')`(클래스 레벨, `meet.controller.ts` 패턴 그대로).
- `@Post('transcript')` 핸들러: `@Headers('authorization') authorization: string`, `@Body() body: TranscriptChunkBody`, `@Request() req: any`(req.user.user_id 추출용).
- 핸들러는 `MeetingService`를 호출하고 결과를 그대로 반환한다(비즈니스 로직은 서비스로 위임).

### M3 — `AiBeClient` 확장 (기반 의존성 변경)

- `src/ai/ai-be.client.ts`의 `post<T>(path, payload, extraHeaders?: Record<string, string>)`로 시그니처 확장.
- `fetch()` 호출의 `headers` 객체에 `{ 'Content-Type': 'application/json', ...extraHeaders }`로 병합.
- 기존 `/chat`·`/retrieve` 호출부(`ai.service.ts`)는 코드 변경 없이 그대로 유지(3번째 인자 생략).

### M4 — `MeetingService` 구현 (비즈니스 로직: 멤버십 확인 + 헤더 릴레이 + 응답/오류 매핑)

- `src/meeting/meeting.service.ts` 신설: `WorkspaceRepository` + `AiBeClient`를 주입.
- `forwardTranscriptChunk(userId, authorization, body)`: (1) `checkWorkspace(userId, body.workspaceId)`로 멤버십 확인, 없으면 `NotFoundException` — `AiService.checkMembership()`과 동일 패턴. (2) `this.aiBeClient.post<TranscriptChunkResponseDto>('/meeting/transcript', { workspaceId, meetingId, transcriptChunk, timestamp }, { Authorization: authorization })` 호출. (3) 결과를 그대로 반환(에러는 `AiBeClient`가 이미 `AiBeUnavailableError`/`AiBeBadRequestError`로 throw하므로 별도 처리 불필요).

### M5 — 모듈 등록 (기계적 배선)

- `src/meeting/meeting.module.ts` 신설: `controllers: [MeetingController]`, `providers: [MeetingService, AiBeClient, WorkspaceRepository]`(또는 `AiModule`/`WorkspaceModule`을 import해 재사용 — `AiModule`의 기존 `providers` 배열 구성을 참고해 결정).
- `src/app.module.ts`의 `imports` 배열에 `MeetingModule` 추가.

### M6 — 테스트 + 회귀 검증 (검증 — 마지막)

- `src/meeting/meeting.controller.spec.ts`: 가드 통과/미통과, 헤더 추출 검증.
- `src/meeting/meeting.service.spec.ts`: 멤버십 체크 실패(404), 헤더 릴레이 검증(mock `AiBeClient`), 502/4xx 매핑 검증.
- `src/ai/ai-be.client.spec.ts`: `extraHeaders` 전달 시 병합 검증 + 기존 3개 테스트(정상 응답/네트워크 오류/5xx/4xx)가 `extraHeaders` 미전달 상태에서 그대로 통과하는지 회귀 확인.
- `npm run build` + `npm run lint` 최종 재확인.

## §G Anti-Patterns (피해야 할 패턴)

- `AiBeClient.post()`의 기존 2-파라미터 호출부를 전부 3-파라미터로 강제 변경하는 것 — optional 파라미터로 충분하며, 불필요한 광범위 diff를 만들지 않는다.
- 멤버십 체크를 건너뛰고 곧바로 AI-BE에 릴레이하는 것 — REQ-MEETING-PROXY-006 위반.
- `src/meet/` 디렉터리에 새 라우트를 얹는 것 — 이름이 비슷하다는 이유로 무관한 기능에 병합하지 않는다(spec.md §5 결정 1).
- `Authorization` 헤더 값을 파싱해서 `Bearer ` 접두어를 제거/추가하는 로직을 임의로 추가하는 것 — REQ-MEETING-PROXY-005 위반(파싱 없이 그대로 전달).
- 역할(role) 기반 조건 분기를 추가하는 것 — REQ-MEETING-PROXY-007/§3.2 위반.
- `console.log`나 로거 호출에 `authorization` 헤더 값이나 `body` 전체를 그대로 덤프하는 것 — REQ-MEETING-PROXY-013 위반.

## §H Cross-References

- `spec.md` — 본 계획이 구현하는 요구사항(REQ-MEETING-PROXY-001~015) 및 결정 사항(§5).
- `acceptance.md` — Given-When-Then 시나리오 및 Definition of Done.
- `AiDeep-AI-BE/.moai/specs/SPEC-API-004/spec.md` — 이 SPEC의 아웃바운드 호출 대상(헤더 릴레이 계약).
- `AiDeep-Agent/.moai/specs/SPEC-MEETING-AUTH-001/spec.md` — 체인의 최종 소비자(토큰-per-call 전환).
- `/Users/chs/dev/AiDeep/meeting_plan.md` — 3안(A/B/C) 비교 검토 보고서, 채택 설계(옵션 A) 근거.
- `src/ai/ai-be.client.ts`, `src/ai/ai.service.ts` — 재사용/확장 대상 기존 코드.

---

Version: 0.1.0
Last Updated: 2026-08-08
