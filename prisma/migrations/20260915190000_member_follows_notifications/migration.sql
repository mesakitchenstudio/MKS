-- Phase 8B: Member Follows + in-app Notifications foundation (additive only).
-- Creates UserSeriesFollow, UserCategoryFollow, MemberNotification.
-- Does not alter User/Recipe/Series/Category content columns or backfill rows.

-- CreateTable
CREATE TABLE "UserSeriesFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSeriesFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCategoryFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCategoryFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipeId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "seriesId" TEXT,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "MemberNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSeriesFollow_seriesId_idx" ON "UserSeriesFollow"("seriesId");

-- CreateIndex
CREATE INDEX "UserSeriesFollow_userId_createdAt_idx" ON "UserSeriesFollow"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserSeriesFollow_userId_seriesId_key" ON "UserSeriesFollow"("userId", "seriesId");

-- CreateIndex
CREATE INDEX "UserCategoryFollow_categoryId_idx" ON "UserCategoryFollow"("categoryId");

-- CreateIndex
CREATE INDEX "UserCategoryFollow_userId_createdAt_idx" ON "UserCategoryFollow"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserCategoryFollow_userId_categoryId_key" ON "UserCategoryFollow"("userId", "categoryId");

-- CreateIndex
CREATE INDEX "MemberNotification_userId_createdAt_idx" ON "MemberNotification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberNotification_userId_readAt_createdAt_idx" ON "MemberNotification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "MemberNotification_recipeId_idx" ON "MemberNotification"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberNotification_userId_dedupeKey_key" ON "MemberNotification"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "UserSeriesFollow" ADD CONSTRAINT "UserSeriesFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSeriesFollow" ADD CONSTRAINT "UserSeriesFollow_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCategoryFollow" ADD CONSTRAINT "UserCategoryFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCategoryFollow" ADD CONSTRAINT "UserCategoryFollow_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberNotification" ADD CONSTRAINT "MemberNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberNotification" ADD CONSTRAINT "MemberNotification_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberNotification" ADD CONSTRAINT "MemberNotification_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberNotification" ADD CONSTRAINT "MemberNotification_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
