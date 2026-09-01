import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import {
  recipeFieldIsEmpty,
  type RecipeAiFieldDef,
} from "@/lib/ai-recipe/field-ai-registry";
import { isFieldLocked, isFieldProtectedFromBulkAi } from "@/lib/ai-recipe/field-state";
import { evaluateRecipeFields } from "@/lib/recipe-editor-field-state";
import type { SchemaField } from "@/lib/ai-recipe/schema-version";

/** Keys excluded from automatic Fill missing (structural / source-owned). */
export const PROTECTED_AI_FILL_KEYS = new Set([
  "ingredients",
  "instructions",
  "image",
  "youtube",
  "floatingYoutubeUrl",
  "youtubeUrl",
]);

export type MissingAiFieldReason = "empty" | "needs_input";

export type MissingAiField = {
  path: string;
  key: string;
  label: string;
  kind: string;
  reason: MissingAiFieldReason;
  section?: RecipeAiFieldDef["section"];
  strategy?: RecipeAiFieldDef["strategy"];
};

export type MissingAiFieldsResult = {
  missing: MissingAiField[];
  counts: {
    missing: number;
    verified: number;
    inferred: number;
    estimated: number;
  };
};

function confidenceAt(meta: RecipeAiMeta | null | undefined, path: string) {
  return meta?.confidenceByPath?.[path]?.confidence;
}

function isWholeProtectedKey(path: string, key: string): boolean {
  if (!PROTECTED_AI_FILL_KEYS.has(key)) return false;
  return path === key || path === `values.${key}`;
}

function isVerifiedPath(meta: RecipeAiMeta | null | undefined, path: string): boolean {
  return confidenceAt(meta, path) === "VERIFIED";
}

function isTargetedOnlyGranularPath(path: string): boolean {
  return (
    /^values\.ingredients\.\d+/.test(path) ||
    /^values\.instructions\.\d+/.test(path) ||
    /^values\.faqs\.\d+/.test(path) ||
    /^values\.keyIngredients\.\d+/.test(path)
  );
}

/**
 * Canonical list of AI-fillable fields that are empty or marked Needs input (UNKNOWN).
 * Driven by the central recipe AI field registry.
 */
export function listMissingAiFillableFields(input: {
  fields: SchemaField[];
  title: string;
  slug: string;
  excerpt: string;
  categoryIds?: string[];
  values: Record<string, unknown>;
  aiMeta?: RecipeAiMeta | null;
}): MissingAiFieldsResult {
  const meta = input.aiMeta ?? null;
  const editorFields = input.fields.map((field) => ({
    key: field.key,
    label: field.label,
    kind: field.kind,
    required: field.required,
  }));

  const evaluation = evaluateRecipeFields({
    fields: editorFields,
    title: input.title,
    excerpt: input.excerpt,
    categoryIds: input.categoryIds ?? [],
    values: input.values,
    aiMeta: meta,
    typeFields: input.fields,
  });

  const missing: MissingAiField[] = evaluation.nodes
    .filter((node) => node.aiFillEligible && !isTargetedOnlyGranularPath(node.path))
    .map((node) => ({
      path: node.path,
      key: node.key,
      label: node.label,
      kind: node.kind,
      reason:
        node.completeness === "partial" ||
        (node.completeness === "filled" && node.aiFillEligible)
          ? ("needs_input" as const)
          : ("empty" as const),
      section: node.section,
      strategy:
        node.aiStrategy && node.aiStrategy !== "none" && node.aiStrategy !== "source_owned"
          ? node.aiStrategy
          : undefined,
    }));

  return {
    missing,
    counts: {
      missing: missing.length,
      verified: evaluation.counts.fromVideo,
      inferred: evaluation.counts.needsReview,
      estimated: 0,
    },
  };
}

/** True when a specific field path is eligible for targeted Fill / Generate. */
export function isFieldEligibleForTargetedFill(input: {
  path: string;
  key: string;
  kind?: string;
  value: unknown;
  title?: string;
  excerpt?: string;
  categoryIds?: string[];
  aiMeta?: RecipeAiMeta | null;
  allowRepopulate?: boolean;
}): boolean {
  const meta = input.aiMeta ?? null;
  if (input.key === "slug") return false;
  if (isWholeProtectedKey(input.path, input.key)) return false;

  const empty = recipeFieldIsEmpty({
    path: input.path,
    kind: input.kind,
    value: input.value,
    title: input.title,
    excerpt: input.excerpt,
    categoryIds: input.categoryIds,
  });

  if (empty && !isFieldLocked(input.path, meta)) return true;
  if (isFieldProtectedFromBulkAi(input.path, meta) && !input.allowRepopulate) return false;

  if (input.allowRepopulate) return true;
  if (confidenceAt(meta, input.path) === "UNKNOWN") return true;
  if (isVerifiedPath(meta, input.path)) return false;
  return false;
}

export function countMissingBySection(missing: MissingAiField[]) {
  const counts: Record<string, number> = {
    basics: 0,
    details: 0,
    content: 0,
    media: 0,
    advanced: 0,
  };
  for (const row of missing) {
    const section = row.section || "details";
    counts[section] = (counts[section] ?? 0) + 1;
  }
  return counts;
}
