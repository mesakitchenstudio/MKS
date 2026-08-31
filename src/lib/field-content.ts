import type { Nutrition } from "@/data/types";
import { formatTime } from "@/lib/recipe-utils";
import { youtubeMetadataEditorHasContent } from "@/lib/youtube-metadata-editor";

/** Field kinds that store a duration in minutes (see `minutes` in FIELD_KINDS). */
export function isMinutesDurationField(kind: string): boolean {
  return kind === "minutes";
}

/**
 * Type-specific number fields whose key ends with "Hours" store decimal hours
 * (e.g. riseHours = 4.5 → 4 h 30 min). Matches seeded fields like riseHours, chillHours.
 */
export function isHoursDurationField(key: string, kind: string): boolean {
  if (kind === "hours") return true;
  return kind === "number" && /Hours$/.test(key);
}

function asFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Human-readable public display for type-specific extra fields. */
export function formatPublicExtraFieldValue(input: {
  key: string;
  kind: string;
  value: unknown;
}): string {
  const { key, kind, value } = input;
  if (isMinutesDurationField(kind)) {
    const n = asFiniteNumber(value);
    return n == null ? String(value ?? "") : formatTime(Math.round(n));
  }
  if (isHoursDurationField(key, kind)) {
    const hours = asFiniteNumber(value);
    if (hours == null) return String(value ?? "");
    return formatTime(Math.round(hours * 60));
  }
  return String(value ?? "");
}

function isYoutubeMetadataEditorState(value: unknown): value is import("@/lib/youtube-metadata-editor").YoutubeMetadataEditorState {
  return Boolean(value && typeof value === "object" && "preserved" in (value as object));
}

/**
 * Whether a typed field value has meaningful public/admin content.
 *
 * Kind-aware emptiness (not a global "hide every zero"):
 * - text-like: null/undefined/blank/whitespace → empty
 * - number/minutes: emptyValue is 0, so 0 means not provided
 * - boolean: only `true` is content (default false = unset)
 * - lists/galleries/tags: empty or all-blank items → empty
 * - nutrition: all macro fields default to 0; any non-zero (incl. fiber/sugar) counts
 */
export function fieldValueHasContent(value: unknown, kind: string): boolean {
  switch (kind) {
    case "textarea":
      if (isYoutubeMetadataEditorState(value)) {
        return youtubeMetadataEditorHasContent(value);
      }
      return String(value ?? "").trim().length > 0;
    case "text":
    case "image":
      return String(value ?? "").trim().length > 0;
    case "number":
    case "minutes":
      return typeof value === "number" && !Number.isNaN(value) && value !== 0;
    case "boolean":
      return value === true;
    case "select":
      return String(value ?? "").trim().length > 0;
    case "gallery":
    case "list":
    case "tags": {
      const items = Array.isArray(value) ? (value as string[]) : [];
      return items.some((item) => String(item ?? "").trim().length > 0);
    }
    case "namedNotes": {
      const items = Array.isArray(value) ? (value as { name?: string; note?: string }[]) : [];
      return items.some(
        (item) => String(item.name ?? "").trim().length > 0 || String(item.note ?? "").trim().length > 0,
      );
    }
    case "ingredients": {
      const groups = Array.isArray(value) ? (value as { items: { item: string }[] }[]) : [];
      return groups.some((group) =>
        group.items.some((item) => String(item.item ?? "").trim().length > 0),
      );
    }
    case "instructions": {
      const groups = Array.isArray(value) ? (value as { steps: string[] }[]) : [];
      return groups.some((group) => group.steps.some((step) => step.trim().length > 0));
    }
    case "nutrition":
      return nutritionHasPublicContent(value);
    default:
      return String(value ?? "").trim().length > 0;
  }
}

function isMeaningfulNutritionNumber(value: unknown): boolean {
  return typeof value === "number" && !Number.isNaN(value) && value !== 0;
}

/** True when at least one nutrition figure was actually entered (not all default zeros). */
export function nutritionHasPublicContent(value: unknown): boolean {
  const row = (value || {}) as Partial<Nutrition> & Record<string, unknown>;
  return ["calories", "carbs", "protein", "fat", "fiber", "sugar"].some((key) =>
    isMeaningfulNutritionNumber(row[key]),
  );
}
