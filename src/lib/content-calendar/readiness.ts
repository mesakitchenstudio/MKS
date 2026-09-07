/**
 * Calendar readiness adapter — calls canonical getRecipePublishingReadiness only.
 * Does not redefine publishing rules.
 */

import type { SchemaField } from "@/lib/ai-recipe/schema-version";
import {
  getRecipePublishingReadiness,
  type RecipePublishingReadiness,
  type RecipePublishingReadinessInput,
  type RecipePublishingStatus,
} from "@/lib/recipe-publishing-readiness";

export type CalendarTypeFieldRow = {
  key: string;
  label: string;
  kind: string;
  required: boolean;
  helpText?: string;
  options?: string;
};

export function toCalendarEditorFields(fields: CalendarTypeFieldRow[]) {
  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    kind: field.kind,
    required: field.required,
  }));
}

export function toCalendarSchemaFields(fields: CalendarTypeFieldRow[]): SchemaField[] {
  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    kind: field.kind,
    required: field.required,
    helpText: field.helpText || "",
    options: (() => {
      try {
        const parsed = JSON.parse(field.options || "[]") as unknown;
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    })(),
  }));
}

export function buildCalendarReadinessInput(input: {
  title: string;
  slug: string;
  excerpt: string;
  typeId: string;
  values: Record<string, unknown>;
  categoryIds: string[];
  typeFields: CalendarTypeFieldRow[];
}): RecipePublishingReadinessInput {
  return {
    title: input.title,
    slug: input.slug,
    excerpt: input.excerpt,
    typeId: input.typeId,
    fields: toCalendarEditorFields(input.typeFields),
    values: input.values,
    categoryIds: input.categoryIds,
    typeFields: toCalendarSchemaFields(input.typeFields),
  };
}

export type CalendarScheduledReadiness = {
  status: RecipePublishingStatus;
  needsAttention: boolean;
  failedCheckIds: string[];
  readiness: RecipePublishingReadiness;
};

/** Compact Calendar signal from the same canonical readiness result as editor/cron/health. */
export function calendarScheduledReadinessFromCanonical(
  input: RecipePublishingReadinessInput,
): CalendarScheduledReadiness {
  const readiness = getRecipePublishingReadiness(input);
  return {
    status: readiness.status,
    needsAttention: readiness.status === "not_ready",
    failedCheckIds: readiness.required.filter((check) => !check.passed).map((check) => check.id),
    readiness,
  };
}
