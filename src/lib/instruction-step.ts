import type { InstructionGroup } from "@/data/types";

/**
 * Instruction steps remain plain strings in Recipe.values.
 * Optional per-step timers live in a parallel `stepTimers` array (seconds),
 * index-aligned with `steps`, so existing string pipelines stay intact.
 */
export const MAX_STEP_TIMER_SECONDS = 24 * 60 * 60; // 24 hours
export const MAX_STEP_TIMER_MINUTES = 24 * 60;

export function instructionStepText(step: unknown): string {
  if (typeof step === "string") return step;
  if (step && typeof step === "object" && "text" in (step as object)) {
    return String((step as { text?: unknown }).text ?? "");
  }
  if (step == null) return "";
  return String(step);
}

/** Normalize and validate optional timer seconds; reject negatives / absurd values. */
export function normalizeTimerSeconds(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > MAX_STEP_TIMER_SECONDS) return undefined;
  return rounded;
}

export function minutesToTimerSeconds(minutes: unknown): number | undefined {
  if (minutes == null || minutes === "") return undefined;
  const n = typeof minutes === "number" ? minutes : Number(minutes);
  if (!Number.isFinite(n)) return undefined;
  if (n <= 0 || n > MAX_STEP_TIMER_MINUTES) return undefined;
  return normalizeTimerSeconds(Math.round(n * 60));
}

export function timerSecondsToMinutes(seconds: number | undefined): number | "" {
  if (seconds == null) return "";
  return Math.round(seconds / 60);
}

export function stepTimerAt(group: InstructionGroup, stepIndex: number): number | undefined {
  return normalizeTimerSeconds(group.stepTimers?.[stepIndex]);
}

/** Keep stepTimers aligned when steps are reordered, inserted, or removed. */
export function alignStepTimers(
  timers: InstructionGroup["stepTimers"],
  stepCount: number,
): Array<number | null | undefined> | undefined {
  if (!timers?.length) return undefined;
  const next = timers.slice(0, stepCount);
  while (next.length < stepCount) next.push(undefined);
  const hasAny = next.some((t) => normalizeTimerSeconds(t) != null);
  return hasAny ? next : undefined;
}

export function formatTimerDurationLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.round(seconds / 60);
  if (seconds % 60 === 0) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m} min ${s} sec`;
}

export function formatTimerClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
