-- Phase 5A: Meal Planner domain foundation (additive only).
-- Creates MealPlan + MealPlanItem. Does not alter Recipe.values or existing member data.

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "recipeId" TEXT,
    "recipeSlug" TEXT NOT NULL,
    "recipeTitle" TEXT NOT NULL,
    "planDate" TEXT NOT NULL,
    "mealSlot" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "plannedServings" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealPlan_userId_updatedAt_idx" ON "MealPlan"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_userId_nameNorm_key" ON "MealPlan"("userId", "nameNorm");

-- CreateIndex
CREATE INDEX "MealPlanItem_planId_planDate_mealSlot_sortOrder_idx" ON "MealPlanItem"("planId", "planDate", "mealSlot", "sortOrder");

-- CreateIndex
CREATE INDEX "MealPlanItem_recipeId_idx" ON "MealPlanItem"("recipeId");

-- CreateIndex
CREATE INDEX "MealPlanItem_planId_recipeId_idx" ON "MealPlanItem"("planId", "recipeId");

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanItem" ADD CONSTRAINT "MealPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanItem" ADD CONSTRAINT "MealPlanItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
