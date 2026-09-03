-- Additive Phase 2E: guest retention / network scrub support.
-- Nullable IPs; ipUpdatedAt for accurate visitor IP age; lastSeenAt index for inactivity deletes.
-- No mass scrub during migration — daily cron performs lifecycle cleanup.

ALTER TABLE "GuestVisitor" ADD COLUMN IF NOT EXISTS "ipUpdatedAt" DATETIME;
CREATE INDEX IF NOT EXISTS "GuestVisitor_lastSeenAt_idx" ON "GuestVisitor"("lastSeenAt");
CREATE INDEX IF NOT EXISTS "GuestVisitor_ipUpdatedAt_idx" ON "GuestVisitor"("ipUpdatedAt");

-- SQLite cannot ALTER COLUMN nullability cleanly; Prisma db push reconciles ip String? on GuestVisitor / GuestPageView.
-- Existing empty-string IPs remain valid until the retention job scrubs them to NULL.
