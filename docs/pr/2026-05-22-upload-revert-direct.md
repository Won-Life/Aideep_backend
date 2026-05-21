# 작업 완료: upload-revert-direct

- **날짜:** 2026-05-22
- **담당:** backend-3

## 변경 요약

직전 사이클의 S3 Presigned 2단계 업로드 패턴을 폐기하고, 백엔드 서버 경유 multer 단일 호출 방식으로 재구현했습니다. JWT 인증·MIME 화이트리스트·files DB 저장은 그대로 유지됩니다.

## 추가/수정/삭제된 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/upload/upload.controller.ts` | 재작성 — `POST /upload/` (FileInterceptor) + `POST /upload/many` (FilesInterceptor, max 10), JWT Guard, MIME 검증 |
| `src/upload/upload.service.ts` | 재작성 — `uploadOne()`, `uploadMany()`: S3 putObject → files DB insert → UploadResponseDto 반환 |
| `src/upload/s3.service.ts` | `generatePresignedPutUrl`, `getPublicUrlByKey`, `mimeToExtension` private 헬퍼 제거; `getPublicUrl` public으로 정리; `getSignedUrl` import 제거 |
| `src/upload/upload.module.ts` | `MulterModule.register({ storage: memoryStorage() })` 추가 |
| `src/upload/constant/upload.constant.ts` | `PRESIGNED_URL_EXPIRES_IN` 상수 제거, MIME 화이트리스트 유지 |
| `src/upload/dto/upload-response.dto.ts` | 신규 — `UploadResponseDto` (fileId, fileUrl, mimeType, size, originalName, createdAt) |
| `src/upload/dto/presigned-request.dto.ts` | 삭제 |
| `src/upload/dto/confirm-upload.dto.ts` | 삭제 |
| `package.json` | `@aws-sdk/s3-request-presigner` 의존성 제거 |

## PR 설명

### 배경

직전 사이클(backend-3)에서 클라이언트가 S3에 직접 업로드하는 Presigned PUT URL 2단계 패턴(`POST /upload/presigned` → 클라이언트 S3 PUT → `POST /upload/confirm`)을 구현했으나, 사용자 결정으로 백엔드 서버가 파일을 직접 수신·전달하는 단일 호출 방식으로 재구현하기로 결정했습니다.

### 변경 내용

- **엔드포인트 변경**
  - 제거: `POST /upload/presigned`, `POST /upload/confirm`
  - 추가: `POST /upload/` (단일 파일), `POST /upload/many` (다중 파일, 최대 10개)
- **업로드 흐름**: 클라이언트 multipart 전송 → NestJS 메모리 버퍼 수신 → S3 PutObjectCommand → files 테이블 insert → 단일 응답
- **보안 보강 유지**: `@UseGuards(JwtAuthGuard)`, MIME 화이트리스트(image/jpeg, image/png, image/webp, application/pdf), 10MB 파일 크기 제한
- **DB 저장 유지**: `files` 테이블에 owner_user_id, workspace_id, s3_key, file_url, mime_type, size 저장

### 테스트

- `pnpm install --no-frozen-lockfile` — `@aws-sdk/s3-request-presigner` 제거 확인
- `npx prisma generate` — Prisma Client 재생성 성공
- `pnpm run build` — exit 0 (컴파일 오류 없음)

### 주의사항 / 후속 작업

**Breaking Change**: 직전 사이클에서 Presigned 2단계 패턴에 맞춰 통합 중이던 클라이언트(프론트엔드)는 엔드포인트를 다시 변경해야 합니다.

| 항목 | 이전 (Presigned) | 현재 (Direct) |
|------|-----------------|--------------|
| 단일 업로드 | `POST /upload/presigned` → S3 PUT → `POST /upload/confirm` | `POST /upload/` (multipart/form-data) |
| 다중 업로드 | 개별 presigned × N → confirm × N | `POST /upload/many` (multipart/form-data, files[]) |
| workspaceId 전달 | confirm body에 포함 | multipart body 필드로 전달 |

**환경 변수**: 기존 AWS 환경 변수 그대로 사용 (`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`). 추가/제거 없음.

**DB 영향**: `prisma/schema.prisma`의 `files` 모델 변경 없음. 마이그레이션 불필요.
