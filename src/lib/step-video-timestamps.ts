import type { InstructionGroup } from "@/data/types";
import { alignStepTimers } from "@/lib/instruction-step";
import { youtubeVideoId } from "@/lib/youtube";

/**
 * Max persisted per-step video timestamp (seconds).
 * Matches Mesa timer/chapter 24h convention (`MAX_STEP_TIMER_SECONDS`).
 */
export const MAX_STEP_VIDEO_TIMESTAMP_SECONDS = 24 * 60 * 60;

export type StepTimestampBindingState =
  | "none"
  | "active"
  | "unbound"
  | "missing_video"
  | "mismatch";

export type RecipeVideoIdChange =
  | "unchanged"
  | "replaced"
  | "removed"
  | "added";

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Normalize a single step video timestamp for Recipe JSON.
 * `0` is valid. Invalid / out-of-range → null (defensive; never throw).
 * Whole seconds only — fractional values are rejected.
 */
export function normalizeStepVideoTimestampSeconds(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null;
  if (n < 0 || n > MAX_STEP_VIDEO_TIMESTAMP_SECONDS) return null;
  return n;
}

function slotHasValidTimestamp(value: unknown): boolean {
  return normalizeStepVideoTimestampSeconds(value) != null;
}

/**
 * Align stepVideoTimestamps to step count.
 * Absent input with nothing to preserve → undefined (no content churn).
 * Preserves `0`. Drops malformed entries to null slots.
 */
export function alignStepVideoTimestamps(
  timestamps: InstructionGroup["stepVideoTimestamps"],
  stepCount: number,
): Array<number | null> | undefined {
  if (!timestamps?.length) return undefined;
  const next: Array<number | null> = [];
  for (let i = 0; i < stepCount; i += 1) {
    next.push(normalizeStepVideoTimestampSeconds(timestamps[i]));
  }
  const hasAny = next.some((t) => t != null);
  return hasAny ? next : undefined;
}

export function hasStepVideoTimestamps(
  instructions: InstructionGroup[] | unknown,
): boolean {
  if (!Array.isArray(instructions)) return false;
  for (const group of instructions) {
    if (!group || typeof group !== "object") continue;
    const stamps = (group as InstructionGroup).stepVideoTimestamps;
    if (!Array.isArray(stamps)) continue;
    if (stamps.some((t) => slotHasValidTimestamp(t))) return true;
  }
  return false;
}

/** Canonical YouTube video ID from Recipe.values (videoId preferred, else URL). */
export function getCanonicalRecipeVideoIdFromValues(
  values: Record<string, unknown> | null | undefined,
): string | null {
  if (!values || typeof values !== "object") return null;
  const youtube = values.youtube;
  const blob =
    youtube && typeof youtube === "object" && !Array.isArray(youtube)
      ? (youtube as Record<string, unknown>)
      : {};
  const preserved =
    blob.preserved && typeof blob.preserved === "object" && !Array.isArray(blob.preserved)
      ? (blob.preserved as Record<string, unknown>)
      : {};

  const fromId =
    asTrimmedString(blob.videoId) || asTrimmedString(preserved.videoId) || "";
  if (fromId) {
    return youtubeVideoId(fromId) || (fromId.length === 11 ? fromId : null);
  }

  const url =
    asTrimmedString(blob.url) ||
    asTrimmedString(preserved.url) ||
    asTrimmedString(values.youtubeUrl);
  if (!url) return null;
  return youtubeVideoId(url);
}

export function getStepTimestampsVideoIdFromValues(
  values: Record<string, unknown> | null | undefined,
): string | null {
  if (!values || typeof values !== "object") return null;
  const youtube = values.youtube;
  if (!youtube || typeof youtube !== "object" || Array.isArray(youtube)) return null;
  const blob = youtube as Record<string, unknown>;
  const preserved =
    blob.preserved && typeof blob.preserved === "object" && !Array.isArray(blob.preserved)
      ? (blob.preserved as Record<string, unknown>)
      : {};
  const raw =
    asTrimmedString(blob.stepTimestampsVideoId) ||
    asTrimmedString(preserved.stepTimestampsVideoId);
  if (!raw) return null;
  return youtubeVideoId(raw) || (raw.length === 11 ? raw : null);
}

/**
 * ACTIVE only when timestamps exist, video exists, binding exists, and they match.
 * Otherwise stored data is dormant.
 */
export function getStepTimestampBindingState(
  values: Record<string, unknown> | null | undefined,
): StepTimestampBindingState {
  const instructions = values?.instructions;
  if (!hasStepVideoTimestamps(instructions)) return "none";

  const videoId = getCanonicalRecipeVideoIdFromValues(values);
  const binding = getStepTimestampsVideoIdFromValues(values);

  if (!videoId) return "missing_video";
  if (!binding) return "unbound";
  if (binding !== videoId) return "mismatch";
  return "active";
}

export function isStepTimestampMappingActive(
  values: Record<string, unknown> | null | undefined,
): boolean {
  return getStepTimestampBindingState(values) === "active";
}

/** Public/preview eligibility for #10 per-step Watch controls. */
export function isPublicStepVideoTimestampsEligible(input: {
  gateEnabled: boolean;
  instructions: unknown;
  youtube?: unknown;
  youtubeUrl?: string | null;
}): boolean {
  if (!input.gateEnabled) return false;
  return isStepTimestampMappingActive({
    instructions: input.instructions,
    youtube: input.youtube,
    youtubeUrl: input.youtubeUrl ?? undefined,
  });
}

/**
 * Accessible spoken duration for screen readers.
 * Examples: 0 → "0 seconds"; 65 → "1 minute 5 seconds"; 3725 → "1 hour 2 minutes 5 seconds"
 */
export function formatVideoTimestampAccessible(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (mins > 0) parts.push(`${mins} minute${mins === 1 ? "" : "s"}`);
  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs} second${secs === 1 ? "" : "s"}`);
  }
  return parts.join(" ");
}

/** Compare canonical video identity (not raw URL text). */
export function didRecipeVideoIdChange(
  previousValues: Record<string, unknown> | null | undefined,
  nextValues: Record<string, unknown> | null | undefined,
): RecipeVideoIdChange {
  const prev = getCanonicalRecipeVideoIdFromValues(previousValues);
  const next = getCanonicalRecipeVideoIdFromValues(nextValues);
  if (prev === next) return "unchanged";
  if (prev && !next) return "removed";
  if (!prev && next) return "added";
  return "replaced";
}

/** Pure: set binding video id. Does not invent timestamps. */
export function withStepTimestampsVideoBinding(
  values: Record<string, unknown>,
  videoId: string | null | undefined,
): Record<string, unknown> {
  const id = asTrimmedString(videoId);
  const canonical = id ? youtubeVideoId(id) || (id.length === 11 ? id : "") : "";
  const youtube =
    values.youtube && typeof values.youtube === "object" && !Array.isArray(values.youtube)
      ? { ...(values.youtube as Record<string, unknown>) }
      : {};
  if (!canonical) {
    delete youtube.stepTimestampsVideoId;
  } else {
    youtube.stepTimestampsVideoId = canonical;
  }
  const next = { ...values };
  if (Object.keys(youtube).length === 0) {
    delete next.youtube;
  } else {
    next.youtube = youtube;
  }
  return next;
}

/** Pure: clear per-step timestamps and binding. */
export function clearStepVideoTimestamps(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const instructions = Array.isArray(values.instructions)
    ? (values.instructions as InstructionGroup[]).map((group) => {
        if (!group || typeof group !== "object") return group;
        if (!("stepVideoTimestamps" in group)) return group;
        const next = { ...group };
        delete next.stepVideoTimestamps;
        return next;
      })
    : values.instructions;

  let next: Record<string, unknown> = {
    ...values,
    instructions,
  };

  if (next.youtube && typeof next.youtube === "object" && !Array.isArray(next.youtube)) {
    const youtube = { ...(next.youtube as Record<string, unknown>) };
    delete youtube.stepTimestampsVideoId;
    next = { ...next, youtube };
  }

  return next;
}

function moveArrayItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from < 0 || from >= items.length) return items;
  const next = [...items];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed!);
  return next;
}

function padToLength(
  values: Array<number | null | undefined> | undefined,
  length: number,
): Array<number | null> {
  const next: Array<number | null> = [];
  for (let i = 0; i < length; i += 1) {
    next.push(values?.[i] ?? null);
  }
  return next;
}

/** Co-move steps + stepTimers + stepVideoTimestamps within a group. */
export function withMovedInstructionStep(
  group: InstructionGroup,
  from: number,
  to: number,
): InstructionGroup {
  const steps = moveArrayItem(group.steps, from, to);
  const hasTimers = Boolean(group.stepTimers?.length);
  const hasStamps = Boolean(group.stepVideoTimestamps?.length);

  const timers = hasTimers
    ? moveArrayItem(padToLength(group.stepTimers, group.steps.length), from, to)
    : undefined;
  const stamps = hasStamps
    ? moveArrayItem(padToLength(group.stepVideoTimestamps, group.steps.length), from, to)
    : undefined;

  const next: InstructionGroup = {
    ...group,
    steps,
  };

  if (hasTimers) {
    const alignedTimers = alignStepTimers(timers, steps.length);
    if (alignedTimers) next.stepTimers = alignedTimers;
    else delete next.stepTimers;
  }

  if (hasStamps) {
    const alignedStamps = alignStepVideoTimestamps(stamps, steps.length);
    if (alignedStamps) next.stepVideoTimestamps = alignedStamps;
    else delete next.stepVideoTimestamps;
  } else {
    delete next.stepVideoTimestamps;
  }

  return next;
}

/** Remove step index and co-remove timer/timestamp slots. */
export function withRemovedInstructionStep(
  group: InstructionGroup,
  stepIndex: number,
): InstructionGroup {
  const steps = group.steps.filter((_, i) => i !== stepIndex);
  const nextSteps = steps.length ? steps : [""];

  const timers = group.stepTimers?.length
    ? padToLength(group.stepTimers, group.steps.length).filter((_, i) => i !== stepIndex)
    : undefined;
  const stamps = group.stepVideoTimestamps?.length
    ? padToLength(group.stepVideoTimestamps, group.steps.length).filter(
        (_, i) => i !== stepIndex,
      )
    : undefined;

  const next: InstructionGroup = {
    ...group,
    steps: nextSteps,
  };

  if (timers) {
    const alignedTimers = alignStepTimers(timers, nextSteps.length);
    if (alignedTimers) next.stepTimers = alignedTimers;
    else delete next.stepTimers;
  } else {
    delete next.stepTimers;
  }

  if (stamps) {
    const alignedStamps = alignStepVideoTimestamps(stamps, nextSteps.length);
    if (alignedStamps) next.stepVideoTimestamps = alignedStamps;
    else delete next.stepVideoTimestamps;
  } else {
    delete next.stepVideoTimestamps;
  }

  return next;
}

/**
 * Insert a step at index (or append when index === length).
 * Co-inserts null timestamp/timer slots only when those arrays already exist.
 */
export function withInsertedInstructionStep(
  group: InstructionGroup,
  index: number,
  stepText = "",
): InstructionGroup {
  const at = Math.max(0, Math.min(index, group.steps.length));
  const steps = [...group.steps];
  steps.splice(at, 0, stepText);

  const next: InstructionGroup = {
    ...group,
    steps,
  };

  if (group.stepTimers?.length) {
    const padded = padToLength(group.stepTimers, group.steps.length);
    padded.splice(at, 0, null);
    const alignedTimers = alignStepTimers(padded, steps.length);
    if (alignedTimers) next.stepTimers = alignedTimers;
    else delete next.stepTimers;
  }

  if (group.stepVideoTimestamps?.length) {
    const padded = padToLength(group.stepVideoTimestamps, group.steps.length);
    padded.splice(at, 0, null);
    const alignedStamps = alignStepVideoTimestamps(padded, steps.length);
    if (alignedStamps) next.stepVideoTimestamps = alignedStamps;
    else delete next.stepVideoTimestamps;
  } else {
    delete next.stepVideoTimestamps;
  }

  return next;
}

/** Append empty step; does not invent timestamp metadata when absent. */
export function withAppendedInstructionStep(
  group: InstructionGroup,
  stepText = "",
): InstructionGroup {
  return withInsertedInstructionStep(group, group.steps.length, stepText);
}

/** Set/clear one step's video timestamp (seconds). Clears array+field when none remain. */
export function withStepVideoTimestampSeconds(
  group: InstructionGroup,
  stepIndex: number,
  seconds: number | null,
): InstructionGroup {
  if (stepIndex < 0 || stepIndex >= group.steps.length) return group;
  const next: InstructionGroup = { ...group };
  if (seconds == null) {
    if (!group.stepVideoTimestamps?.length) {
      delete next.stepVideoTimestamps;
      return next;
    }
    const padded = padToLength(group.stepVideoTimestamps, group.steps.length);
    padded[stepIndex] = null;
    const aligned = alignStepVideoTimestamps(padded, group.steps.length);
    if (aligned) next.stepVideoTimestamps = aligned;
    else delete next.stepVideoTimestamps;
    return next;
  }
  const normalized = normalizeStepVideoTimestampSeconds(seconds);
  if (normalized == null) return group;
  const padded = padToLength(group.stepVideoTimestamps, group.steps.length);
  padded[stepIndex] = normalized;
  next.stepVideoTimestamps = alignStepVideoTimestamps(padded, group.steps.length);
  return next;
}

/** Stable fingerprint of per-step timestamp payloads (for mutation detection). */
export function stepVideoTimestampsFingerprint(
  instructions: InstructionGroup[] | unknown,
): string {
  if (!Array.isArray(instructions)) return "";
  return JSON.stringify(
    instructions.map((group) => {
      if (!group || typeof group !== "object") return [];
      const stamps = (group as InstructionGroup).stepVideoTimestamps;
      if (!Array.isArray(stamps)) return [];
      return stamps.map((t) => normalizeStepVideoTimestampSeconds(t));
    }),
  );
}

/**
 * True when a raw slot is present but not a valid persisted timestamp.
 * Empty / null / undefined are allowed (no timestamp).
 */
export function isInvalidStepVideoTimestampInput(value: unknown): boolean {
  if (value == null || value === "") return false;
  return normalizeStepVideoTimestampSeconds(value) == null;
}

export function findInvalidStepVideoTimestampInputs(
  instructions: InstructionGroup[] | unknown,
): Array<{ groupIndex: number; stepIndex: number }> {
  const issues: Array<{ groupIndex: number; stepIndex: number }> = [];
  if (!Array.isArray(instructions)) return issues;
  instructions.forEach((group, groupIndex) => {
    if (!group || typeof group !== "object") return;
    const stamps = (group as InstructionGroup).stepVideoTimestamps;
    if (!Array.isArray(stamps)) return;
    stamps.forEach((value, stepIndex) => {
      if (isInvalidStepVideoTimestampInput(value)) {
        issues.push({ groupIndex, stepIndex });
      }
    });
  });
  return issues;
}

export type StepTimestampsSaveIntent = "" | "reconfirm" | "clear";

export type ApplyStepVideoTimestampsOnSaveResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; error: string; values: Record<string, unknown> };

/**
 * Server-authoritative #10 save policy.
 * Never silently rebinds timestamps to a replaced video ID.
 */
export function applyStepVideoTimestampsOnSave(input: {
  previousValues: Record<string, unknown> | null | undefined;
  nextValues: Record<string, unknown>;
  intent?: StepTimestampsSaveIntent | string | null;
  featureEnabled: boolean;
}): ApplyStepVideoTimestampsOnSaveResult {
  const previous = input.previousValues ?? {};
  let next: Record<string, unknown> = { ...input.nextValues };
  const intent = String(input.intent ?? "").trim() as StepTimestampsSaveIntent;

  // Always start from previous binding — ignore arbitrary client binding writes.
  const previousBinding = getStepTimestampsVideoIdFromValues(previous);
  next = withStepTimestampsVideoBinding(next, previousBinding);

  if (!input.featureEnabled) {
    if (!hasStepVideoTimestamps(previous.instructions)) {
      next = clearStepVideoTimestamps(next);
    }
    // Co-mutated timestamps from step edits may remain when previous had data.
    next = withStepTimestampsVideoBinding(next, previousBinding);
    return { ok: true, values: next };
  }

  if (intent === "clear") {
    return { ok: true, values: clearStepVideoTimestamps(next) };
  }

  const invalid = findInvalidStepVideoTimestampInputs(next.instructions);
  if (invalid.length) {
    return {
      ok: false,
      error: "One or more step video timestamps are invalid. Use a time such as 1:42 or 1:02:05.",
      values: next,
    };
  }

  // Normalize arrays onto instruction groups (defensive).
  if (Array.isArray(next.instructions)) {
    next = {
      ...next,
      instructions: (next.instructions as InstructionGroup[]).map((group) => {
        if (!group || typeof group !== "object") return group;
        const aligned = alignStepVideoTimestamps(
          group.stepVideoTimestamps,
          Array.isArray(group.steps) ? group.steps.length : 0,
        );
        const copy = { ...group };
        if (aligned) copy.stepVideoTimestamps = aligned;
        else delete copy.stepVideoTimestamps;
        return copy;
      }),
    };
  }

  const prevHas = hasStepVideoTimestamps(previous.instructions);
  const nextHas = hasStepVideoTimestamps(next.instructions);
  const stampsChanged =
    stepVideoTimestampsFingerprint(previous.instructions) !==
    stepVideoTimestampsFingerprint(next.instructions);
  const currentVideoId = getCanonicalRecipeVideoIdFromValues(next);

  if (intent === "reconfirm") {
    if (!nextHas) {
      return {
        ok: false,
        error: "Reconfirm requires at least one step video timestamp.",
        values: next,
      };
    }
    if (!currentVideoId) {
      return {
        ok: false,
        error: "Add a Recipe video before confirming step timestamps.",
        values: next,
      };
    }
    if (stampsChanged) {
      return {
        ok: false,
        error: "Confirm the current video before editing step timestamps, or clear them first.",
        values: next,
      };
    }
    next = withStepTimestampsVideoBinding(next, currentVideoId);
    return { ok: true, values: next };
  }

  if (!nextHas) {
    // Last timestamp removed (or never present) — drop binding.
    next = withStepTimestampsVideoBinding(next, null);
    return { ok: true, values: next };
  }

  if (!stampsChanged) {
    // Retention: keep previous binding even if video changed (mismatch / missing_video).
    return { ok: true, values: next };
  }

  // Timestamp mutation path.
  if (!currentVideoId) {
    return {
      ok: false,
      error: "Add a Recipe video before adding or editing step timestamps.",
      values: next,
    };
  }

  const bindingForCurrent = getStepTimestampsVideoIdFromValues(next);
  const activeForCurrent =
    bindingForCurrent != null && bindingForCurrent === currentVideoId;

  if (!prevHas) {
    // First genuine authoring — safe auto-bind.
    next = withStepTimestampsVideoBinding(next, currentVideoId);
    return { ok: true, values: next };
  }

  if (!activeForCurrent) {
    // unbound or mismatch — mutation blocked without explicit reconfirm.
    return {
      ok: false,
      error:
        "Step timestamps are inactive for the current video. Reconfirm for the current video or clear them before editing.",
      values: next,
    };
  }

  // Active mapping — allow edits; keep binding.
  next = withStepTimestampsVideoBinding(next, currentVideoId);
  return { ok: true, values: next };
}
