import { CORE_VALUE_KEYS } from "@/lib/fields";
import { getDb } from "@/lib/db";
import {
  computeRecipeSchemaVersion,
  type SchemaCategory,
  type SchemaField,
  type SchemaRecipeType,
} from "@/lib/ai-recipe/schema-version";
import { normalizeAiRecipeResponse, type NormalizedAiDraft } from "@/lib/ai-recipe/normalize";
import {
  listMissingAiFillableFields,
  isFieldEligibleForTargetedFill,
  PROTECTED_AI_FILL_KEYS,
  type MissingAiField,
} from "@/lib/ai-recipe/missing-fields";
import {
  buildRecipeAiFieldRegistry,
  confidenceForFieldDef,
  getRecipeFieldAiDef,
  normalizeFieldAiResponse,
  sourceNoteForFieldDef,
  type FieldAiIntent,
} from "@/lib/ai-recipe/field-ai-registry";
import { readValueAtEditorPath, applyValueAtEditorPath } from "@/lib/apply-editor-path";
import { generateTargetedRecipeFields } from "@/lib/ai-recipe/targeted-gemini";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { youtubeVideoId } from "@/lib/youtube";
import { normalizeYouTubeForGemini } from "@/lib/ai-recipe/youtube-url";

export type TargetedFillMode = "missing" | "fields";

export type TargetedFillRequest = {
  typeId: string;
  youtubeUrl?: string;
  recipeId?: string;
  mode: TargetedFillMode;
  /** Field keys or absolute paths (excerpt, values.cuisine, cuisine). */
  fields?: string[];
  current: {
    title: string;
    slug: string;
    excerpt: string;
    categoryIds?: string[];
    values: Record<string, unknown>;
  };
  aiMeta?: RecipeAiMeta | null;
  /** Explicit field regenerate (populated ok). */
  allowRepopulate?: boolean;
  /** generate | improve | alternative for single-field requests. */
  fieldIntent?: FieldAiIntent;
};

export type TargetedFillSuccess = {
  ok: true;
  cachedContextUsed: boolean;
  generationCacheUsed: boolean;
  model: string;
  requestedPaths: string[];
  draft: {
    title: string;
    slug: string;
    excerpt: string;
    categoryIds?: string[];
    values: Record<string, unknown>;
  };
  confidenceByPath: RecipeAiMeta["confidenceByPath"];
  latencyMs: number;
};

export type TargetedFillFailure = {
  ok: false;
  code: string;
  message: string;
  detail?: string;
  latencyMs: number;
};

function mapType(row: {
  id: string;
  name: string;
  slug: string;
  fields: {
    key: string;
    label: string;
    helpText: string;
    kind: string;
    required: boolean;
    options: string;
    sortOrder: number;
  }[];
}): SchemaRecipeType {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    fields: row.fields
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(
        (field): SchemaField => ({
          key: field.key,
          label: field.label,
          kind: field.kind,
          required: field.required,
          helpText: field.helpText,
          options: JSON.parse(field.options || "[]") as string[],
        }),
      ),
  };
}

function resolveRequestedFields(input: {
  mode: TargetedFillMode;
  fields: string[] | undefined;
  typeFields: SchemaField[];
  current: TargetedFillRequest["current"];
  aiMeta: RecipeAiMeta | null;
  allowRepopulate?: boolean;
}): MissingAiField[] {
  const registry = buildRecipeAiFieldRegistry(input.typeFields);

  if (input.mode === "missing") {
    let missing = listMissingAiFillableFields({
      fields: input.typeFields,
      title: input.current.title,
      slug: input.current.slug,
      excerpt: input.current.excerpt,
      categoryIds: input.current.categoryIds,
      values: input.current.values,
      aiMeta: input.aiMeta,
    }).missing;
    if (input.fields?.length) {
      const allowed = new Set(input.fields.map((path) => String(path).trim()).filter(Boolean));
      missing = missing.filter((row) => allowed.has(row.path));
    }
    return missing;
  }

  const requested = (input.fields ?? []).map((item) => String(item).trim()).filter(Boolean);
  const out: MissingAiField[] = [];

  for (const token of requested) {
    const path =
      token === "title" || token === "excerpt" || token === "categoryIds"
        ? token
        : token.startsWith("values.")
          ? token
          : `values.${token}`;

    const def = getRecipeFieldAiDef(path, input.typeFields);
    if (!def || def.strategy === "none" || def.strategy === "source_owned") continue;

    const value =
      path === "title"
        ? input.current.title
        : path === "excerpt"
          ? input.current.excerpt
          : path === "categoryIds"
            ? input.current.categoryIds ?? []
            : path.startsWith("values.")
              ? readValueAtEditorPath(input.current.values, path)
              : input.current.values[def.key];

    if (
      !isFieldEligibleForTargetedFill({
        path,
        key: def.key,
        kind: def.kind,
        value,
        title: input.current.title,
        excerpt: input.current.excerpt,
        categoryIds: input.current.categoryIds,
        aiMeta: input.aiMeta,
        allowRepopulate: input.allowRepopulate,
      })
    ) {
      continue;
    }

    out.push({
      path: def.path,
      key: def.key,
      label: def.label,
      kind: def.kind,
      reason: "empty",
      section: def.section,
      strategy: def.strategy,
    });
  }

  return out;
}

function pickCacheHints(draft: NormalizedAiDraft, paths: MissingAiField[]) {
  const hints: Record<string, unknown> = {};
  for (const row of paths) {
    if (row.path === "title" && draft.title) hints.title = draft.title;
    else if (row.path === "excerpt" && draft.excerpt) hints.excerpt = draft.excerpt;
    else if (row.path === "categoryIds" && draft.categoryIds.length) hints.categoryIds = draft.categoryIds;
    else if (row.key in draft.values) hints[row.path] = draft.values[row.key];
  }
  return hints;
}

function applyReturnedFields(input: {
  current: TargetedFillRequest["current"];
  requested: MissingAiField[];
  returned: Record<string, unknown>;
  registry: Map<string, import("@/lib/ai-recipe/field-ai-registry").RecipeAiFieldDef>;
  allowedCategoryIds?: Set<string>;
  categories?: import("@/lib/ai-recipe/schema-version").SchemaCategory[];
}): {
  draft: TargetedFillSuccess["draft"];
  confidenceByPath: RecipeAiMeta["confidenceByPath"];
} {
  const confidenceByPath: RecipeAiMeta["confidenceByPath"] = {};
  let nextValues = { ...input.current.values };
  let title = input.current.title;
  let excerpt = input.current.excerpt;
  let categoryIds = [...(input.current.categoryIds ?? [])];

  const allowed = new Set(input.requested.map((row) => row.path));

  for (const [rawPath, value] of Object.entries(input.returned)) {
    const path =
      rawPath === "title" ||
      rawPath === "excerpt" ||
      rawPath === "categoryIds" ||
      rawPath.startsWith("values.")
        ? rawPath
        : `values.${rawPath}`;
    if (!allowed.has(path) && !allowed.has(rawPath)) continue;

    const target = input.requested.find((row) => row.path === path || row.key === rawPath);
    if (!target) continue;

    const def = input.registry.get(target.path);

    if (target.path === "title") {
      const text = typeof value === "string" ? value : String((value as { value?: unknown })?.value ?? "");
      if (!text.trim()) continue;
      title = text.trim();
      confidenceByPath.title = {
        confidence: confidenceForFieldDef(def ?? null),
        sourceNote: sourceNoteForFieldDef(def ?? null),
      };
      continue;
    }

    if (target.path === "excerpt") {
      const text = typeof value === "string" ? value : String((value as { value?: unknown })?.value ?? "");
      if (!text.trim()) continue;
      excerpt = text.trim();
      confidenceByPath.excerpt = {
        confidence: confidenceForFieldDef(def ?? null),
        sourceNote: sourceNoteForFieldDef(def ?? null),
      };
      continue;
    }

    if (target.path === "categoryIds") {
      const resolved = normalizeFieldAiResponse({
        path: "categoryIds",
        raw: value,
        def: def ?? null,
        allowedCategoryIds: input.allowedCategoryIds ?? new Set(),
        categories: input.categories,
      });
      const ids = Array.isArray(resolved) ? resolved.map((id) => String(id)) : [];
      if (!ids.length) continue;
      const existing = new Set(categoryIds);
      categoryIds = [...categoryIds, ...ids.filter((id) => !existing.has(id))];
      confidenceByPath.categoryIds = {
        confidence: confidenceForFieldDef(def ?? null),
        sourceNote: sourceNoteForFieldDef(def ?? null),
      };
      continue;
    }

    const nested = target.path.startsWith("values.") && target.path.slice("values.".length).includes(".");
    const normalizedValue =
      nested && typeof value === "string"
        ? value.trim() || null
        : nested
          ? value
          : value;

    if (nested) {
      if (normalizedValue == null || (typeof normalizedValue === "string" && !normalizedValue.trim())) {
        continue;
      }
      nextValues = applyValueAtEditorPath(nextValues, target.path, normalizedValue);
      confidenceByPath[target.path] = {
        confidence: confidenceForFieldDef(def ?? null),
        sourceNote: sourceNoteForFieldDef(def ?? null),
      };
      continue;
    }

    nextValues[target.key] = value;
    confidenceByPath[target.path] = {
      confidence: confidenceForFieldDef(def ?? null),
      sourceNote: sourceNoteForFieldDef(def ?? null),
    };
  }

  return {
    draft: {
      title,
      slug: input.current.slug,
      excerpt,
      categoryIds,
      values: nextValues,
    },
    confidenceByPath,
  };
}

/**
 * Fill only requested/missing fields using recipe data + cached analysis + text Gemini.
 * Never invokes full-video analysis.
 */
export async function runTargetedRecipeFill(
  input: TargetedFillRequest,
): Promise<TargetedFillSuccess | TargetedFillFailure> {
  const started = Date.now();
  const db = getDb();

  const [types, categories, recipeType] = await Promise.all([
    db.recipeType.findMany({ include: { fields: true }, orderBy: { name: "asc" } }),
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.recipeType.findUnique({ where: { id: input.typeId }, include: { fields: true } }),
  ]);

  if (!recipeType) {
    return {
      ok: false,
      code: "invalid_type",
      message: "Unknown recipe type.",
      latencyMs: Date.now() - started,
    };
  }

  const selectedType = mapType(recipeType);
  const allTypes = types.map(mapType);
  const schemaCategories: SchemaCategory[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    group: category.group,
  }));
  const schemaVersion = computeRecipeSchemaVersion({
    types: allTypes,
    categories: schemaCategories,
    coreFieldKeys: CORE_VALUE_KEYS,
  });

  const aiMeta = input.aiMeta ?? null;
  const registry = buildRecipeAiFieldRegistry(selectedType.fields);
  const requested = resolveRequestedFields({
    mode: input.mode,
    fields: input.fields,
    typeFields: selectedType.fields,
    current: input.current,
    aiMeta,
    allowRepopulate: input.allowRepopulate,
  });

  if (!requested.length) {
    return {
      ok: true,
      cachedContextUsed: Boolean(aiMeta?.videoContext),
      generationCacheUsed: false,
      model: aiMeta?.model || "none",
      requestedPaths: [],
      draft: {
        title: input.current.title,
        slug: input.current.slug,
        excerpt: input.current.excerpt,
        categoryIds: input.current.categoryIds ?? [],
        values: { ...input.current.values },
      },
      confidenceByPath: {},
      latencyMs: Date.now() - started,
    };
  }

  let generationCacheUsed = false;
  let cacheHints: Record<string, unknown> | null = null;
  const youtubeUrl = String(input.youtubeUrl || aiMeta?.sourceUrl || "").trim();
  const normalized = youtubeUrl ? normalizeYouTubeForGemini(youtubeUrl) : null;
  const videoId =
    normalized?.videoId ||
    aiMeta?.videoContext?.linkedVideoId ||
    aiMeta?.sourceVideoId ||
    youtubeVideoId(youtubeUrl) ||
    "";

  if (videoId) {
    const cached = await db.aiRecipeGenerationCache.findUnique({
      where: {
        videoId_typeId_schemaVersion: {
          videoId,
          typeId: selectedType.id,
          schemaVersion: aiMeta?.schemaVersion || schemaVersion,
        },
      },
    });
    if (cached) {
      try {
        const raw = JSON.parse(cached.responseJson) as unknown;
        const draft = normalizeAiRecipeResponse({
          raw,
          typeId: selectedType.id,
          youtubeUrl: normalized?.canonicalUrl || youtubeUrl || `https://www.youtube.com/watch?v=${videoId}`,
          fields: selectedType.fields,
          allowedCategoryIds: new Set(schemaCategories.map((category) => category.id)),
          allowedTypeIds: new Set(allTypes.map((type) => type.id)),
        });
        cacheHints = pickCacheHints(draft, requested);
        generationCacheUsed = Object.keys(cacheHints).length > 0;
      } catch {
        cacheHints = null;
      }
    }
  }

  // Prefer cached draft values when present for empty targets (no Gemini call).
  if (generationCacheUsed && cacheHints && input.mode === "missing") {
    const fromCache = applyReturnedFields({
      current: input.current,
      requested,
      returned: cacheHints,
      registry,
      allowedCategoryIds: new Set(schemaCategories.map((category) => category.id)),
      categories: schemaCategories,
    });
    const filledPaths = Object.keys(fromCache.confidenceByPath);
    if (filledPaths.length === requested.length) {
      console.info("[ai-fill]", {
        operation: "targeted_fill_cache",
        recipeId: input.recipeId || null,
        fields: requested.map((row) => row.path),
        cacheHit: true,
        model: aiMeta?.model || "cache",
        latencyMs: Date.now() - started,
      });
      return {
        ok: true,
        cachedContextUsed: Boolean(aiMeta?.videoContext),
        generationCacheUsed: true,
        model: aiMeta?.model || "cache",
        requestedPaths: requested.map((row) => row.path),
        draft: fromCache.draft,
        confidenceByPath: fromCache.confidenceByPath,
        latencyMs: Date.now() - started,
      };
    }
  }

  const currentValuesByPath: Record<string, unknown> = {};
  for (const row of requested) {
    if (row.path === "title") currentValuesByPath.title = input.current.title;
    else if (row.path === "excerpt") currentValuesByPath.excerpt = input.current.excerpt;
    else if (row.path === "categoryIds") currentValuesByPath.categoryIds = input.current.categoryIds ?? [];
    else if (row.path.startsWith("values.")) {
      currentValuesByPath[row.path] = readValueAtEditorPath(input.current.values, row.path);
    } else {
      currentValuesByPath[row.path] = input.current.values[row.key];
    }
  }

  const generated = await generateTargetedRecipeFields({
    fields: requested.map((row) => ({
      ...row,
      def: registry.get(row.path) ?? null,
    })),
    current: {
      title: input.current.title,
      excerpt: input.current.excerpt,
      categoryIds: input.current.categoryIds,
      values: input.current.values,
    },
    videoContext: aiMeta?.videoContext,
    cacheHints,
    categories: schemaCategories,
    fieldIntent: input.fieldIntent,
    currentValuesByPath,
  });

  if (!generated.ok) {
    console.info("[ai-fill]", {
      operation: "targeted_fill",
      recipeId: input.recipeId || null,
      fields: requested.map((row) => row.path),
      cacheHit: generationCacheUsed,
      model: null,
      latencyMs: Date.now() - started,
      failureType: generated.error.code,
    });
    return {
      ok: false,
      code: generated.error.code,
      message: generated.error.message,
      detail: generated.error.detail,
      latencyMs: Date.now() - started,
    };
  }

  const applied = applyReturnedFields({
    current: input.current,
    requested,
    returned: generated.fields,
    registry,
    allowedCategoryIds: new Set(schemaCategories.map((category) => category.id)),
    categories: schemaCategories,
  });

  console.info("[ai-fill]", {
    operation: "targeted_fill",
    recipeId: input.recipeId || null,
    fields: requested.map((row) => row.path),
    cacheHit: generationCacheUsed || Boolean(aiMeta?.videoContext),
    model: generated.model,
    latencyMs: Date.now() - started,
  });

  return {
    ok: true,
    cachedContextUsed: Boolean(aiMeta?.videoContext),
    generationCacheUsed,
    model: generated.model,
    requestedPaths: requested.map((row) => row.path),
    draft: applied.draft,
    confidenceByPath: applied.confidenceByPath,
    latencyMs: Date.now() - started,
  };
}
