/**
 * Phase 5G — final readiness / migration / gate / privacy static audit.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { mealPlanErrorMessage } from "./meal-planner.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(root, "..", "..");

function readRepo(rel: string) {
  return readFileSync(path.join(repo, rel), "utf8");
}

describe("Phase 5G — readiness audit", () => {
  it("migration is additive with required FKs and indexes", () => {
    const sql = readRepo("prisma/migrations/20260914180000_meal_planner_foundation/migration.sql");
    assert.match(sql, /CREATE TABLE "MealPlan"/);
    assert.match(sql, /CREATE TABLE "MealPlanItem"/);
    assert.match(sql, /MealPlan_userId_fkey[\s\S]*ON DELETE CASCADE/);
    assert.match(sql, /MealPlanItem_planId_fkey[\s\S]*ON DELETE CASCADE/);
    assert.match(sql, /MealPlanItem_recipeId_fkey[\s\S]*ON DELETE SET NULL/);
    assert.match(sql, /MealPlan_userId_nameNorm_key/);
    assert.match(sql, /MealPlanItem_planId_planDate_mealSlot_sortOrder_idx/);
    assert.doesNotMatch(sql, /DROP TABLE|ALTER TABLE "Recipe"|DELETE FROM|UPDATE "Recipe"/i);
  });

  it("migration chain order ends with meal planner foundation", () => {
    const migrationsDir = path.join(repo, "prisma", "migrations");
    const names = [
      "20260908000000_baseline_existing_production",
      "20260908001000_roadmap_additive_delta",
      "20260914012000_ingredient_identity_foundation",
      "20260914180000_meal_planner_foundation",
    ];
    for (const name of names) {
      assert.equal(existsSync(path.join(migrationsDir, name, "migration.sql")), true, name);
    }
  });

  it("prepare-production swaps SQLite datasource only", () => {
    const prep = readRepo("prisma/prepare-production.mjs");
    assert.match(prep, /provider = "sqlite"/);
    assert.match(prep, /provider\s+= "postgresql"/);
    assert.match(prep, /schema\.production\.prisma/);
  });

  it("ownership helpers never accept client userId; shopping prepare is owned", () => {
    const actions = readRepo("src/app/profile/meal-plan-actions.ts");
    const server = readRepo("src/lib/meal-planner-server.ts");
    const shop = readRepo("src/lib/meal-planner-shopping-server.ts");
    assert.doesNotMatch(actions, /userId:\s*input\.userId|body\.userId/);
    assert.match(actions, /findActiveMemberByEmail/);
    assert.match(actions, /prepareMealPlanShoppingAction/);
    assert.match(server, /where: \{ id: planId, userId \}/);
    assert.match(server, /plan: \{ userId \}/);
    assert.match(shop, /getMealPlanForUser\(userId, planId\)/);
    assert.match(shop, /listMealPlanItemsForUser\(userId, planId/);
    assert.match(shop, /no localStorage/);
    assert.doesNotMatch(shop, /window\.localStorage|saveShoppingListState/);
  });

  it("auth/feature action messages use mealPlanErrorMessage", () => {
    const actions = readRepo("src/app/profile/meal-plan-actions.ts");
    assert.match(actions, /mealPlanErrorMessage\("FEATURE_DISABLED"\)/);
    assert.match(actions, /mealPlanErrorMessage\("NOT_AUTHENTICATED"\)/);
    assert.doesNotMatch(actions, /Sign in to manage meal plans\./);
    assert.equal(mealPlanErrorMessage("NOT_AUTHENTICATED").includes("Profile"), true);
  });

  it("planner notes are guarded from Shopping and analytics hooks", () => {
    const shop = readRepo("src/lib/meal-planner-shopping-server.ts");
    const client = readRepo("src/lib/meal-planner-shopping-client.ts");
    const view = readRepo("src/components/MealPlannerView.tsx");
    assert.match(shop, /shoppingContributionsLeakPlannerNote/);
    assert.doesNotMatch(client, /\.note|plannerNotes|origin:\s*["']meal_planner/);
    assert.match(view, /Planning note/);
    assert.doesNotMatch(view, /trackEvent|meal_plan_/);
  });

  it("atomic shopping commit performs a single save", () => {
    const client = readRepo("src/lib/meal-planner-shopping-client.ts");
    assert.match(client, /applyMealPlanShoppingBatchCandidate/);
    assert.match(client, /saveShoppingListState\(applied\.state\)/);
    assert.match(client, /Nothing was changed/);
  });

  it("README documents Meal Planner gate and staged rollout", () => {
    const readme = readRepo("README.md");
    assert.match(readme, /MEAL_PLANNER_ENABLED=true/);
    assert.match(readme, /20260914180000_meal_planner_foundation/);
    assert.match(readme, /no auto-sync|snapshot-based/i);
    assert.match(readme, /There is no `NEXT_PUBLIC_MEAL_PLANNER/);
  });
});
