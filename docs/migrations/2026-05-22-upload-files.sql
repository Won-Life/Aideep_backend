-- =====================================================================
-- Migration: upload-files (FK + soft delete + updated_at)
-- Date: 2026-05-22
-- Target: PostgreSQL
-- Idempotent: 같은 SQL을 여러 번 실행해도 안전.
--
-- 적용 시나리오
-- (A) files 테이블이 아직 DB에 없는 환경 → CREATE TABLE 부분이 실행됨
-- (B) files 테이블이 기본 컬럼만 가진 환경(직전 사이클 db push 잔여) → ADD COLUMN/FK 부분만 실행됨
--
-- 적용 방법
--   psql "$DATABASE_URL" -f docs/migrations/2026-05-22-upload-files.sql
-- 또는 prisma 환경:
--   pnpm exec prisma db execute --file docs/migrations/2026-05-22-upload-files.sql --schema prisma/schema.prisma
-- =====================================================================

BEGIN;

-- 1) 테이블 생성 (없을 때만)
CREATE TABLE IF NOT EXISTS "files" (
    "file_id"       UUID            NOT NULL DEFAULT gen_random_uuid(),
    "file_url"      VARCHAR(2048)   NOT NULL,
    "s3_key"        VARCHAR(1024)   NOT NULL,
    "mime_type"     VARCHAR(100)    NOT NULL,
    "size"          INTEGER         NOT NULL,
    "owner_user_id" UUID            NOT NULL,
    "workspace_id"  UUID            NOT NULL,
    "created_at"    TIMESTAMPTZ(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"    TIMESTAMPTZ(6),
    CONSTRAINT "files_pkey" PRIMARY KEY ("file_id")
);

-- 2) 기존 테이블에 누락된 컬럼 보강 (직전 사이클에서 db push가 부분 적용됐을 경우 대비)
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(6);

-- 3) 인덱스
CREATE INDEX IF NOT EXISTS "idx_files_owner"     ON "files" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "idx_files_workspace" ON "files" ("workspace_id");

-- 4) 외래키 (PG는 ADD CONSTRAINT IF NOT EXISTS 미지원 → DO 블록으로 처리)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'files_owner_user_id_fkey'
    ) THEN
        ALTER TABLE "files"
            ADD CONSTRAINT "files_owner_user_id_fkey"
            FOREIGN KEY ("owner_user_id") REFERENCES "users" ("user_id")
            ON DELETE RESTRICT ON UPDATE NO ACTION;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'files_workspace_id_fkey'
    ) THEN
        ALTER TABLE "files"
            ADD CONSTRAINT "files_workspace_id_fkey"
            FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("workspace_id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;

COMMIT;

-- =====================================================================
-- 롤백 SQL (필요 시 별도 실행)
-- =====================================================================
-- BEGIN;
-- ALTER TABLE "files" DROP CONSTRAINT IF EXISTS "files_workspace_id_fkey";
-- ALTER TABLE "files" DROP CONSTRAINT IF EXISTS "files_owner_user_id_fkey";
-- ALTER TABLE "files" DROP COLUMN IF EXISTS "deleted_at";
-- ALTER TABLE "files" DROP COLUMN IF EXISTS "updated_at";
-- DROP INDEX IF EXISTS "idx_files_workspace";
-- DROP INDEX IF EXISTS "idx_files_owner";
-- -- 주의: 테이블 자체를 만든 마이그레이션이 본 파일이라면 다음 줄 활성화
-- -- DROP TABLE IF EXISTS "files";
-- COMMIT;
