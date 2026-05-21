# 작업 완료: upload-refactor

- **날짜:** 2026-05-21
- **담당:** backend-3

## 변경 요약
multer 기반 직접 업로드를 S3 Presigned URL 패턴으로 전환하고, 업로드 완료 후 메타데이터를 DB에 저장하는 구조로 리팩터링

## 추가/수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `prisma/schema.prisma` | `files` 모델 추가 (users, workspaces 관계 포함) |
| `src/upload/constant/upload.constant.ts` | MIME 화이트리스트를 jpg/png/webp/pdf로 제한, `PRESIGNED_URL_EXPIRES_IN` 추가 |
| `src/upload/s3.service.ts` | `generatePresignedPutUrl()`, `getPublicUrlByKey()`, `mimeToExtension()` 추가 |
| `src/upload/upload.service.ts` | 신규 — DB 메타데이터 저장 (confirmUpload) |
| `src/upload/upload.controller.ts` | 전면 재작성 — POST /upload/presigned, POST /upload/confirm, JWT 인증 |
| `src/upload/upload.module.ts` | UploadService 추가 |
| `src/upload/dto/presigned-request.dto.ts` | 신규 — PresignedRequestDto, PresignedResponseDto |
| `src/upload/dto/confirm-upload.dto.ts` | 신규 — ConfirmUploadDto, ConfirmUploadResponseDto |

## PR 설명

### 배경
기존 `/upload`, `/upload/many` 엔드포인트는 multer로 서버를 통해 파일을 직접 S3에 업로드했다.
이는 서버 메모리/대역폭 낭비이며, 인증도 없었다. 이슈 #31에서 Presigned URL 패턴으로 전환하도록 요구.

### 변경 내용
1. **Presigned URL 패턴 도입**
   - `POST /upload/presigned`: JWT 인증 후 S3 Presigned PUT URL(5분 유효) + s3Key 발급
   - `POST /upload/confirm`: 클라이언트가 S3 업로드 완료 후 메타데이터(file_url, s3_key, mime, size, owner_user_id, workspace_id)를 DB에 저장

2. **MIME 화이트리스트 제한**: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`

3. **Prisma `files` 모델**: 파일 메타데이터 영속화

4. **패키지**: `@aws-sdk/s3-request-presigner@3.1009.0` 추가 (client-s3 버전과 통일)

### 테스트
- `pnpm run build` → 에러 없음 (exit code 0)
- TypeScript 컴파일 clean
- prisma generate 정상

### ⚠️ Breaking Change

기존 엔드포인트가 **완전 제거**됩니다. 클라이언트 변경 필수.

| 제거된 엔드포인트 | 대체 |
|---|---|
| `POST /upload/` (multer 단일 업로드) | 아래 2단계 패턴으로 대체 |
| `POST /upload/many` (multer 다중 업로드) | 아래 2단계 패턴으로 대체 |

**마이그레이션 가이드 (클라이언트):**
1. `POST /upload/presigned` → `{ presignedUrl, s3Key }` 수신
2. 클라이언트가 `presignedUrl`로 `PUT` 요청하여 S3에 직접 업로드
3. `POST /upload/confirm` → `{ s3Key, mimeType, size, workspaceId }` 전송 → `{ fileId, fileUrl, ... }` 수신

### 주의사항 / 후속 작업
- `npx prisma migrate dev` 실행 필요 (files 테이블 생성) — 머지 후 통합 마이그레이션 필요
- `files` 모델은 `owner_user_id`, `workspace_id`를 단순 UUID 컬럼으로 저장 (Prisma @relation 미선언). backend-1의 users 모델 변경과 충돌 방지를 위한 의도적 단방향 설계. **머지 시 backend-1의 users 컬럼 변경(oauth_provider/oauth_id/password nullable)과 통합 필요.**
- 후속: 머지 완료 후 `users`/`workspaces` 모델에 `files files[]` 역참조 추가 + `@relation` 선언 통합
- S3 버킷에 CORS 정책 추가 필요 (클라이언트 직접 업로드를 위해)
