import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { emptyAiSummary, tallyConfidence } from "@/lib/ai-recipe/types";

/**
 * Apply a targeted AI fill draft into editor state without touching unrelated fields.
 */
export function mergeTargetedFillIntoEditor(input: {
  current: {
    title: string;
    slug: string;
    excerpt: string;
    values: Record<string, unknown>;
  };
  draft: {
    excerpt: string;
    values: Record<string, unknown>;
  };
  requestedPaths: string[];
  confidenceByPath: RecipeAiMeta["confidenceByPath"];
  aiMeta: RecipeAiMeta | null;
}): {
  excerpt: string;
  values: Record<string, unknown>;
  aiMeta: RecipeAiMeta | null;
} {
  const allowed = new Set(input.requestedPaths);
  const nextValues = { ...input.current.values };
  let excerpt = input.current.excerpt;

  if (allowed.has("excerpt") && input.draft.excerpt.trim()) {
    excerpt = input.draft.excerpt;
  }

  for (const path of allowed) {
    if (path === "excerpt") continue;
    if (!path.startsWith("values.")) continue;
    const key = path.slice("values.".length);
    if (key in input.draft.values) {
      nextValues[key] = input.draft.values[key];
    }
  }

  if (!input.aiMeta) {
    return { excerpt, values: nextValues, aiMeta: null };
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
      path === "excerpt" ? excerpt : path.startsWith("values.") ? nextValues[path.slice(7)] : undefined;
    fieldProvenance[path] = {
      aiGenerated: true,
      aiGeneratedValue: value,
      humanModifiedAfterGeneration: false,
    };
  }

  return {
    excerpt,
    values: nextValues,
    aiMeta: {
      ...input.aiMeta,
      confidenceByPath,
      summary,
      fieldProvenance,
    },
  };
}
