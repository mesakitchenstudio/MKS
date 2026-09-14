/**
 * Phase 5E — Meal Planner → Shopping List preparation (pure helpers).
 * Shopping storage remains browser-local; this module only prepares safe payloads.
 */

import { MAX_RECIPE_SERVINGS } from "@/lib/culinary-format";
import type { ShoppingListContribution } from "@/lib/shopping-list";
import {
  endOfWeekSunday,
  mealPlanWeekDates,
  parseMealPlanWeekParam,
  startOfWeekMonday,
  validateMealPlanDate,
  validateMealPlanDateHorizon,
  type MealPlanError,
} from "@/lib/meal-planner";

export const MEAL_PLAN_SHOPPING_SERVINGS_MAX = MAX_RECIPE_SERVINGS;

export type MealPlanShoppingScope = "day" | "week";

export type MealPlanShoppingPrepareInput = {
  planId: string;
  scope: MealPlanShoppingScope;
  /** Required when scope === "day" */
  date?: string;
  /** Required when scope === "week" — Monday YYYY-MM-DD */
  weekStart?: string;
  today: string;
};

export type MealPlanShoppingPreparedRecipe = {
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  selectedServings: number;
  contributions: ShoppingListContribution[];
};

export type MealPlanShoppingPrepareData = {
  scope: MealPlanShoppingScope;
  planId: string;
  fromDate: string;
  toDate: string;
  mealCount: number;
  uniqueRecipeCount: number;
  totalPlannedServings: number;
  skippedUnavailable: number;
  recipes: MealPlanShoppingPreparedRecipe[];
};

export type MealPlanShoppingError =
  | MealPlanError
  | "EMPTY_SELECTION"
  | "SERVINGS_OVERFLOW"
  | "SHOPPING_DISABLED";

export type MealPlanShoppingPrepareResult =
  | { ok: true; data: MealPlanShoppingPrepareData }
  | { ok: false; error: MealPlanShoppingError; message: string };

export type MealPlanShoppingAggregate = {
  recipeId: string;
  plannedServings: number;
  occurrenceCount: number;
};

/**
 * Aggregate owned MealPlanItems by canonical Recipe.id (sum plannedServings).
 * Items without recipeId are ignored here (caller counts them as unavailable).
 */
export function aggregateMealPlanItemsByRecipeId(
  items: Array<{ recipeId: string | null; plannedServings: number }>,
): MealPlanShoppingAggregate[] {
  const map = new Map<string, MealPlanShoppingAggregate>();
  for (const item of items) {
    const recipeId = String(item.recipeId ?? "").trim();
    if (!recipeId) continue;
    const servings = Number(item.plannedServings);
    if (!Number.isFinite(servings) || servings <= 0) continue;
    const existing = map.get(recipeId);
    if (existing) {
      existing.plannedServings += servings;
      existing.occurrenceCount += 1;
    } else {
      map.set(recipeId, {
        recipeId,
        plannedServings: servings,
        occurrenceCount: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.recipeId.localeCompare(b.recipeId));
}

export function findMealPlanShoppingServingsOverflow(
  aggregates: MealPlanShoppingAggregate[],
  max = MEAL_PLAN_SHOPPING_SERVINGS_MAX,
): MealPlanShoppingAggregate | null {
  for (const row of aggregates) {
    if (row.plannedServings > max) return row;
  }
  return null;
}

export function resolveMealPlanShoppingDateRange(
  input: Pick<MealPlanShoppingPrepareInput, "scope" | "date" | "weekStart" | "today">,
):
  | { ok: true; fromDate: string; toDate: string }
  | { ok: false; error: MealPlanShoppingError; message: string } {
  const today = validateMealPlanDate(input.today);
  if (!today.ok) {
    return { ok: false, error: "INVALID_DATE", message: "Reference date must be YYYY-MM-DD." };
  }

  if (input.scope === "day") {
    const horizon = validateMealPlanDateHorizon(input.date, today.planDate);
    if (!horizon.ok) {
      return {
        ok: false,
        error: horizon.error === "OUT_OF_HORIZON" ? "DATE_OUT_OF_RANGE" : "INVALID_DATE",
        message: horizon.message,
      };
    }
    return { ok: true, fromDate: horizon.planDate, toDate: horizon.planDate };
  }

  if (input.scope === "week") {
    const mondayCheck = validateMealPlanDate(input.weekStart);
    if (!mondayCheck.ok) {
      return { ok: false, error: "INVALID_DATE", message: "Use a valid week start (Monday, YYYY-MM-DD)." };
    }
    const monday = startOfWeekMonday(mondayCheck.planDate);
    if (!monday || monday !== mondayCheck.planDate) {
      return { ok: false, error: "INVALID_DATE", message: "Use a valid week start (Monday, YYYY-MM-DD)." };
    }
    const parsed = parseMealPlanWeekParam(monday, today.planDate);
    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error,
        message:
          parsed.error === "DATE_OUT_OF_RANGE"
            ? "Choose a week within the supported planning range."
            : "Use a valid week start (Monday, YYYY-MM-DD).",
      };
    }
    const days = mealPlanWeekDates(parsed.weekStart);
    const end = endOfWeekSunday(parsed.weekStart);
    if (!days || !end) {
      return { ok: false, error: "INVALID_DATE", message: "Use a valid week start (Monday, YYYY-MM-DD)." };
    }
    return { ok: true, fromDate: parsed.weekStart, toDate: end };
  }

  return { ok: false, error: "INVALID_DATE", message: "Choose a day or week to add." };
}

/** Ensure planner private notes never appear in shopping contribution notes. */
export function shoppingContributionsLeakPlannerNote(
  contributions: ShoppingListContribution[],
  plannerNotes: Array<string | null | undefined>,
): boolean {
  const privateNotes = new Set(
    plannerNotes
      .map((note) => String(note ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (privateNotes.size === 0) return false;
  for (const row of contributions) {
    const note = String(row.notes ?? "").trim().toLowerCase();
    if (note && privateNotes.has(note)) return true;
  }
  return false;
}

export function mealPlanShoppingErrorMessage(error: MealPlanShoppingError): string {
  switch (error) {
    case "EMPTY_SELECTION":
      return "No meals to add for that selection.";
    case "SERVINGS_OVERFLOW":
      return `A recipe's planned servings exceed the Shopping List scaling limit (${MEAL_PLAN_SHOPPING_SERVINGS_MAX}).`;
    case "SHOPPING_DISABLED":
      return "Shopping List is not available right now.";
    case "FEATURE_DISABLED":
      return "Meal Planner is not available right now.";
    case "NOT_AUTHENTICATED":
      return "Sign in from Profile to manage meal plans.";
    case "PLAN_NOT_FOUND":
      return "Meal plan not found.";
    default:
      return "Could not prepare Shopping List items. Please try again.";
  }
}
