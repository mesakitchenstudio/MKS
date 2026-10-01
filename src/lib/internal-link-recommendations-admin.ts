/**
 * Roadmap #11 — Admin recommendation query adapter.
 *
 * Builds narrow source/candidate contexts and calls the pure 11B scorer.
 * No N+1. No LLM. Recommendations are never persisted.
 */

import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import { parseRelatedRecipeIds } from "@/lib/recipe-related-overrides";
import {
  CONTEXTUAL_INTERNAL_LINK_MAX,
  getContextualInternalLinkIds,
  normalizeContextualInternalLinks,
} from "@/lib/contextual-internal-links";
import type { ContextualInternalLinkTargetInfo } from "@/lib/contextual-internal-links-save";
import {
  INTERNAL_LINK_CANDIDATE_QUERY_BOUND,
  recommendInternalRecipeLinks,
  type RecipeRecommendationCandidate,
  type RecipeRecommendationIngredient,
  type RecommendationReason,
} from "@/lib/internal-link-recommendations";

export type AdminInternalLinkSuggestion = {
  recipeId: string;
  title: string;
  slug: string;
  reasons: string[];
};

export type AdminInternalLinkAcceptedTarget = {
  recipeId: string;
  title: string;
  slug: string;
  status: string;
  /** false when Draft or missing */
  available: boolean;
  missing: boolean;
};

export type AdminInternalLinkPickerCandidate = {
  id: string;
  title: string;
  slug: string;
  status: string;
};

export type AdminInternalLinkRecommendationsPayload = {
  suggestions: AdminInternalLinkSuggestion[];
  acceptedTargets: AdminInternalLinkAcceptedTarget[];
  pickerCandidates: AdminInternalLinkPickerCandidate[];
  suggestionsError: boolean;
  acceptedTargetsError: boolean;
};

type RecipeRowForScoring = {
  id: string;
  title: string;
  slug: string;
  status: string;
  publishedAt: Date | null;
  relatedRecipeIds: string;
  values: string;
  typeId: string;
  type: { id: string; name: string };
  categories: Array<{
    category: { id: string; name: string; group: string };
  }>;
  seriesItems: Array<{
    series: { id: string; title: string };
  }>;
  recipeIngredients: Array<{
    ingredientId: string | null;
    authoredItem: string;
    authoredItemNorm: string;
    ingredient: { id: string; name: string } | null;
  }>;
};

const recipeSelectForScoring = {
  id: true,
  title: true,
  slug: true,
  status: true,
  publishedAt: true,
  relatedRecipeIds: true,
  values: true,
  typeId: true,
  type: { select: { id: true, name: true } },
  categories: {
    select: {
      category: { select: { id: true, name: true, group: true } },
    },
  },
  seriesItems: {
    select: {
      series: { select: { id: true, title: true } },
    },
  },
  recipeIngredients: {
    select: {
      ingredientId: true,
      authoredItem: true,
      authoredItemNorm: true,
      ingredient: { select: { id: true, name: true } },
    },
  },
} as const;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function ingredientsFromRow(row: RecipeRowForScoring): RecipeRecommendationIngredient[] {
  const out: RecipeRecommendationIngredient[] = [];
  const seen = new Set<string>();
  for (const item of row.recipeIngredients) {
    const identityKey = String(item.ingredientId || item.authoredItemNorm || "").trim();
    if (!identityKey || seen.has(identityKey)) continue;
    seen.add(identityKey);
    const label =
      String(item.ingredient?.name ?? "").trim() ||
      String(item.authoredItem ?? "").trim() ||
      identityKey;
    out.push({ identityKey, label });
  }
  return out;
}

function seriesFromRow(row: RecipeRowForScoring) {
  const seen = new Set<string>();
  const out: Array<{ id: string; name: string }> = [];
  for (const item of row.seriesItems) {
    const id = String(item.series?.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: String(item.series?.title ?? "").trim() || "Series" });
  }
  return out;
}

export function mapRecipeRowToRecommendationCandidate(
  row: RecipeRowForScoring,
): RecipeRecommendationCandidate {
  const values = parseValues(row.values);
  return {
    id: row.id,
    title: row.title,
    publishedAt: row.publishedAt,
    status: row.status,
    series: seriesFromRow(row),
    // Editorial Series is the public “collection” grouping in Mesa; member SavedCollections are excluded.
    collections: [],
    categories: row.categories.map((entry) => ({
      id: entry.category.id,
      name: entry.category.name,
      group: entry.category.group,
    })),
    course: String(values.course ?? "").trim() || null,
    typeId: row.typeId,
    typeName: row.type.name,
    cuisine: String(values.cuisine ?? "").trim() || null,
    method: String(values.method ?? "").trim() || null,
    tags: asStringArray(values.tags),
    ingredients: ingredientsFromRow(row),
    relatedRecipeIds: parseRelatedRecipeIds(row.relatedRecipeIds),
  };
}

function reasonLabels(reasons: RecommendationReason[]): string[] {
  return reasons.map((reason) => reason.label).filter((label) => label.trim().length > 0);
}

/**
 * Load Admin Internal links payload for a Recipe editor.
 * Isolates recommendation failures from accepted-target resolution.
 */
export async function loadAdminInternalLinkRecommendations(
  sourceRecipeId: string,
): Promise<AdminInternalLinkRecommendationsPayload> {
  const sourceId = String(sourceRecipeId ?? "").trim();
  const empty: AdminInternalLinkRecommendationsPayload = {
    suggestions: [],
    acceptedTargets: [],
    pickerCandidates: [],
    suggestionsError: false,
    acceptedTargetsError: false,
  };
  if (!sourceId) return empty;

  const db = getDb();

  let source: RecipeRowForScoring | null = null;
  try {
    source = (await db.recipe.findUnique({
      where: { id: sourceId },
      select: recipeSelectForScoring,
    })) as RecipeRowForScoring | null;
  } catch {
    return {
      ...empty,
      suggestionsError: true,
      acceptedTargetsError: true,
    };
  }
  if (!source) return empty;

  const acceptedIds = getContextualInternalLinkIds(parseValues(source.values), sourceId);

  let acceptedTargets: AdminInternalLinkAcceptedTarget[] = [];
  let acceptedTargetsError = false;
  try {
    if (acceptedIds.length) {
      const rows = await db.recipe.findMany({
        where: { id: { in: acceptedIds } },
        select: { id: true, title: true, slug: true, status: true },
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      acceptedTargets = acceptedIds.map((recipeId) => {
        const row = byId.get(recipeId);
        if (!row) {
          return {
            recipeId,
            title: "Target no longer available",
            slug: "",
            status: "missing",
            available: false,
            missing: true,
          };
        }
        const published = String(row.status).toLowerCase() === "published";
        return {
          recipeId,
          title: published ? row.title : row.title || "Target currently unavailable",
          slug: row.slug,
          status: row.status,
          available: published,
          missing: false,
        };
      });
    }
  } catch {
    acceptedTargetsError = true;
    acceptedTargets = acceptedIds.map((recipeId) => ({
      recipeId,
      title: "Target currently unavailable",
      slug: "",
      status: "unknown",
      available: false,
      missing: false,
    }));
  }

  let suggestions: AdminInternalLinkSuggestion[] = [];
  let pickerCandidates: AdminInternalLinkPickerCandidate[] = [];
  let suggestionsError = false;

  try {
    const published = (await db.recipe.findMany({
      where: {
        status: "published",
        id: { not: sourceId },
      },
      orderBy: [{ publishedAt: "desc" }, { title: "asc" }, { id: "asc" }],
      take: INTERNAL_LINK_CANDIDATE_QUERY_BOUND,
      select: recipeSelectForScoring,
    })) as RecipeRowForScoring[];

    pickerCandidates = published.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
    }));

    const sourceCandidate = mapRecipeRowToRecommendationCandidate(source);
    const candidates = published.map(mapRecipeRowToRecommendationCandidate);
    const scored = recommendInternalRecipeLinks({
      source: sourceCandidate,
      candidates,
      acceptedRecipeIds: acceptedIds,
    });

    const byId = new Map(published.map((row) => [row.id, row]));
    suggestions = scored
      .map((entry) => {
        const row = byId.get(entry.recipeId);
        if (!row) return null;
        return {
          recipeId: entry.recipeId,
          title: row.title,
          slug: row.slug,
          reasons: reasonLabels(entry.reasons),
        };
      })
      .filter((item): item is AdminInternalLinkSuggestion => Boolean(item));
  } catch {
    suggestionsError = true;
    suggestions = [];
    // Picker may still work from relatedCandidates on the page if this fails entirely.
    pickerCandidates = [];
  }

  return {
    suggestions,
    acceptedTargets,
    pickerCandidates,
    suggestionsError,
    acceptedTargetsError,
  };
}

/** Resolve target statuses for save validation (bounded IN query). */
export async function resolveContextualInternalLinkTargetsForSave(
  recipeIds: string[],
): Promise<Map<string, ContextualInternalLinkTargetInfo>> {
  const ids = [
    ...new Set(
      recipeIds.map((id) => String(id ?? "").trim()).filter(Boolean),
    ),
  ].slice(0, CONTEXTUAL_INTERNAL_LINK_MAX * 2);
  const map = new Map<string, ContextualInternalLinkTargetInfo>();
  if (!ids.length) return map;

  const db = getDb();
  const rows = await db.recipe.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true },
  });
  const found = new Set(rows.map((row) => row.id));
  for (const id of ids) {
    if (!found.has(id)) {
      map.set(id, { exists: false });
    }
  }
  for (const row of rows) {
    map.set(row.id, { exists: true, status: row.status });
  }
  return map;
}

export function parseSubmittedContextualInternalLinks(raw: unknown): unknown {
  if (raw == null) return undefined;
  if (typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

export function serializeContextualInternalLinksForForm(
  values: Record<string, unknown> | null | undefined,
  sourceRecipeId?: string,
): string {
  const normalized = normalizeContextualInternalLinks(
    values?.contextualInternalLinks,
    sourceRecipeId,
  );
  return JSON.stringify(normalized ?? []);
}

