/**
 * Phase 5A — Meal Planner domain + Prisma foundation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { clampRecipeServings } from "./culinary-format.ts";
import {
  MEAL_PLAN_DATE_HORIZON_DAYS,
  MEAL_PLAN_DEFAULT_NAME,
  MEAL_PLAN_MAX_ITEMS,
  MEAL_PLAN_MAX_ITEMS_PER_DATE,
  MEAL_PLAN_MAX_PLANS,
  MEAL_PLAN_NAME_MAX_LENGTH,
  MEAL_PLAN_NOTE_MAX_LENGTH,
  MEAL_PLAN_SERVINGS_MAX,
  MEAL_PLAN_SERVINGS_MIN,
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  clampMealPlanServings,
  daysBetweenCivilDates,
  isMealPlannerEnabled,
  isMealSlot,
  normalizeMealPlanName,
  normalizeMealPlanNameKey,
  normalizeMealPlanNote,
  normalizeMealPlanServings,
  normalizeMealPlanSortOrder,
  parseCivilDateParts,
  validateMealPlanDate,
  validateMealPlanDateHorizon,
  validateMealPlanName,
  validateMealPlanNote,
  validateMealPlanServings,
  validateMealPlanSortOrder,
  validateMealSlot,
} from "./meal-planner.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(relFromRepo: string) {
  return readFileSync(path.join(root, "..", "..", relFromRepo), "utf8");
}

const schema = readRepo("prisma/schema.prisma");
const migration = readRepo("prisma/migrations/20260914180000_meal_planner_foundation/migration.sql");

describe("Phase 5A plan name", () => {
  it("trims and collapses whitespace", () => {
    assert.equal(normalizeMealPlanName("  My   Plan  "), "My Plan");
  });

  it("normalized uniqueness form is case/spacing insensitive", () => {
    assert.equal(normalizeMealPlanNameKey("  My Meal Plan "), "my meal plan");
    assert.equal(normalizeMealPlanNameKey("MY MEAL PLAN"), "my meal plan");
  });

  it("rejects blank and >80", () => {
    assert.equal(validateMealPlanName("   ").ok, false);
    assert.equal(validateMealPlanName("").ok, false);
    assert.equal(validateMealPlanName("a".repeat(MEAL_PLAN_NAME_MAX_LENGTH + 1)).ok, false);
  });

  it("accepts default first-plan name", () => {
    const result = validateMealPlanName(MEAL_PLAN_DEFAULT_NAME);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.name, "My Meal Plan");
      assert.equal(result.nameNorm, "my meal plan");
    }
  });

  it("accepts exactly 80 characters", () => {
    const name = "a".repeat(MEAL_PLAN_NAME_MAX_LENGTH);
    const result = validateMealPlanName(name);
    assert.equal(result.ok, true);
  });
});

describe("Phase 5A meal slots", () => {
  it("accepts MVP slots only", () => {
    for (const slot of MEAL_SLOTS) {
      assert.equal(isMealSlot(slot), true);
      const result = validateMealSlot(slot);
      assert.equal(result.ok, true);
    }
  });

  it("rejects arbitrary values", () => {
    assert.equal(isMealSlot("brunch"), false);
    assert.equal(isMealSlot("other"), false);
    assert.equal(validateMealSlot("brunch").ok, false);
    assert.equal(validateMealSlot("").ok, false);
  });

  it("canonical order is stable", () => {
    assert.deepEqual([...MEAL_SLOTS], ["breakfast", "lunch", "dinner", "snack"]);
    assert.equal(MEAL_SLOT_LABELS.breakfast, "Breakfast");
    assert.equal(MEAL_SLOT_LABELS.lunch, "Lunch");
    assert.equal(MEAL_SLOT_LABELS.dinner, "Dinner");
    assert.equal(MEAL_SLOT_LABELS.snack, "Snack");
  });
});

describe("Phase 5A planned servings", () => {
  it("accepts lower and upper bounds", () => {
    assert.equal(validateMealPlanServings(MEAL_PLAN_SERVINGS_MIN).ok, true);
    assert.equal(validateMealPlanServings(MEAL_PLAN_SERVINGS_MAX).ok, true);
  });

  it("rejects invalid values", () => {
    assert.equal(validateMealPlanServings(0).ok, false);
    assert.equal(validateMealPlanServings(100).ok, false);
    assert.equal(validateMealPlanServings(1.5).ok, false);
    assert.equal(validateMealPlanServings(NaN).ok, false);
    assert.equal(validateMealPlanServings("abc").ok, false);
  });

  it("clamp behavior matches culinary-format", () => {
    assert.equal(clampMealPlanServings(0), clampRecipeServings(0));
    assert.equal(clampMealPlanServings(150), clampRecipeServings(150));
    assert.equal(clampMealPlanServings(4.4), clampRecipeServings(4.4));
    assert.equal(normalizeMealPlanServings("12"), 12);
  });
});

describe("Phase 5A notes", () => {
  it("absent / empty / whitespace → undefined", () => {
    assert.equal(normalizeMealPlanNote(undefined), undefined);
    assert.equal(normalizeMealPlanNote(null), undefined);
    assert.equal(normalizeMealPlanNote(""), undefined);
    assert.equal(normalizeMealPlanNote("   "), undefined);
    assert.equal(validateMealPlanNote(undefined).ok, true);
    assert.equal(validateMealPlanNote("   ").ok, true);
    const empty = validateMealPlanNote("   ");
    assert.equal(empty.ok, true);
    if (empty.ok) assert.equal(empty.note, undefined);
  });

  it("trims and accepts 200; rejects >200", () => {
    const ok = validateMealPlanNote("  fridge leftover  ");
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.note, "fridge leftover");

    const exact = "n".repeat(MEAL_PLAN_NOTE_MAX_LENGTH);
    assert.equal(validateMealPlanNote(exact).ok, true);
    assert.equal(validateMealPlanNote(exact + "!").ok, false);
  });
});

describe("Phase 5A civil dates + horizon", () => {
  it("strict YYYY-MM-DD", () => {
    assert.equal(validateMealPlanDate("2026-09-14").ok, true);
    assert.equal(validateMealPlanDate("09/14/2026").ok, false);
    assert.equal(validateMealPlanDate("2026-9-4").ok, false);
    assert.equal(validateMealPlanDate("2026-09-4").ok, false);
    assert.equal(parseCivilDateParts("2026-09-14")?.iso, "2026-09-14");
  });

  it("valid and invalid leap / impossible dates", () => {
    assert.equal(validateMealPlanDate("2024-02-29").ok, true);
    assert.equal(validateMealPlanDate("2026-02-29").ok, false);
    assert.equal(validateMealPlanDate("2026-02-30").ok, false);
    assert.equal(validateMealPlanDate("2026-13-01").ok, false);
  });

  it("horizon boundaries relative to explicit today", () => {
    const today = "2026-09-14";
    const lower = "2025-09-13"; // 366 days before
    const upper = "2027-09-15"; // 366 days after
    const tooLow = "2025-09-12";
    const tooHigh = "2027-09-16";

    assert.equal(daysBetweenCivilDates(today, lower), MEAL_PLAN_DATE_HORIZON_DAYS);
    assert.equal(daysBetweenCivilDates(today, upper), MEAL_PLAN_DATE_HORIZON_DAYS);
    assert.equal(validateMealPlanDateHorizon(lower, today).ok, true);
    assert.equal(validateMealPlanDateHorizon(upper, today).ok, true);
    assert.equal(validateMealPlanDateHorizon(tooLow, today).ok, false);
    assert.equal(validateMealPlanDateHorizon(tooHigh, today).ok, false);
    assert.equal(validateMealPlanDateHorizon(today, today).ok, true);
  });
});

describe("Phase 5A sort order", () => {
  it("normalizes safely and validates non-negative integers", () => {
    assert.equal(normalizeMealPlanSortOrder(-3), 0);
    assert.equal(normalizeMealPlanSortOrder(2.9), 2);
    assert.equal(normalizeMealPlanSortOrder("5"), 5);
    assert.equal(normalizeMealPlanSortOrder(NaN), 0);
    assert.equal(validateMealPlanSortOrder(0).ok, true);
    assert.equal(validateMealPlanSortOrder(-1).ok, false);
    assert.equal(validateMealPlanSortOrder(1.5).ok, false);
  });
});

describe("Phase 5A limits + gate", () => {
  it("exposes centralized limits", () => {
    assert.equal(MEAL_PLAN_MAX_PLANS, 20);
    assert.equal(MEAL_PLAN_MAX_ITEMS, 400);
    assert.equal(MEAL_PLAN_MAX_ITEMS_PER_DATE, 20);
    assert.equal(MEAL_PLAN_NAME_MAX_LENGTH, 80);
    assert.equal(MEAL_PLAN_NOTE_MAX_LENGTH, 200);
    assert.equal(MEAL_PLAN_DATE_HORIZON_DAYS, 366);
    assert.equal(MEAL_PLAN_DEFAULT_NAME, "My Meal Plan");
  });

  it("feature gate defaults off unless explicitly true", () => {
    const prevA = process.env.MEAL_PLANNER_ENABLED;
    const prevB = process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED;
    try {
      delete process.env.MEAL_PLANNER_ENABLED;
      delete process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED;
      assert.equal(isMealPlannerEnabled(), false);
      process.env.MEAL_PLANNER_ENABLED = "true";
      assert.equal(isMealPlannerEnabled(), true);
      delete process.env.MEAL_PLANNER_ENABLED;
      process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED = "true";
      assert.equal(isMealPlannerEnabled(), true);
      process.env.MEAL_PLANNER_ENABLED = "false";
      delete process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED;
      assert.equal(isMealPlannerEnabled(), false);
    } finally {
      if (prevA === undefined) delete process.env.MEAL_PLANNER_ENABLED;
      else process.env.MEAL_PLANNER_ENABLED = prevA;
      if (prevB === undefined) delete process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED;
      else process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED = prevB;
    }
  });
});

describe("Phase 5A Prisma schema + migration contracts", () => {
  it("defines MealPlan ownership on User with cascade", () => {
    assert.match(schema, /model MealPlan \{/);
    assert.match(schema, /mealPlans\s+MealPlan\[\]/);
    assert.match(
      schema,
      /user\s+User\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/,
    );
    assert.match(schema, /@@unique\(\[userId, nameNorm\]\)/);
    assert.match(schema, /@@index\(\[userId, updatedAt\]\)/);
  });

  it("defines MealPlanItem with Recipe SetNull and plan Cascade", () => {
    assert.match(schema, /model MealPlanItem \{/);
    assert.match(schema, /mealPlanItems\s+MealPlanItem\[\]/);
    assert.match(
      schema,
      /plan\s+MealPlan\s+@relation\(fields: \[planId\], references: \[id\], onDelete: Cascade\)/,
    );
    assert.match(
      schema,
      /recipe\s+Recipe\?\s+@relation\(fields: \[recipeId\], references: \[id\], onDelete: SetNull\)/,
    );
    assert.match(schema, /recipeId\s+String\?/);
    assert.match(schema, /recipeSlug\s+String/);
    assert.match(schema, /recipeTitle\s+String/);
    assert.match(schema, /planDate\s+String/);
    assert.match(schema, /mealSlot\s+String/);
    assert.match(schema, /sortOrder\s+Int/);
    assert.match(schema, /plannedServings\s+Int/);
    assert.match(schema, /note\s+String\?/);
    assert.match(schema, /@@index\(\[planId, planDate, mealSlot, sortOrder\]\)/);
    assert.match(schema, /@@index\(\[recipeId\]\)/);
    assert.match(schema, /@@index\(\[planId, recipeId\]\)/);
    assert.doesNotMatch(schema, /@@unique\(\[planId, planDate, mealSlot, recipeId\]\)/);
  });

  it("does not add public sharing / freeform fields", () => {
    assert.doesNotMatch(schema, /sharingToken/);
    assert.doesNotMatch(schema, /freeformTitle/);
    assert.doesNotMatch(schema, /model MealPlan \{[\s\S]*?publicSlug/);
    assert.doesNotMatch(schema, /model MealPlan \{[\s\S]*?visibility/);
  });

  it("migration is additive with correct delete behavior", () => {
    assert.match(migration, /CREATE TABLE "MealPlan"/);
    assert.match(migration, /CREATE TABLE "MealPlanItem"/);
    assert.match(migration, /MealPlan_userId_fkey[\s\S]*ON DELETE CASCADE/);
    assert.match(migration, /MealPlanItem_planId_fkey[\s\S]*ON DELETE CASCADE/);
    assert.match(migration, /MealPlanItem_recipeId_fkey[\s\S]*ON DELETE SET NULL/);
    assert.match(migration, /MealPlan_userId_nameNorm_key/);
    assert.match(migration, /MealPlan_userId_updatedAt_idx/);
    assert.match(migration, /MealPlanItem_planId_planDate_mealSlot_sortOrder_idx/);
    assert.match(migration, /MealPlanItem_recipeId_idx/);
    assert.match(migration, /MealPlanItem_planId_recipeId_idx/);
    assert.doesNotMatch(migration, /DROP TABLE/i);
    assert.doesNotMatch(migration, /ALTER TABLE "Recipe"/);
    assert.doesNotMatch(migration, /ALTER TABLE "User"/);
    assert.doesNotMatch(migration, /UPDATE\s+"/i);
    assert.doesNotMatch(migration, /INSERT INTO/i);
  });
});
