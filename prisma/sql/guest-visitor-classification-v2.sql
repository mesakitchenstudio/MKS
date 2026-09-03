-- Additive Phase 2D: persisted audience classification on GuestVisitor.
-- Nullable only; no blocking backfill. Historical rows fall back to UA classifier at read time.

ALTER TABLE "GuestVisitor" ADD COLUMN IF NOT EXISTS "clientKind" TEXT;
ALTER TABLE "GuestVisitor" ADD COLUMN IF NOT EXISTS "clientKindReasons" TEXT;
ALTER TABLE "GuestVisitor" ADD COLUMN IF NOT EXISTS "clientKindAt" DATETIME;
