-- Phase 12C: Newsletter campaign foundation (additive only).
-- Creates NewsletterCampaign for editorial campaign content + lifecycle metadata.
-- Does not alter NewsletterSubscriber, User, Recipe, follows, or consent.

-- CreateTable
CREATE TABLE "NewsletterCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "content" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sendStartedAt" TIMESTAMP(3),

    CONSTRAINT "NewsletterCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsletterCampaign_status_updatedAt_idx" ON "NewsletterCampaign"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "NewsletterCampaign_createdAt_idx" ON "NewsletterCampaign"("createdAt");
