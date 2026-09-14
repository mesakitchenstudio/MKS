/**
 * Phase 5A — Meal Planner domain foundation (private, member-owned).
 * Pure constants/helpers only — no server actions, UI, or Shopping sync.
 */

import { clampRecipeServings, MAX_RECIPE_SERVINGS, MIN_RECIPE_SERVINGS } from "@/lib/culinary-format";
import {
  normalizeSavedRecipeCollectionName,
  normalizeSavedRecipeCollectionNameKey,
} from "@/lib/saved-recipe-collections";

/** Default name for an automatically-created first plan (later phases). */
export const MEAL_PLAN_DEFAULT_NAME = "My Meal Plan";

export const MEAL_PLAN_MAX_PLANS = 20;
export const MEAL_PLAN_MAX_ITEMS = 400;
export const MEAL_PLAN_MAX_ITEMS_PER_DATE = 20;
export const MEAL_PLAN_NAME_MAX_LENGTH = 80;
export const MEAL_PLAN_NOTE_MAX_LENGTH = 200;
export const MEAL_PLAN_SERVINGS_MIN = MIN_RECIPE_SERVINGS;
export const MEAL_PLAN_SERVINGS_MAX = MAX_RECIPE_SERVINGS;
export const MEAL_PLAN_DATE_HORIZON_DAYS = 366;

/** Canonical ordered meal slots (MVP). */
export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const CIVIL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type MealPlanNameOk = { ok: true; name: string; nameNorm: string };
export type MealPlanNameErr = { ok: false; error: "INVALID_NAME"; message: string };

/** Trim + NFKC + collapse whitespace — reuses Saved Collection normalization. */
export function normalizeMealPlanName(raw: unknown): string {
  return normalizeSavedRecipeCollectionName(raw);
}

/** Case/spacing-insensitive uniqueness key — reuses Saved Collection key form. */
export function normalizeMealPlanNameKey(raw: unknown): string {
  return normalizeSavedRecipeCollectionNameKey(raw);
}

export function validateMealPlanName(raw: unknown): MealPlanNameOk | MealPlanNameErr {
  const name = normalizeMealPlanName(raw);
  if (!name) {
    return { ok: false, error: "INVALID_NAME", message: "Enter a meal plan name." };
  }
  if (name.length > MEAL_PLAN_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: "INVALID_NAME",
      message: `Use ${MEAL_PLAN_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }
  if (/[\u0000-\u001F\u007F<>]/.test(name)) {
    return { ok: false, error: "INVALID_NAME", message: "Use a plain text name." };
  }
  return { ok: true, name, nameNorm: normalizeMealPlanNameKey(name) };
}

export function isMealSlot(value: unknown): value is MealSlot {
  return typeof value === "string" && (MEAL_SLOTS as readonly string[]).includes(value);
}

export function validateMealSlot(
  raw: unknown,
): { ok: true; mealSlot: MealSlot } | { ok: false; error: "INVALID_SLOT"; message: string } {
  if (!isMealSlot(raw)) {
    return { ok: false, error: "INVALID_SLOT", message: "Choose a valid meal slot." };
  }
  return { ok: true, mealSlot: raw };
}

export function mealSlotLabel(slot: MealSlot): string {
  return MEAL_SLOT_LABELS[slot];
}

/**
 * Strict civil YYYY-MM-DD validator (member-local planning date).
 * Rejects malformed strings and impossible calendar days (e.g. 2026-02-30).
 */
export function parseCivilDateParts(
  raw: unknown,
): { year: number; month: number; day: number; iso: string } | null {
  if (typeof raw !== "string") return null;
  const match = CIVIL_DATE_RE.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  // UTC calendar check — treats the string as an abstract civil date, not a timezone instant.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, iso: raw };
}

export function validateMealPlanDate(
  raw: unknown,
): { ok: true; planDate: string } | { ok: false; error: "INVALID_DATE"; message: string } {
  const parts = parseCivilDateParts(raw);
  if (!parts) {
    return { ok: false, error: "INVALID_DATE", message: "Use a valid date (YYYY-MM-DD)." };
  }
  return { ok: true, planDate: parts.iso };
}

/** Absolute day difference between two valid civil dates; null if either is invalid. */
export function daysBetweenCivilDates(a: unknown, b: unknown): number | null {
  const left = parseCivilDateParts(a);
  const right = parseCivilDateParts(b);
  if (!left || !right) return null;
  const leftDays = Date.UTC(left.year, left.month - 1, left.day) / 86_400_000;
  const rightDays = Date.UTC(right.year, right.month - 1, right.day) / 86_400_000;
  return Math.abs(rightDays - leftDays);
}

/**
 * Validates planDate against an explicit today reference (YYYY-MM-DD).
 * Core helpers must not call Date.now() — callers supply today.
 */
export function validateMealPlanDateHorizon(
  planDate: unknown,
  today: unknown,
  horizonDays: number = MEAL_PLAN_DATE_HORIZON_DAYS,
):
  | { ok: true; planDate: string }
  | { ok: false; error: "INVALID_DATE" | "OUT_OF_HORIZON"; message: string } {
  const dateResult = validateMealPlanDate(planDate);
  if (!dateResult.ok) return dateResult;
  const todayResult = validateMealPlanDate(today);
  if (!todayResult.ok) {
    return { ok: false, error: "INVALID_DATE", message: "Reference date must be YYYY-MM-DD." };
  }
  const distance = daysBetweenCivilDates(dateResult.planDate, todayResult.planDate);
  if (distance === null || distance > horizonDays) {
    return {
      ok: false,
      error: "OUT_OF_HORIZON",
      message: `Choose a date within ${horizonDays} days of today.`,
    };
  }
  return { ok: true, planDate: dateResult.planDate };
}

/** Clamp to culinary serving bounds (1–99); independent of Recipe.values.servings. */
export function clampMealPlanServings(value: number): number {
  return clampRecipeServings(value);
}

export function normalizeMealPlanServings(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return clampMealPlanServings(n);
}

export function validateMealPlanServings(
  raw: unknown,
): { ok: true; plannedServings: number } | { ok: false; error: "INVALID_SERVINGS"; message: string } {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: "INVALID_SERVINGS", message: "Servings must be a whole number." };
  }
  if (n < MEAL_PLAN_SERVINGS_MIN || n > MEAL_PLAN_SERVINGS_MAX) {
    return {
      ok: false,
      error: "INVALID_SERVINGS",
      message: `Servings must be between ${MEAL_PLAN_SERVINGS_MIN} and ${MEAL_PLAN_SERVINGS_MAX}.`,
    };
  }
  return { ok: true, plannedServings: n };
}

/**
 * Optional private note.
 * undefined / null / "" / whitespace-only → undefined (absent).
 * Otherwise trim; reject when trimmed length exceeds max.
 */
export function normalizeMealPlanNote(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const trimmed = String(raw).trim();
  return trimmed ? trimmed : undefined;
}

export function validateMealPlanNote(
  raw: unknown,
):
  | { ok: true; note: string | undefined }
  | { ok: false; error: "INVALID_NOTE"; message: string } {
  const note = normalizeMealPlanNote(raw);
  if (note !== undefined && note.length > MEAL_PLAN_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: "INVALID_NOTE",
      message: `Use ${MEAL_PLAN_NOTE_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, note };
}

/**
 * Manual order inside planDate + mealSlot.
 * Normalize to a non-negative integer; invalid → 0.
 */
export function normalizeMealPlanSortOrder(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

export function validateMealPlanSortOrder(
  raw: unknown,
): { ok: true; sortOrder: number } | { ok: false; error: "INVALID_SORT_ORDER"; message: string } {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return { ok: false, error: "INVALID_SORT_ORDER", message: "Sort order must be a non-negative integer." };
  }
  return { ok: true, sortOrder: n };
}

/**
 * Feature gate — default OFF unless explicitly true.
 * UI/routes remain Phase 5B+; do not set Production env in 5A.
 */
export function isMealPlannerEnabled(): boolean {
  return (
    process.env.MEAL_PLANNER_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_MEAL_PLANNER_ENABLED === "true"
  );
}
