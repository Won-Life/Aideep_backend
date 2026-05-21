# 작업 계획: upload-refactor

- **날짜:** 2026-05-21
- **담당:** backend-3
- **작업 범위:** src/upload/, prisma/schema.prisma

## 목표
현재 multer 기반 직접 업로드를 S3 Presigned URL 패턴으로 전환한다.
클라이언트가 Presigned URL로 S3에 직접 업로드하고, 완료 후 서버에 메타데이터를 저장한다.

## 작업 항목
- [ ] Prisma `files` 모델 추가 (schema.prisma)
- [ ] `@aws-sdk/s3-request-presigner` 패키지 설치
- [ ] S3Service에 `generatePresignedPutUrl()` 메서드 추가
- [ ] UploadService 신규 생성 (DB 메타데이터 저장)
- [ ] DTO 신규 생성: PresignedRequestDto, ConfirmUploadDto
- [ ] UploadController 재작성 (presigned/confirm 엔드포인트, JWT 인증)
- [ ] UploadModule 업데이트
- [ ] pnpm build 검증

## 영향 범위
- `prisma/schema.prisma` — files 모델 추가 (team-lead 사전 보고 필요)
- `src/upload/s3.service.ts` — presigned URL 메서드 추가
- `src/upload/upload.controller.ts` — 전면 재작성
- `src/upload/upload.module.ts` — 업데이트
- `src/upload/upload.service.ts` — 신규
- `src/upload/dto/presigned-request.dto.ts` — 신규
- `src/upload/dto/confirm-upload.dto.ts` — 신규
- `src/upload/constant/upload.constant.ts` — MIME 타입 제한

## 참고 사항
- MIME 화이트리스트: image/png, image/jpeg, image/webp, application/pdf
- JWT 인증 필수 (JwtAuthGuard)
- PrismaModule은 @Global() 이므로 UploadModule에 import 불필요
- 기존 POST /upload/, POST /upload/many 엔드포인트는 제거
