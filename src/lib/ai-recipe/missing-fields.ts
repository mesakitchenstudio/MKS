import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import {
  buildRecipeAiFieldRegistry,
  recipeFieldIsEmpty,
  type RecipeAiFieldDef,
} from "@/lib/ai-recipe/field-ai-registry";
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

function isHumanLocked(meta: RecipeAiMeta | null | undefined, path: string): boolean {
  return Boolean(meta?.fieldProvenance?.[path]?.humanModifiedAfterGeneration);
}

function isVerifiedPath(meta: RecipeAiMeta | null | undefined, path: string): boolean {
  return confidenceAt(meta, path) === "VERIFIED";
}

function valueForPath(input: {
  path: string;
  key: string;
  title: string;
  excerpt: string;
  categoryIds?: string[];
  values: Record<string, unknown>;
}): unknown {
  if (input.path === "title") return input.title;
  if (input.path === "excerpt") return input.excerpt;
  if (input.path === "categoryIds") return input.categoryIds ?? [];
  return input.values[input.key];
}

function pushIfMissing(
  missing: MissingAiField[],
  input: {
    def: RecipeAiFieldDef;
    value: unknown;
    meta: RecipeAiMeta | null;
    title: string;
    excerpt: string;
    categoryIds?: string[];
  },
) {
  const { def, meta } = input;
  if (def.strategy === "none" || def.strategy === "source_owned") return;
  if (PROTECTED_AI_FILL_KEYS.has(def.key)) return;
  if (isHumanLocked(meta, def.path)) return;

  const empty = recipeFieldIsEmpty({
    path: def.path,
    kind: def.kind,
    value: input.value,
    title: input.title,
    excerpt: input.excerpt,
    categoryIds: input.categoryIds,
  });
  const needsInput = confidenceAt(meta, def.path) === "UNKNOWN";

  if (!empty && !needsInput) return;
  if (!empty && isVerifiedPath(meta, def.path)) return;

  missing.push({
    path: def.path,
    key: def.key,
    label: def.label,
    kind: def.kind,
    reason: empty ? "empty" : "needs_input",
    section: def.section,
    strategy: def.strategy,
  });
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
  const missing: MissingAiField[] = [];
  const registry = buildRecipeAiFieldRegistry(input.fields);

  for (const def of registry.values()) {
    if (def.key === "slug") continue;
    pushIfMissing(missing, {
      def,
      value: valueForPath({
        path: def.path,
        key: def.key,
        title: input.title,
        excerpt: input.excerpt,
        categoryIds: input.categoryIds,
        values: input.values,
      }),
      meta,
      title: input.title,
      excerpt: input.excerpt,
      categoryIds: input.categoryIds,
    });
  }

  const summary = meta?.summary;
  return {
    missing,
    counts: {
      missing: missing.length,
      verified: summary?.verified ?? 0,
      inferred: summary?.inferred ?? 0,
      estimated: summary?.estimated ?? 0,
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
  if (PROTECTED_AI_FILL_KEYS.has(input.key)) return false;
  if (isHumanLocked(meta, input.path)) return false;

  const empty = recipeFieldIsEmpty({
    path: input.path,
    kind: input.kind,
    value: input.value,
    title: input.title,
    excerpt: input.excerpt,
    categoryIds: input.categoryIds,
  });

  if (empty) return true;
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
