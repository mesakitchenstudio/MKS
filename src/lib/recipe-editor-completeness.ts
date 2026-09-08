import { fieldValueHasContent } from "@/lib/field-content";
import { hasPublishableIngredients } from "@/lib/ingredient-groups";
import { evaluateRecipeFields } from "@/lib/recipe-editor-field-state";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import type { SchemaField } from "@/lib/ai-recipe/schema-version";

export type EditorSectionId = "basics" | "details" | "content" | "media" | "advanced";

export type EditorFieldShape = {
  key: string;
  label: string;
  kind: string;
  required: boolean;
};

export type MissingRequiredField = {
  path: string;
  key: string;
  label: string;
  kind: string;
  section: EditorSectionId;
};

export type ReviewableField = {
  path: string;
  key: string;
  label: string;
  section: EditorSectionId;
  confidence: NonNullable<RecipeAiMeta["confidenceByPath"][string]>["confidence"];
};

const DETAILS_KEYS = new Set([
  "difficulty",
  "prepMinutes",
  "bakeMinutes",
  "cookMinutes",
  "restMinutes",
  "utensils",
  "servings",
  "servingsUnit",
  "course",
  "method",
  "holiday",
  "cuisine",
  "tags",
]);
const CONTENT_KEYS = new Set([
  "intro",
  "whyItWorks",
  "keyIngredients",
  "tips",
  "faqs",
  "notes",
  "ingredients",
  "instructions",
]);
const MEDIA_KEYS = new Set(["imageAlt", "image", "youtubeUrl", "floatingYoutubeUrl", "youtube"]);
const ADVANCED_KEYS = new Set(["nutrition"]);

export function sectionForFieldKey(key: string): EditorSectionId {
  if (key === "title" || key === "excerpt" || key === "categoryIds" || key === "dishName") {
    return "basics";
  }
  if (DETAILS_KEYS.has(key)) return "details";
  if (CONTENT_KEYS.has(key)) return "content";
  if (MEDIA_KEYS.has(key)) return "media";
  if (ADVANCED_KEYS.has(key)) return "advanced";
  return "details";
}

/** Whether a required field's current value satisfies publish requirements. */
export function isRequiredFieldSatisfied(field: EditorFieldShape, value: unknown): boolean {
  if (!field.required) return true;

  switch (field.kind) {
    case "textarea":
    case "text":
    case "image":
      return String(value ?? "").trim().length > 0;
    case "number":
    case "minutes":
      return typeof value === "number" && !Number.isNaN(value);
    case "select":
      return String(value ?? "").trim().length > 0;
    case "boolean":
    case "nutrition":
      return true;
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
      return hasPublishableIngredients(value);
    }
    case "instructions": {
      const groups = Array.isArray(value) ? (value as { steps: string[] }[]) : [];
      return groups.some((group) =>
        (group.steps ?? []).some((step) => String(step ?? "").trim().length > 0),
      );
    }
    default:
      return fieldValueHasContent(value, field.kind);
  }
}

/**
 * Required fields that are currently empty/invalid for publish.
 * Does NOT count optional empty fields or AI provenance states.
 */
export function listMissingRequiredFields(input: {
  fields: EditorFieldShape[];
  title: string;
  values: Record<string, unknown>;
  excerpt?: string;
  categoryIds?: string[];
  aiMeta?: RecipeAiMeta | null;
  resolveSection?: (key: string) => EditorSectionId;
  typeFields?: SchemaField[];
}): MissingRequiredField[] {
  const sectionFor = input.resolveSection ?? sectionForFieldKey;
  const evaluation = evaluateRecipeFields({
    fields: input.fields,
    title: input.title,
    excerpt: input.excerpt ?? "",
    categoryIds: input.categoryIds ?? [],
    values: input.values,
    aiMeta: input.aiMeta,
    resolveSection: sectionFor,
    typeFields: input.typeFields,
  });
  return evaluation.nodes
    .filter((node) => node.blocking)
    .map((node) => ({
      path: node.path,
      key: node.key,
      label: node.label,
      kind: node.kind,
      section: node.section,
    }));
}

export function countMissingRequiredBySection(missing: MissingRequiredField[]) {
  const counts: Record<EditorSectionId, number> = {
    basics: 0,
    details: 0,
    content: 0,
    media: 0,
    advanced: 0,
  };
  for (const row of missing) {
    counts[row.section] += 1;
  }
  return counts;
}

export function missingRequiredForSection(
  missing: MissingRequiredField[],
  section: EditorSectionId,
): MissingRequiredField[] {
  return missing.filter((row) => row.section === section);
}

/**
 * Populated fields that may need human review (inferred/estimated/unknown).
 * Separate from missing-required completeness.
 */
export function listReviewableFields(input: {
  fields: EditorFieldShape[];
  title: string;
  excerpt: string;
  categoryIds: string[];
  values: Record<string, unknown>;
  aiMeta?: RecipeAiMeta | null;
  resolveSection?: (key: string) => EditorSectionId;
  typeFields?: SchemaField[];
}): ReviewableField[] {
  const sectionFor = input.resolveSection ?? sectionForFieldKey;
  const evaluation = evaluateRecipeFields({
    fields: input.fields,
    title: input.title,
    excerpt: input.excerpt,
    categoryIds: input.categoryIds,
    values: input.values,
    aiMeta: input.aiMeta,
    resolveSection: sectionFor,
    typeFields: input.typeFields,
  });
  return evaluation.nodes
    .filter((node) => node.needsReview)
    .map((node) => ({
      path: node.path,
      key: node.key,
      label: node.label,
      section: node.section,
      confidence:
        node.source === "from_video"
          ? "VERIFIED"
          : node.source === "inferred"
            ? "HIGH_CONFIDENCE_INFERENCE"
            : node.source === "staff"
              ? "ESTIMATED"
              : "UNKNOWN",
    }));
}

export function evaluateEditorRecipeFields(input: {
  fields: EditorFieldShape[];
  title: string;
  excerpt: string;
  categoryIds: string[];
  values: Record<string, unknown>;
  aiMeta?: RecipeAiMeta | null;
  resolveSection?: (key: string) => EditorSectionId;
  typeFields?: SchemaField[];
}) {
  return evaluateRecipeFields({
    fields: input.fields,
    title: input.title,
    excerpt: input.excerpt,
    categoryIds: input.categoryIds,
    values: input.values,
    aiMeta: input.aiMeta,
    resolveSection: input.resolveSection ?? sectionForFieldKey,
    typeFields: input.typeFields,
  });
}

export function countReviewableBySection(reviewable: ReviewableField[]) {
  const counts: Record<EditorSectionId, number> = {
    basics: 0,
    details: 0,
    content: 0,
    media: 0,
    advanced: 0,
  };
  for (const row of reviewable) {
    counts[row.section] += 1;
  }
  return counts;
}

/**
 * Map publish error keys to the same missing-required list for test parity.
 * Must not import the publishing-readiness module — a reverse edge created a client
 * circular graph that left getRecipePublishingReadiness undefined in RecipeEditor.
 */
export function publishErrorKeys(input: {
  title: string;
  fields: EditorFieldShape[];
  values: Record<string, unknown>;
  excerpt?: string;
  categoryIds?: string[];
  aiMeta?: RecipeAiMeta | null;
  resolveSection?: (key: string) => EditorSectionId;
  typeFields?: SchemaField[];
}): string[] {
  return missingRequiredKeys(listMissingRequiredFields(input));
}

export function missingRequiredKeys(missing: MissingRequiredField[]): string[] {
  return missing.map((row) => row.key);
}
