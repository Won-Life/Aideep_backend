# 작업 계획: upload-multi-review

- **날짜:** 2026-05-22
- **담당:** CEO (멀티에이전트 오케스트레이션) + 5 워커 (nfr, security, qa, dba, customer)
- **작업 범위:** `src/upload/**`, `prisma/schema.prisma`(files 모델), 관련 호출 표면

## TL;DR

직전 두 사이클(presigned → multer revert)을 거친 `src/upload` 모듈을 다섯 페르소나가 병렬 리뷰한다. 코드 작성은 없고 발견 사항·권고 우선순위만 산출한다.

## 목표

- S3 직접 업로드(POST /upload, POST /upload/many) 흐름의 정확성·보안·확장성·DB 정합성·사용자 시나리오를 다섯 관점에서 점검.
- 합의된 결함을 우선순위별(P0/P1/P2)로 분류한 리뷰 보고서를 docs/pr에 산출.
- 후속 코드 작업 방향(어느 파일을 어떻게 고칠지)을 명시해 다음 사이클이 곧장 실행 가능하도록.

## 작업 항목

- [ ] 다섯 워커가 각자 영역 1차 보고
  - [ ] nfr: 코드 품질 4축(확장성·유지보수성·성능·보안 위생) + SOLID·관측성
  - [ ] security: OWASP 관점, S3 IAM·MIME·파일 검증·URL 노출·메모리 압박
  - [ ] qa: 단위·통합·E2E 테스트 부재 확인, 회귀 시나리오 매트릭스
  - [ ] dba: files 모델 FK·인덱스·정합성·소프트 삭제·고아 row
  - [ ] customer: 업로드 실패·재시도·UX dead-end·에러 메시지·CS 시나리오
- [ ] CEO Round 1 broadcast → 잔여 쟁점 식별
- [ ] 필요 시 Round 2 rebuttal (max-rounds=3)
- [ ] 합의된 결함 P0/P1/P2 분류
- [ ] docs/pr 보고서 생성

## 영향 범위 (리뷰 대상, read-only)

- `src/upload/s3.service.ts`
- `src/upload/upload.controller.ts`
- `src/upload/upload.service.ts`
- `src/upload/upload.module.ts`
- `src/upload/constant/upload.constant.ts`
- `src/upload/dto/upload-response.dto.ts`
- `prisma/schema.prisma` (files 모델)

## 회의 트리거 정책

| Trigger | 적용 | 비고 |
|---|---|---|
| T1 stage transition | **있음** | exec→verify 진입 직전 합의 회의 |
| T2 on-demand | 있음 | 사용자 요청 시 |
| T3 conflict-driven | 있음 | 워커 간 결론 충돌 시 mini-meeting |

- max-rounds: 3 (default)
- 플래그: `--workers=nfr,security,qa,dba,customer` 자동 스코핑

## 차단 요소

없음. 코드 변경 없는 read-only 리뷰.

## 참고 사항

- 직전 사이클 보고서: `docs/pr/2026-05-22-upload-revert-direct.md`
- 현재 브랜치: `refactor/31`
- 변경된 표면이 multer 단일 호출 패턴으로 정착된 상태
