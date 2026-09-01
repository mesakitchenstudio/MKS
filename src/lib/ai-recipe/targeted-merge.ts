import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { emptyAiSummary, tallyConfidence } from "@/lib/ai-recipe/types";
import { buildProvenanceAfterAiApply } from "@/lib/ai-recipe/field-state";
import { applyValueAtEditorPath, readValueAtEditorPath } from "@/lib/apply-editor-path";

/**
 * Apply a targeted AI fill draft into editor state without touching unrelated fields.
 */
export function mergeTargetedFillIntoEditor(input: {
  current: {
    title: string;
    slug: string;
    excerpt: string;
    categoryIds?: string[];
    values: Record<string, unknown>;
  };
  draft: {
    title?: string;
    excerpt: string;
    categoryIds?: string[];
    values: Record<string, unknown>;
  };
  requestedPaths: string[];
  confidenceByPath: RecipeAiMeta["confidenceByPath"];
  aiMeta: RecipeAiMeta | null;
}): {
  title: string;
  excerpt: string;
  categoryIds: string[];
  values: Record<string, unknown>;
  aiMeta: RecipeAiMeta | null;
} {
  const allowed = new Set(input.requestedPaths);
  let nextValues = { ...input.current.values };
  let title = input.current.title;
  let excerpt = input.current.excerpt;
  let categoryIds = [...(input.current.categoryIds ?? [])];

  if (allowed.has("title") && input.draft.title?.trim()) {
    title = input.draft.title.trim();
  }

  if (allowed.has("excerpt") && input.draft.excerpt.trim()) {
    excerpt = input.draft.excerpt;
  }

  if (allowed.has("categoryIds") && input.draft.categoryIds?.length) {
    const existing = new Set(categoryIds);
    categoryIds = [...categoryIds, ...input.draft.categoryIds.filter((id) => !existing.has(id))];
  }

  for (const path of allowed) {
    if (path === "excerpt" || path === "categoryIds") continue;
    if (!path.startsWith("values.")) continue;
    const remainder = path.slice("values.".length);
    const isNested = remainder.includes(".");
    const topKey = remainder.split(".")[0] ?? "";
    const draftValue = isNested
      ? readValueAtEditorPath(input.draft.values, path)
      : input.draft.values[topKey];
    if (draftValue !== undefined) {
      nextValues = applyValueAtEditorPath(nextValues, path, draftValue);
    }
  }

  if (!input.aiMeta) {
    return { title, excerpt, categoryIds, values: nextValues, aiMeta: null };
  }

  const confidenceByPath = { ...input.aiMeta.confidenceByPath };
  const summary = emptyAiSummary();
  for (const [path, annotation] of Object.entries(input.confidenceByPath)) {
    if (!allowed.has(path)) continue;
    confidenceByPath[path] = annotation;
  }
  for (const annotation of Object.values(confidenceByPath)) {
    tallyConfidence(annotation.confidence, summary);
  }

  const fieldProvenance = { ...(input.aiMeta.fieldProvenance ?? {}) };
  for (const path of allowed) {
    const value =
      path === "title"
        ? title
        : path === "excerpt"
          ? excerpt
          : path === "categoryIds"
            ? categoryIds
            : path.startsWith("values.")
              ? readValueAtEditorPath(nextValues, path)
              : undefined;
    const previous = input.aiMeta.fieldProvenance?.[path];
    const annotation = input.confidenceByPath[path];
    fieldProvenance[path] = buildProvenanceAfterAiApply({
      path,
      value,
      confidence: annotation?.confidence,
      previous,
    });
  }

  return {
    title,
    excerpt,
    categoryIds,
    values: nextValues,
    aiMeta: {
      ...input.aiMeta,
      confidenceByPath,
      summary,
      fieldProvenance,
    },
  };
}

/** Extract a single field value from a targeted fill draft for suggestion preview. */
export function extractTargetedFieldValue(input: {
  path: string;
  draft: { title?: string; excerpt: string; categoryIds?: string[]; values: Record<string, unknown> };
}): unknown {
  if (input.path === "title") return input.draft.title ?? "";
  if (input.path === "excerpt") return input.draft.excerpt;
  if (input.path === "categoryIds") return input.draft.categoryIds ?? [];
  if (input.path.startsWith("values.")) {
    return readValueAtEditorPath(input.draft.values, input.path);
  }
  return undefined;
}
