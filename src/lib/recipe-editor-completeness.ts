import { fieldValueHasContent } from "@/lib/field-content";
import { recipeFieldIsEmpty } from "@/lib/ai-recipe/field-ai-registry";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { youtubeVideoId } from "@/lib/youtube";
import {
  validateYoutubeMetadataEditorState,
  type YoutubeMetadataEditorState,
} from "@/lib/youtube-metadata-editor";

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
  "dishName",
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
  if (key === "title" || key === "excerpt" || key === "categoryIds") return "basics";
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
      const groups = Array.isArray(value)
        ? (value as { items: { item: string }[] }[])
        : [];
      return groups.some((group) =>
        (group.items ?? []).some((item) => String(item.item ?? "").trim().length > 0),
      );
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
  resolveSection?: (key: string) => EditorSectionId;
}): MissingRequiredField[] {
  const missing: MissingRequiredField[] = [];
  const sectionFor = input.resolveSection ?? sectionForFieldKey;

  if (!String(input.title ?? "").trim()) {
    missing.push({
      path: "title",
      key: "title",
      label: "Title",
      kind: "text",
      section: "basics",
    });
  }

  for (const field of input.fields) {
    if (!field.required) continue;
    const value = input.values[field.key];
    if (isRequiredFieldSatisfied(field, value)) continue;
    missing.push({
      path: `values.${field.key}`,
      key: field.key,
      label: field.label,
      kind: field.kind,
      section: sectionFor(field.key),
    });
  }

  return missing;
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
}): ReviewableField[] {
  const meta = input.aiMeta;
  if (!meta?.confidenceByPath) return [];

  const reviewable: ReviewableField[] = [];
  const sectionFor = input.resolveSection ?? sectionForFieldKey;
  const pushIfReviewable = (path: string, key: string, label: string, value: unknown, kind: string) => {
    const annotation = meta.confidenceByPath[path];
    if (!annotation) return;
    if (annotation.confidence === "VERIFIED") return;
    if (recipeFieldIsEmpty({ path, kind, value, title: input.title, excerpt: input.excerpt, categoryIds: input.categoryIds })) {
      return;
    }
    reviewable.push({
      path,
      key,
      label,
      section: sectionFor(key),
      confidence: annotation.confidence,
    });
  };

  pushIfReviewable("title", "title", "Title", input.title, "text");
  pushIfReviewable("excerpt", "excerpt", "Excerpt", input.excerpt, "textarea");

  for (const field of input.fields) {
    pushIfReviewable(`values.${field.key}`, field.key, field.label, input.values[field.key], field.kind);
  }

  return reviewable;
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

/** Shared publish validator — tab completeness uses the same required-field rules. */
export function validateRecipeForPublish(input: {
  title: string;
  fields: EditorFieldShape[];
  values: Record<string, unknown>;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const row of listMissingRequiredFields(input)) {
    if (row.key === "title") {
      errors.title = "Title is required before publishing.";
    } else {
      errors[row.key] = `${row.label} is required before publishing.`;
    }
  }

  const youtubeUrl = String(input.values.youtubeUrl ?? "").trim();
  if (youtubeUrl && !youtubeVideoId(youtubeUrl)) {
    errors.youtubeUrl = "Enter a valid YouTube watch or youtu.be URL.";
  }

  const youtubeState = input.values.youtube as YoutubeMetadataEditorState | undefined;
  if (youtubeState && typeof youtubeState === "object") {
    const youtubeIssues = validateYoutubeMetadataEditorState(youtubeState);
    if (youtubeIssues.length) {
      errors.youtube = youtubeIssues[0]?.message ?? "Fix YouTube metadata before publishing.";
    }
  }

  return errors;
}

/** Map publish error keys to the same missing-required list for test parity. */
export function publishErrorKeys(input: {
  title: string;
  fields: EditorFieldShape[];
  values: Record<string, unknown>;
}): string[] {
  return Object.keys(validateRecipeForPublish(input)).filter(
    (key) => key !== "youtube" && key !== "youtubeUrl",
  );
}

export function missingRequiredKeys(missing: MissingRequiredField[]): string[] {
  return missing.map((row) => row.key);
}
