/**
 * Phase 5E — Server preparation for Meal Planner → Shopping List.
 * Read-only w.r.t. Shopping (no DB shopping tables; no localStorage).
 */

import { getDb } from "@/lib/db";
import { toPublicRecipe, type DbRecipeRecord } from "@/lib/recipe-map";
import { buildRecipeShoppingContributions } from "@/lib/shopping-list";
import {
  aggregateMealPlanItemsByRecipeId,
  findMealPlanShoppingServingsOverflow,
  mealPlanShoppingErrorMessage,
  resolveMealPlanShoppingDateRange,
  shoppingContributionsLeakPlannerNote,
  type MealPlanShoppingError,
  type MealPlanShoppingPrepareData,
  type MealPlanShoppingPrepareInput,
  type MealPlanShoppingPrepareResult,
  type MealPlanShoppingPreparedRecipe,
} from "@/lib/meal-planner-shopping";
import { getMealPlanForUser, listMealPlanItemsForUser } from "@/lib/meal-planner-server";

function fail(
  error: MealPlanShoppingError,
  message?: string,
): MealPlanShoppingPrepareResult {
  return {
    ok: false,
    error,
    message: message || mealPlanShoppingErrorMessage(error),
  };
}

export async function prepareMealPlanShoppingForUser(
  userId: string,
  input: MealPlanShoppingPrepareInput,
): Promise<MealPlanShoppingPrepareResult> {
  if (!userId) return fail("NOT_AUTHENTICATED");

  const planId = String(input.planId ?? "").trim();
  if (!planId) return fail("PLAN_NOT_FOUND");

  const range = resolveMealPlanShoppingDateRange(input);
  if (!range.ok) return range;

  const plan = await getMealPlanForUser(userId, planId);
  if (!plan) return fail("PLAN_NOT_FOUND");

  const listed = await listMealPlanItemsForUser(userId, planId, {
    fromDate: range.fromDate,
    toDate: range.toDate,
  });
  if (!listed.ok) return fail(listed.error, listed.message);

  const items = listed.data.items;
  if (items.length === 0) {
    return fail("EMPTY_SELECTION", "No meals planned for that selection.");
  }

  const unavailable = items.filter(
    (item) => item.recipeAvailability !== "available" || !item.recipeId,
  );
  const available = items.filter(
    (item) => item.recipeAvailability === "available" && item.recipeId,
  );

  if (available.length === 0) {
    return fail(
      "EMPTY_SELECTION",
      unavailable.length === 1
        ? "That meal is unavailable and was not added to Shopping List."
        : "Those meals are unavailable and were not added to Shopping List.",
    );
  }

  const aggregates = aggregateMealPlanItemsByRecipeId(
    available.map((item) => ({
      recipeId: item.recipeId,
      plannedServings: item.plannedServings,
    })),
  );

  const overflow = findMealPlanShoppingServingsOverflow(aggregates);
  if (overflow) {
    const title =
      available.find((item) => item.recipeId === overflow.recipeId)?.recipeTitle || "This recipe";
    return fail(
      "SERVINGS_OVERFLOW",
      `This ${input.scope === "week" ? "week" : "day"}'s planned servings for ${title} exceed the Shopping List scaling limit (${overflow.plannedServings}).`,
    );
  }

  const recipeIds = aggregates.map((row) => row.recipeId);
  const db = getDb();
  const rows = await db.recipe.findMany({
    where: { id: { in: recipeIds }, status: "published" },
    include: {
      categories: { include: { category: true } },
      type: { include: { fields: true } },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, toPublicRecipe(row as DbRecipeRecord)]));

  const prepared: MealPlanShoppingPreparedRecipe[] = [];
  let skippedUnavailable = unavailable.length;

  for (const aggregate of aggregates) {
    const recipe = byId.get(aggregate.recipeId);
    if (!recipe?.id) {
      skippedUnavailable += aggregate.occurrenceCount;
      continue;
    }

    const contributions = buildRecipeShoppingContributions({
      recipe,
      selectedServings: aggregate.plannedServings,
      sourceMode: "RECIPE",
    });

    if (contributions.length === 0) {
      skippedUnavailable += aggregate.occurrenceCount;
      continue;
    }

    // Guard: selectedServings must match aggregate (no silent clamp).
    if (contributions[0]!.servings !== aggregate.plannedServings) {
      return fail(
        "SERVINGS_OVERFLOW",
        `This ${input.scope === "week" ? "week" : "day"}'s planned servings for ${recipe.title} exceed the Shopping List scaling limit.`,
      );
    }

    prepared.push({
      recipeId: recipe.id,
      recipeSlug: recipe.slug,
      recipeTitle: recipe.title,
      selectedServings: aggregate.plannedServings,
      contributions,
    });
  }

  if (prepared.length === 0) {
    return fail(
      "EMPTY_SELECTION",
      "No available recipes could be added to Shopping List for that selection.",
    );
  }

  const allContributions = prepared.flatMap((row) => row.contributions);
  const plannerNotes = items.map((item) => item.note);
  if (shoppingContributionsLeakPlannerNote(allContributions, plannerNotes)) {
    return fail("FEATURE_DISABLED", "Could not prepare Shopping List items. Please try again.");
  }

  const data: MealPlanShoppingPrepareData = {
    scope: input.scope,
    planId,
    fromDate: range.fromDate,
    toDate: range.toDate,
    mealCount: items.length,
    uniqueRecipeCount: prepared.length,
    totalPlannedServings: prepared.reduce((sum, row) => sum + row.selectedServings, 0),
    skippedUnavailable,
    recipes: prepared,
  };

  return { ok: true, data };
}
