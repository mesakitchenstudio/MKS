import type { Nutrition } from "@/data/types";

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
