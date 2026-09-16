-- Phase 9B: Recipe Q&A persistence foundation (additive only).
-- Creates RecipeQuestion; adds nullable MemberNotification.recipeQuestionId for 9E.
-- Does not alter Recipe/User content columns, backfill rows, or generate notifications.

-- CreateTable
CREATE TABLE "RecipeQuestion" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "userId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "answerBody" TEXT,
    "answeredAt" TIMESTAMP(3),
    "answeredByAdminId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeQuestion_recipeId_status_answeredAt_idx" ON "RecipeQuestion"("recipeId", "status", "answeredAt");

-- CreateIndex
CREATE INDEX "RecipeQuestion_status_createdAt_idx" ON "RecipeQuestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RecipeQuestion_userId_createdAt_idx" ON "RecipeQuestion"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "RecipeQuestion" ADD CONSTRAINT "RecipeQuestion_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeQuestion" ADD CONSTRAINT "RecipeQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeQuestion" ADD CONSTRAINT "RecipeQuestion_answeredByAdminId_fkey" FOREIGN KEY ("answeredByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "MemberNotification" ADD COLUMN "recipeQuestionId" TEXT;

-- CreateIndex
CREATE INDEX "MemberNotification_recipeQuestionId_idx" ON "MemberNotification"("recipeQuestionId");

-- AddForeignKey
ALTER TABLE "MemberNotification" ADD CONSTRAINT "MemberNotification_recipeQuestionId_fkey" FOREIGN KEY ("recipeQuestionId") REFERENCES "RecipeQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
