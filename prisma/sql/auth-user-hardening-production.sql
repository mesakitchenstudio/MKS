-- Auth user hardening (feat/auth-ux-polish @ 0ce1f38+)
-- Equivalent PostgreSQL operations for Neon production.
--
-- This repository deploys schema with `prisma db push` during Vercel build
-- (see package.json `build` and README "Production database"). There is no
-- prisma/migrations history; this file is the audited SQL reference.
--
-- Safe properties:
-- - Existing User.notify values are NOT rewritten (only column DEFAULT changes).
-- - Existing rows receive sessionVersion = 0 via ADD COLUMN ... DEFAULT 0.
-- - No table drop/recreate on PostgreSQL (non-destructive ALTER).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ALTER COLUMN "notify" SET DEFAULT false;
