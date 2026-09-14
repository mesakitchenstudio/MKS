/**
 * Phase 5A/5B — Meal Planner domain (private, member-owned).
 * Pure constants/helpers + shared error/result types for the server layer.
 */

import { clampRecipeServings, MAX_RECIPE_SERVINGS, MIN_RECIPE_SERVINGS } from "@/lib/culinary-format";
import {
  normalizeSavedRecipeCollectionName,
  normalizeSavedRecipeCollectionNameKey,
} from "@/lib/saved-recipe-collections";

/** Default first-plan name for an automatically-created plan (later phases). */
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

/** Default meal slot for Recipe-detail Add to Meal Plan (no meal context on the page). */
export const MEAL_PLAN_DEFAULT_SLOT: MealSlot = "dinner";

const CIVIL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const MEAL_PLAN_ERRORS = [
  "NOT_AUTHENTICATED",
  "FEATURE_DISABLED",
  "PLAN_NOT_FOUND",
  "ITEM_NOT_FOUND",
  "INVALID_NAME",
  "DUPLICATE_PLAN_NAME",
  "PLAN_LIMIT_REACHED",
  "PLAN_ITEM_LIMIT_REACHED",
  "DATE_ITEM_LIMIT_REACHED",
  "INVALID_DATE",
  "DATE_OUT_OF_RANGE",
  "INVALID_SLOT",
  "INVALID_SERVINGS",
  "INVALID_NOTE",
  "INVALID_SORT_ORDER",
  "RECIPE_NOT_AVAILABLE",
  "INVALID_REORDER",
] as const;

export type MealPlanError = (typeof MEAL_PLAN_ERRORS)[number];

export type MealPlanActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: MealPlanError; message: string };

/** Public-linkability of the referenced Recipe for member planner UI. */
export type MealPlanRecipeAvailability = "available" | "unavailable" | "orphaned";

export type MealPlanSummary = {
  id: string;
  name: string;
  nameNorm: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type MealPlanItemView = {
  id: string;
  planId: string;
  recipeId: string | null;
  recipeSlug: string;
  recipeTitle: string;
  planDate: string;
  mealSlot: MealSlot;
  sortOrder: number;
  plannedServings: number;
  note: string | null;
  /** available = Published (safe to link); unavailable = exists but not Published; orphaned = deleted. */
  recipeAvailability: MealPlanRecipeAvailability;
  /** Set only when recipeAvailability === "available". */
  publicRecipeSlug: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MealPlanDetail = MealPlanSummary & {
  items: MealPlanItemView[];
};

export type MealPlanNameOk = { ok: true; name: string; nameNorm: string };
export type MealPlanNameErr = { ok: false; error: "INVALID_NAME"; message: string };

/** Canonical slot rank for deterministic ordering (not lexical). */
export function mealSlotSortIndex(slot: string): number {
  const index = (MEAL_SLOTS as readonly string[]).indexOf(slot);
  return index === -1 ? MEAL_SLOTS.length : index;
}

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
 * Authoritative flag: MEAL_PLANNER_ENABLED (server-side only).
 * Do not use NEXT_PUBLIC_* — pass mealPlannerEnabled from server layouts into client UI.
 */
export function isMealPlannerEnabled(): boolean {
  return process.env.MEAL_PLANNER_ENABLED === "true";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatCivilDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Add (or subtract) whole civil days from a YYYY-MM-DD string. */
export function addCivilDays(ymd: unknown, deltaDays: number): string | null {
  const parts = parseCivilDateParts(ymd);
  if (!parts || !Number.isInteger(deltaDays)) return null;
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + deltaDays));
  return formatCivilDate(probe.getUTCFullYear(), probe.getUTCMonth() + 1, probe.getUTCDate());
}

/**
 * Mesa Planner weeks are Monday → Sunday (civil calendar, not Admin TRT).
 * Returns the Monday YYYY-MM-DD of the week containing `ymd`.
 */
export function startOfWeekMonday(ymd: unknown): string | null {
  const parts = parseCivilDateParts(ymd);
  if (!parts) return null;
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const weekday = utc.getUTCDay(); // 0=Sun … 6=Sat
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addCivilDays(parts.iso, offset);
}

export function endOfWeekSunday(weekStartMonday: unknown): string | null {
  const monday = startOfWeekMonday(weekStartMonday);
  if (!monday) return null;
  return addCivilDays(monday, 6);
}

/** Seven civil dates Mon→Sun for the week containing the given date (or Monday start). */
export function mealPlanWeekDates(weekStartMonday: unknown): string[] | null {
  const monday = startOfWeekMonday(weekStartMonday);
  if (!monday) return null;
  const days: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const day = addCivilDays(monday, i);
    if (!day) return null;
    days.push(day);
  }
  return days;
}

export function previousMealPlanWeekStart(weekStartMonday: unknown): string | null {
  const start = startOfWeekMonday(weekStartMonday);
  if (!start) return null;
  return addCivilDays(start, -7);
}

export function nextMealPlanWeekStart(weekStartMonday: unknown): string | null {
  const start = startOfWeekMonday(weekStartMonday);
  if (!start) return null;
  return addCivilDays(start, 7);
}

export function isDateInMealPlanWeek(ymd: unknown, weekStartMonday: unknown): boolean {
  const day = parseCivilDateParts(ymd)?.iso;
  const days = mealPlanWeekDates(weekStartMonday);
  if (!day || !days) return false;
  return days.includes(day);
}

/**
 * Parse `?week=` — snap any valid civil date to that week's Monday.
 * Optional `today` enforces ±366 horizon on the Monday.
 */
export function parseMealPlanWeekParam(
  raw: unknown,
  today?: unknown,
): { ok: true; weekStart: string } | { ok: false; error: "INVALID_DATE" | "DATE_OUT_OF_RANGE" } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: false, error: "INVALID_DATE" };
  }
  const date = validateMealPlanDate(raw);
  if (!date.ok) return { ok: false, error: "INVALID_DATE" };
  const weekStart = startOfWeekMonday(date.planDate);
  if (!weekStart) return { ok: false, error: "INVALID_DATE" };
  if (today !== undefined && today !== null && today !== "") {
    const horizon = validateMealPlanDateHorizon(weekStart, today);
    if (!horizon.ok) {
      return {
        ok: false,
        error: horizon.error === "OUT_OF_HORIZON" ? "DATE_OUT_OF_RANGE" : "INVALID_DATE",
      };
    }
  }
  return { ok: true, weekStart };
}

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAY_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function mealPlanWeekdayShort(ymd: unknown): string | null {
  const days = mealPlanWeekDates(startOfWeekMonday(ymd) ?? "");
  const iso = parseCivilDateParts(ymd)?.iso;
  if (!days || !iso) return null;
  const index = days.indexOf(iso);
  return index >= 0 ? WEEKDAY_SHORT[index]! : null;
}

export function formatMealPlanWeekRangeLabel(weekStartMonday: unknown): string | null {
  const days = mealPlanWeekDates(weekStartMonday);
  if (!days) return null;
  const start = parseCivilDateParts(days[0]!);
  const end = parseCivilDateParts(days[6]!);
  if (!start || !end) return null;
  const startLabel = `${MONTH_SHORT[start.month - 1]} ${start.day}`;
  const endLabel =
    start.month === end.month
      ? `${end.day}, ${end.year}`
      : start.year === end.year
        ? `${MONTH_SHORT[end.month - 1]} ${end.day}, ${end.year}`
        : `${MONTH_SHORT[end.month - 1]} ${end.day}, ${end.year}`;
  return `${startLabel}–${endLabel}`;
}

export function formatMealPlanDayHeading(ymd: unknown): string | null {
  const parts = parseCivilDateParts(ymd);
  if (!parts) return null;
  const monday = startOfWeekMonday(parts.iso);
  const days = monday ? mealPlanWeekDates(monday) : null;
  if (!days) return null;
  const index = days.indexOf(parts.iso);
  if (index < 0) return null;
  return `${WEEKDAY_LONG[index]} · ${MONTH_LONG[parts.month - 1]} ${parts.day}`;
}

export function formatMealPlanDayStripLabel(ymd: unknown): { weekday: string; day: number } | null {
  const parts = parseCivilDateParts(ymd);
  if (!parts) return null;
  const weekday = mealPlanWeekdayShort(parts.iso);
  if (!weekday) return null;
  return { weekday, day: parts.day };
}

/** Browser-local civil today — client-only; do not call during SSR. */
export function browserLocalTodayYmd(now: Date = new Date()): string {
  return formatCivilDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Planner deep link for the week containing a civil planDate. */
export function mealPlannerHrefForDate(planId: string, planDate: string): string | null {
  const id = String(planId ?? "").trim();
  const weekStart = startOfWeekMonday(planDate);
  if (!id || !weekStart) return null;
  return `/profile/meal-planner/${id}?week=${weekStart}`;
}

export function mealPlanErrorMessage(error: MealPlanError): string {
  switch (error) {
    case "NOT_AUTHENTICATED":
      return "Sign in from Profile to manage meal plans.";
    case "FEATURE_DISABLED":
      return "Meal Planner is not available right now.";
    case "PLAN_NOT_FOUND":
      return "Meal plan not found.";
    case "ITEM_NOT_FOUND":
      return "That planned meal was not found.";
    case "INVALID_NAME":
      return "Enter a valid meal plan name.";
    case "DUPLICATE_PLAN_NAME":
      return "You already have a meal plan with that name.";
    case "PLAN_LIMIT_REACHED":
      return `You can create up to ${MEAL_PLAN_MAX_PLANS} meal plans.`;
    case "PLAN_ITEM_LIMIT_REACHED":
      return `A meal plan can hold up to ${MEAL_PLAN_MAX_ITEMS} items.`;
    case "DATE_ITEM_LIMIT_REACHED":
      return `You can plan up to ${MEAL_PLAN_MAX_ITEMS_PER_DATE} meals for one day.`;
    case "INVALID_DATE":
      return "Choose a valid date.";
    case "DATE_OUT_OF_RANGE":
      return `Choose a date within ${MEAL_PLAN_DATE_HORIZON_DAYS} days of today.`;
    case "INVALID_SLOT":
      return "Choose breakfast, lunch, dinner, or snack.";
    case "INVALID_SERVINGS":
      return `Servings must be between ${MEAL_PLAN_SERVINGS_MIN} and ${MEAL_PLAN_SERVINGS_MAX}.`;
    case "INVALID_NOTE":
      return `Planning notes can be up to ${MEAL_PLAN_NOTE_MAX_LENGTH} characters.`;
    case "INVALID_SORT_ORDER":
      return "Sort order must be a non-negative integer.";
    case "RECIPE_NOT_AVAILABLE":
      return "This recipe is no longer available to plan.";
    case "INVALID_REORDER":
      return "Could not reorder those meals.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export type MealPlannerRecipeOption = {
  id: string;
  slug: string;
  title: string;
  image: string;
  imageAlt: string;
  servings: number;
};
