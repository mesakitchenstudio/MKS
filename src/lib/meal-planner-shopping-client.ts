/**
 * Phase 5E — Client-side Meal Planner → Shopping List commit helpers.
 * Uses authoritative shopping-list lib (localStorage); never mutates from the server.
 *
 * Batch commit is atomic from the user's perspective:
 * load once → apply all recipes in memory → save once (or abort with no write).
 */

import {
  applyRecipeContributions,
  loadShoppingListState,
  saveShoppingListState,
  SHOPPING_LIST_PATH,
  type ShoppingListContribution,
  type ShoppingListState,
} from "@/lib/shopping-list";
import type { MealPlanShoppingPreparedRecipe } from "@/lib/meal-planner-shopping";

export type MealPlanShoppingCollision = {
  recipeId: string;
  recipeTitle: string;
};

export type MealPlanShoppingBatchResult = {
  ok: boolean;
  /** Distinct recipes newly added in this batch. */
  added: number;
  /** Distinct recipes updated (or kept_full) in this batch. */
  updated: number;
  /** Total distinct recipes successfully applied in the batch (added + updated). */
  recipeCount: number;
  message: string;
  href: string;
};

/** Recipes already present in the local Shopping List (by recipeId). */
export function findMealPlanShoppingCollisions(
  recipes: Array<Pick<MealPlanShoppingPreparedRecipe, "recipeId" | "recipeTitle">>,
): MealPlanShoppingCollision[] {
  const state = loadShoppingListState();
  const existing = new Set(state.contributions.map((row) => row.recipeId));
  const collisions: MealPlanShoppingCollision[] = [];
  const seen = new Set<string>();
  for (const recipe of recipes) {
    if (!existing.has(recipe.recipeId) || seen.has(recipe.recipeId)) continue;
    seen.add(recipe.recipeId);
    collisions.push({ recipeId: recipe.recipeId, recipeTitle: recipe.recipeTitle });
  }
  return collisions;
}

function failBatch(message: string): MealPlanShoppingBatchResult {
  return {
    ok: false,
    added: 0,
    updated: 0,
    recipeCount: 0,
    message,
    href: SHOPPING_LIST_PATH,
  };
}

/**
 * Apply every prepared Recipe contribution to an in-memory candidate state.
 * Does not write localStorage. Returns the final candidate on full success,
 * or a failure if any recipe cannot be applied under normal Shopping rules.
 */
export function applyMealPlanShoppingBatchCandidate(
  initial: ShoppingListState,
  recipes: Array<{
    contributions: ShoppingListContribution[];
    recipeTitle: string;
    recipeId: string;
  }>,
):
  | {
      ok: true;
      state: ShoppingListState;
      added: number;
      updated: number;
    }
  | { ok: false; message: string } {
  if (!recipes.length) {
    return { ok: false, message: "Nothing was added to your Shopping List." };
  }

  let candidate = initial;
  let added = 0;
  let updated = 0;

  for (const recipe of recipes) {
    if (!recipe.contributions.length) {
      return {
        ok: false,
        message: `Could not add ${recipe.recipeTitle || "a recipe"} to your Shopping List.`,
      };
    }

    const result = applyRecipeContributions(candidate, recipe.contributions);
    if (result.outcome === "noop") {
      return {
        ok: false,
        message: result.message || "Shopping list could not accept this batch.",
      };
    }

    // kept_full: state unchanged; still counts as a successful batch member.
    if (result.outcome === "kept_full") {
      updated += 1;
      continue;
    }

    candidate = result.state;
    if (result.outcome === "added") added += 1;
    else updated += 1;
  }

  return { ok: true, state: candidate, added, updated };
}

/**
 * Atomic Meal Planner → Shopping commit for one day/week Add.
 * Load once → apply entire prepared batch in memory → single save (or abort).
 */
export function commitMealPlanShoppingBatch(
  recipes: Array<{
    contributions: ShoppingListContribution[];
    recipeTitle: string;
    recipeId: string;
  }>,
): MealPlanShoppingBatchResult {
  const initial = loadShoppingListState();
  const applied = applyMealPlanShoppingBatchCandidate(initial, recipes);
  if (!applied.ok) {
    return failBatch(applied.message);
  }

  const saved = saveShoppingListState(applied.state);
  if (!saved) {
    return failBatch("Could not save your Shopping List. Please try again.");
  }

  const { added, updated } = applied;
  const recipeCount = added + updated;
  const parts: string[] = [];
  if (added) parts.push(`Added ${added} recipe${added === 1 ? "" : "s"}`);
  if (updated) parts.push(`updated ${updated}`);
  const message = parts.length
    ? `${parts.join(" and ")} in your Shopping List.`
    : "Shopping List updated.";

  return {
    ok: true,
    added,
    updated,
    recipeCount,
    message,
    href: SHOPPING_LIST_PATH,
  };
}
