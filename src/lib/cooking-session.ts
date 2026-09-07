import type { Recipe } from "@/data/types";
import { instructionStepText, normalizeTimerSeconds } from "@/lib/instruction-step";

export const COOKING_SESSION_STORAGE_PREFIX = "mesa:cooking-session:v1:";

export type CookingActiveTimer = {
  id: string;
  label: string;
  durationSeconds: number;
  /** Epoch ms when the timer should hit zero (while running). */
  endsAt: number | null;
  /** Remaining ms when paused; null while running. */
  remainingMs: number | null;
  status: "running" | "paused" | "completed";
};

export type CookingSessionState = {
  version: 1;
  recipeId: string;
  contentVersion: string;
  currentStepIndex: number;
  completedStepIndexes: number[];
  checkedIngredientKeys: string[];
  servings: number;
  keepScreenAwake: boolean;
  timers: CookingActiveTimer[];
  updatedAt: string;
};

/** Deterministic fingerprint of cooking-relevant recipe content (no Revision History). */
export function cookingContentVersion(recipe: Pick<Recipe, "instructions" | "ingredients" | "servings">): string {
  const payload = {
    servings: recipe.servings,
    ingredients: recipe.ingredients.map((group) => ({
      name: group.name ?? "",
      items: group.items.map((item) => ({
        item: item.item,
        amount: item.amount,
        notes: item.notes ?? "",
        grams: item.grams ?? null,
      })),
    })),
    instructions: recipe.instructions.map((group) => ({
      name: group.name ?? "",
      steps: group.steps.map((step) => instructionStepText(step)),
      timers: (group.stepTimers ?? []).map((t) => normalizeTimerSeconds(t) ?? null),
    })),
  };
  return `h${djb2(JSON.stringify(payload))}`;
}

function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function cookingSessionStorageKey(recipeId: string): string {
  return `${COOKING_SESSION_STORAGE_PREFIX}${recipeId}`;
}

export function ingredientCheckKey(groupIndex: number, itemIndex: number): string {
  return `${groupIndex}:${itemIndex}`;
}

export function createEmptyCookingSession(input: {
  recipeId: string;
  contentVersion: string;
  servings: number;
  currentStepIndex?: number;
}): CookingSessionState {
  return {
    version: 1,
    recipeId: input.recipeId,
    contentVersion: input.contentVersion,
    currentStepIndex: input.currentStepIndex ?? 0,
    completedStepIndexes: [],
    checkedIngredientKeys: [],
    servings: input.servings,
    keepScreenAwake: false,
    timers: [],
    updatedAt: new Date().toISOString(),
  };
}

export function parseCookingSession(raw: unknown): CookingSessionState | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.version !== 1) return null;
  if (typeof row.recipeId !== "string" || !row.recipeId.trim()) return null;
  if (typeof row.contentVersion !== "string" || !row.contentVersion.trim()) return null;
  if (typeof row.servings !== "number" || !Number.isFinite(row.servings) || row.servings < 1) {
    return null;
  }
  if (typeof row.currentStepIndex !== "number" || !Number.isFinite(row.currentStepIndex)) {
    return null;
  }
  const completed = Array.isArray(row.completedStepIndexes)
    ? row.completedStepIndexes.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    : [];
  const checked = Array.isArray(row.checkedIngredientKeys)
    ? row.checkedIngredientKeys.filter((k): k is string => typeof k === "string")
    : [];
  const timers = Array.isArray(row.timers) ? row.timers.map(parseTimer).filter(Boolean) as CookingActiveTimer[] : [];

  return {
    version: 1,
    recipeId: row.recipeId,
    contentVersion: row.contentVersion,
    currentStepIndex: Math.max(0, Math.floor(row.currentStepIndex)),
    completedStepIndexes: [...new Set(completed.map((n) => Math.max(0, Math.floor(n))))],
    checkedIngredientKeys: [...new Set(checked)],
    servings: Math.max(1, Math.round(row.servings)),
    keepScreenAwake: Boolean(row.keepScreenAwake),
    timers,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : new Date().toISOString(),
  };
}

function parseTimer(raw: unknown): CookingActiveTimer | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id) return null;
  if (typeof row.label !== "string") return null;
  if (typeof row.durationSeconds !== "number" || !Number.isFinite(row.durationSeconds)) return null;
  const status = row.status;
  if (status !== "running" && status !== "paused" && status !== "completed") return null;
  const endsAt =
    row.endsAt == null ? null : typeof row.endsAt === "number" && Number.isFinite(row.endsAt) ? row.endsAt : null;
  const remainingMs =
    row.remainingMs == null
      ? null
      : typeof row.remainingMs === "number" && Number.isFinite(row.remainingMs)
        ? row.remainingMs
        : null;
  return {
    id: row.id,
    label: row.label,
    durationSeconds: Math.max(1, Math.round(row.durationSeconds)),
    endsAt,
    remainingMs,
    status,
  };
}

export function readCookingSession(recipeId: string): CookingSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cookingSessionStorageKey(recipeId));
    if (!raw) return null;
    return parseCookingSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeCookingSession(session: CookingSessionState): void {
  if (typeof window === "undefined") return;
  try {
    const next = { ...session, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(cookingSessionStorageKey(session.recipeId), JSON.stringify(next));
  } catch {
    // Quota / private mode — cooking still works in-memory.
  }
}

export function clearCookingSession(recipeId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(cookingSessionStorageKey(recipeId));
  } catch {
    // ignore
  }
}

export type ResolveCookingSessionResult =
  | { status: "none" }
  | { status: "stale"; session: CookingSessionState }
  | { status: "ok"; session: CookingSessionState };

export function resolveCookingSession(input: {
  recipeId: string;
  contentVersion: string;
  stored: CookingSessionState | null;
}): ResolveCookingSessionResult {
  const { stored, recipeId, contentVersion } = input;
  if (!stored || stored.recipeId !== recipeId) return { status: "none" };
  if (stored.contentVersion !== contentVersion) return { status: "stale", session: stored };
  return { status: "ok", session: stored };
}

export function hasMeaningfulCookingProgress(session: CookingSessionState): boolean {
  return (
    session.currentStepIndex > 0 ||
    session.completedStepIndexes.length > 0 ||
    session.checkedIngredientKeys.length > 0 ||
    session.timers.some((t) => t.status !== "completed")
  );
}

/** Remaining ms for a timer at `now` (timestamp-based, not interval-based). */
export function timerRemainingMs(timer: CookingActiveTimer, now = Date.now()): number {
  if (timer.status === "completed") return 0;
  if (timer.status === "paused") return Math.max(0, timer.remainingMs ?? 0);
  if (timer.endsAt == null) return timer.durationSeconds * 1000;
  return Math.max(0, timer.endsAt - now);
}
