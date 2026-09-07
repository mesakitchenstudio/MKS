/**
 * Recipe scheduled publishing — deterministic editorial schedule.
 * YouTube Release Planner remains separate. Public status stays draft|published;
 * "Scheduled" is draft + scheduledPublishAt.
 */

import {
  formatIstanbulParts,
  zonedLocalToUtc,
} from "@/lib/youtube-data/release-planner";

export const RECIPE_SCHEDULE_TIMEZONE = "Europe/Istanbul";

export type RecipeScheduleState = "none" | "scheduled" | "published" | "draft";

export function normalizeRecipePublicationStatus(status: string): "published" | "draft" {
  return String(status || "").trim().toLowerCase() === "published" ? "published" : "draft";
}

export function isRecipeScheduled(input: {
  status: string;
  scheduledPublishAt?: Date | string | null;
}): boolean {
  if (normalizeRecipePublicationStatus(input.status) === "published") return false;
  return Boolean(input.scheduledPublishAt);
}

export function recipePublicationLabel(input: {
  status: string;
  scheduledPublishAt?: Date | string | null;
}): string {
  if (normalizeRecipePublicationStatus(input.status) === "published") return "Published";
  if (isRecipeScheduled(input)) return "Scheduled";
  return "Draft";
}

export function recipeScheduleState(input: {
  status: string;
  scheduledPublishAt?: Date | string | null;
}): RecipeScheduleState {
  if (normalizeRecipePublicationStatus(input.status) === "published") return "published";
  if (isRecipeScheduled(input)) return "scheduled";
  if (normalizeRecipePublicationStatus(input.status) === "draft") return "draft";
  return "none";
}

/** Parse datetime-local value as Europe/Istanbul wall clock → UTC Date. */
export function parseIstanbulDateTimeLocal(value: string): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  return zonedLocalToUtc({
    timeZone: RECIPE_SCHEDULE_TIMEZONE,
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h),
    minute: Number(mi),
  });
}

/** Format UTC instant for datetime-local input in Istanbul. */
export function formatIstanbulDateTimeLocal(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const parts = formatIstanbulParts(date);
  if (!parts.dateKey || !parts.time24 || parts.time24 === "—") return "";
  return `${parts.dateKey}T${parts.time24}`;
}

export function formatRecipeScheduleLabel(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const parts = formatIstanbulParts(date);
  if (!parts.dateKey || !parts.time24 || parts.time24 === "—") return "";
  return `${parts.dateKey} ${parts.time24} Istanbul`;
}

export function validateScheduledPublishAt(
  scheduledPublishAt: Date,
  now: Date = new Date(),
): { ok: true } | { ok: false; error: string } {
  if (Number.isNaN(scheduledPublishAt.getTime())) {
    return { ok: false, error: "Choose a valid publish time." };
  }
  // Allow a small skew for form submit latency.
  if (scheduledPublishAt.getTime() < now.getTime() - 60_000) {
    return { ok: false, error: "Scheduled publish time must be in the future." };
  }
  return { ok: true };
}

/** Pure decision for cron: should this due draft publish? */
export function decideScheduledRecipePublish(input: {
  status: string;
  scheduledPublishAt: Date | string | null | undefined;
  readinessStatus: "ready" | "ready_with_recommendations" | "not_ready";
  now?: Date;
}): { action: "publish" } | { action: "fail"; reason: string } | { action: "skip"; reason: string } {
  const now = input.now ?? new Date();
  if (normalizeRecipePublicationStatus(input.status) === "published") {
    return { action: "skip", reason: "already_published" };
  }
  if (!input.scheduledPublishAt) {
    return { action: "skip", reason: "not_scheduled" };
  }
  const due =
    typeof input.scheduledPublishAt === "string"
      ? new Date(input.scheduledPublishAt)
      : input.scheduledPublishAt;
  if (Number.isNaN(due.getTime()) || due.getTime() > now.getTime()) {
    return { action: "skip", reason: "not_due" };
  }
  if (input.readinessStatus === "not_ready") {
    return {
      action: "fail",
      reason: "Publishing readiness blocked scheduled publish. Fix the recipe and schedule again.",
    };
  }
  return { action: "publish" };
}

/**
 * Deterministic content failure clears the schedule (retry would fail the same way).
 * Transient/system failure keeps the schedule for the next cron attempt.
 */
export function scheduleFailureClearsSchedule(
  kind: "deterministic" | "transient",
): boolean {
  return kind === "deterministic";
}

/** Claim predicate for concurrent cron/human publish races. */
export function scheduledPublishClaimWhere(input: {
  recipeId: string;
  now: Date;
}) {
  return {
    id: input.recipeId,
    status: "draft" as const,
    scheduledPublishAt: { lte: input.now, not: null },
  };
}
