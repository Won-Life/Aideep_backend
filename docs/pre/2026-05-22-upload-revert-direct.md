# 작업 계획: upload-revert-direct

- **날짜:** 2026-05-22
- **담당:** backend-3 (CEO 재발주)
- **작업 범위:** `.worktrees/issue-31` — `src/upload/**`, `prisma/schema.prisma` 일부, `package.json`

## TL;DR

사용자 피드백으로 업로드 패턴을 Presigned URL에서 **백엔드 서버 경유 직접 업로드(multer)** 로 되돌린다. 인증·MIME 제한·files DB 저장은 유지.

## 목표

- `POST /upload/presigned`, `POST /upload/confirm` 2단계 패턴을 제거하고 `POST /upload/`(단일), `POST /upload/many`(다중) multer 업로드로 재구현.
- 클라이언트가 NestJS 서버로 직접 파일을 보내면 서버가 S3 PutObject → DB 저장 → 응답 URL 반환의 단일 호출로 처리.
- 기존 backend-3 보강 사항(JWT 인증, MIME 화이트리스트 jpg/png/webp/pdf, files DB 영속화)은 새 흐름에도 그대로 적용.

## 작업 항목

- [ ] `src/upload/dto/presigned-request.dto.ts` 삭제
- [ ] `src/upload/dto/confirm-upload.dto.ts` 삭제 (또는 직접 업로드 응답 DTO로 재활용)
- [ ] `src/upload/s3.service.ts` — `generatePresignedPutUrl`, `getPublicUrlByKey` 등 presigned 헬퍼 제거. `putObject(buffer, key, mime)` 형태 메서드만 유지/추가
- [ ] `src/upload/upload.controller.ts` 전면 재작성 — `@UseInterceptors(FileInterceptor / FilesInterceptor)` + `@UseGuards(JwtAuthGuard)` + MIME 화이트리스트 검증
- [ ] `src/upload/upload.service.ts` — 업로드 후 files DB insert 로직만 남기고 confirm 흐름 제거
- [ ] `src/upload/upload.module.ts` — Multer 모듈/메모리 스토리지 등록 (있으면 그대로)
- [ ] `src/upload/constant/upload.constant.ts` — `PRESIGNED_URL_EXPIRES_IN` 제거, MIME 화이트리스트 상수 유지
- [ ] `package.json` — `@aws-sdk/s3-request-presigner` 제거 (multer 패키지는 main에 이미 있을 것)
- [ ] `prisma/schema.prisma` — files 모델은 **유지** (단방향 UUID 컬럼, A안 그대로)
- [ ] `pnpm build` clean 확인
- [ ] 절대 `git commit`/`git push` 금지, `npx prisma migrate dev` 금지

## 영향 범위 (수정/추가 예상)

| 파일 | 변경 |
|------|------|
| `src/upload/upload.controller.ts` | 재작성 — multer 기반 POST /upload/, POST /upload/many |
| `src/upload/upload.service.ts` | 단일 호출에서 putObject + DB insert |
| `src/upload/s3.service.ts` | presigned 함수 제거, putObject 보강 |
| `src/upload/upload.module.ts` | Multer 메모리 스토리지 등록 (필요 시) |
| `src/upload/constant/upload.constant.ts` | presigned 상수만 제거 |
| `src/upload/dto/presigned-request.dto.ts` | **삭제** |
| `src/upload/dto/confirm-upload.dto.ts` | **삭제** |
| `prisma/schema.prisma` | 변경 없음 (files 모델 유지) |
| `package.json` | `@aws-sdk/s3-request-presigner` 제거 |

## 참고 사항

- main 브랜치(=원래 upload 구현)의 multer 패턴을 참고. 단, 인증 없는 main 동작으로 되돌리지 말 것 — JWT/MIME 화이트리스트/files DB 저장은 유지.
- 워크스페이스 ID와 owner_user_id를 어떻게 받을지: multipart form-data의 일반 필드로 받거나 query/body DTO로 받음. main 패턴 + backend-3 추가분의 절충점 잡기.
- 클라이언트 API 시그니처 변화:
  - 이전(이번 revert 대상): `POST /upload/presigned` → S3 PUT → `POST /upload/confirm`
  - 이후(이 작업): `POST /upload/` multipart, 단일 호출로 끝.
- files DB의 file_url 컬럼은 S3 public URL을 그대로 저장.

## 회의 트리거 정책

| Trigger | 적용 | 비고 |
|---|---|---|
| T1 stage transition | **없음** | 단일 워커 — 회의 단계 skip (CEO SKILL §3.5) |
| T2 on-demand | 있음 | 사용자 요청 시 mini-meeting |
| T3 conflict-driven | 있음 | backend-3 ↔ CEO 상충 시 |

- max-rounds: N/A (단일 워커)
- 플래그: `--workers=backend-3` 자동 스코핑 (issue-31 영역 단독)

## 차단 요소

없음.
