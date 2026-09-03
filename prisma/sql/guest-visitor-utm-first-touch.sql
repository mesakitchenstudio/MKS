-- Additive Phase 2C: first-touch UTM attribution on GuestVisitor.
-- Nullable columns only; no backfill. Safe for existing rows.
-- Applied via `prisma db push` from schema.prisma (dev) / schema.production.prisma (prod).

ALTER TABLE "GuestVisitor" ADD COLUMN IF NOT EXISTS "utmSource" TEXT;
ALTER TABLE "GuestVisitor" ADD COLUMN IF NOT EXISTS "utmMedium" TEXT;
ALTER TABLE "GuestVisitor" ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT;
