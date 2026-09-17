/**
 * Roadmap #11 — Deterministic internal Recipe link recommendations.
 *
 * Pure domain scoring only: no DB, env, Date.now, randomness, or LLM.
 * Generated suggestions are never persisted; Accept stores recipeId only.
 */

import { normalizeIngredientLookupKey } from "@/lib/ingredient-identity/normalize";
import type { CategoryGroup } from "@/lib/category-admin";

/** Max Admin suggestions returned after threshold + diversity. */
export const INTERNAL_LINK_RECOMMENDATION_LIMIT = 5;

/** Minimum score for a generated suggestion (method-only must stay below). */
export const INTERNAL_LINK_MIN_SCORE = 90;

/** Soft bound for future candidate batch adapters (current catalogue ≪ this). */
export const INTERNAL_LINK_CANDIDATE_QUERY_BOUND = 200;

/** Prefer ≤ this many suggestions that share the same Series (among ≥ threshold). */
export const INTERNAL_LINK_SERIES_DIVERSITY_MAX = 2;

export const INTERNAL_LINK_SCORE_SERIES = 200;
export const INTERNAL_LINK_SCORE_COLLECTION = 120;
export const INTERNAL_LINK_SCORE_MANUAL_RELATED = 100;
export const INTERNAL_LINK_SCORE_STRONG_CATEGORY = 90;
export const INTERNAL_LINK_SCORE_PRIMARY_CATEGORY = 70;
export const INTERNAL_LINK_SCORE_TYPE = 55;
export const INTERNAL_LINK_SCORE_CUISINE = 45;
export const INTERNAL_LINK_SCORE_INGREDIENT = 25;
export const INTERNAL_LINK_SCORE_INGREDIENT_CAP = 100;
export const INTERNAL_LINK_SCORE_METHOD = 15;
export const INTERNAL_LINK_SCORE_TAGS = 10;

export type InternalLinkIngredientImportance = "generic" | "weak" | "meaningful";

export type RecipeRecommendationIngredient = {
  /** Stable identity key (ingredient id or normalized lookup key). */
  identityKey: string;
  /** Display label for reasons (never salt/water when suppressed). */
  label: string;
};

export type RecipeRecommendationCategory = {
  id?: string;
  name: string;
  group: string;
};

export type RecipeRecommendationMembership = {
  id: string;
  name: string;
};

/**
 * Narrow scoring input — prepare from DB in a future adapter; keep pure here.
 * Status is optional: when present and not published, candidate is skipped.
 */
export type RecipeRecommendationCandidate = {
  id: string;
  title: string;
  publishedAt?: string | Date | null;
  status?: string | null;
  series: RecipeRecommendationMembership[];
  collections: RecipeRecommendationMembership[];
  categories: RecipeRecommendationCategory[];
  /** values.course — strong when both non-empty and equal */
  course?: string | null;
  typeId?: string | null;
  typeName?: string | null;
  cuisine?: string | null;
  method?: string | null;
  tags?: string[];
  ingredients?: RecipeRecommendationIngredient[];
  relatedRecipeIds?: string[];
};

export type RecommendationReasonKind =
  | "series"
  | "collection"
  | "manual_related"
  | "course"
  | "category"
  | "type"
  | "cuisine"
  | "method"
  | "tags"
  | "ingredients";

export type RecommendationReason = {
  kind: RecommendationReasonKind;
  label: string;
  /** Optional structured extras for Admin UI later. */
  seriesName?: string;
  collectionName?: string;
  categoryName?: string;
  ingredientCount?: number;
  ingredients?: string[];
};

export type ScoredInternalLinkRecommendation = {
  recipeId: string;
  score: number;
  reasons: RecommendationReason[];
};

const GENERIC_INGREDIENT_KEYS = new Set(
  [
    "salt",
    "kosher salt",
    "sea salt",
    "table salt",
    "water",
    "warm water",
    "cold water",
    "oil",
    "olive oil",
    "extra-virgin olive oil",
    "extra virgin olive oil",
    "vegetable oil",
    "canola oil",
    "pepper",
    "black pepper",
    "white pepper",
    "ground black pepper",
  ].map((item) => normalizeIngredientLookupKey(item)),
);

const WEAK_INGREDIENT_KEYS = new Set(
  [
    "flour",
    "all-purpose flour",
    "all purpose flour",
    "ap flour",
    "bread flour",
    "butter",
    "unsalted butter",
    "sugar",
    "granulated sugar",
    "white sugar",
    "brown sugar",
    "egg",
    "eggs",
    "large egg",
    "large eggs",
  ].map((item) => normalizeIngredientLookupKey(item)),
);

const STRONG_CATEGORY_GROUPS = new Set<CategoryGroup>(["course", "desserts", "holiday"]);

function normToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function publishedAtMs(value: string | Date | null | undefined): number {
  if (value == null || value === "") return 0;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : 0;
  }
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : 0;
}

function isPublishedStatus(status: unknown): boolean {
  if (status == null || status === "") return true; // omit status → treat as eligible in pure fixtures
  return normToken(status) === "published";
}

/**
 * Classify ingredient importance for #11 overlap scoring.
 * Uses normalized lookup keys; does not alter global ingredient identity.
 * Prefer classifying by display label when identityKey is an opaque id.
 */
export function classifyInternalLinkIngredientImportance(
  identityOrLabel: string,
): InternalLinkIngredientImportance {
  const key = normalizeIngredientLookupKey(identityOrLabel);
  if (!key) return "generic";
  if (GENERIC_INGREDIENT_KEYS.has(key)) return "generic";
  if (WEAK_INGREDIENT_KEYS.has(key)) return "weak";

  // Heuristics for unresolved / alias-expanded labels
  if (/\bsalt\b/.test(key) && !/salted (caramel|chocolate)/.test(key)) return "generic";
  if (/\b(water|pepper)\b/.test(key)) return "generic";
  if (/\boil\b/.test(key)) return "generic";
  if (/\b(flour|butter|sugar|eggs?)\b/.test(key)) return "weak";

  return "meaningful";
}

export function isGenericInternalLinkIngredient(identityOrLabel: string): boolean {
  return classifyInternalLinkIngredientImportance(identityOrLabel) === "generic";
}

function ingredientMatchKey(item: RecipeRecommendationIngredient): string {
  const fromId = String(item.identityKey ?? "").trim();
  if (fromId) return normalizeIngredientLookupKey(fromId) || fromId.toLowerCase();
  return normalizeIngredientLookupKey(item.label);
}

function formatIngredientReason(labels: string[]): RecommendationReason {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const label of labels) {
    const trimmed = String(label ?? "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  const shown = unique.slice(0, 3);
  const extra = unique.length - shown.length;
  const list =
    extra > 0 ? `${shown.join(", ")}, +${extra} more` : shown.join(", ");
  return {
    kind: "ingredients",
    label:
      unique.length === 1
        ? `Shares 1 ingredient: ${list}`
        : `Shares ${unique.length} ingredients: ${list}`,
    ingredientCount: unique.length,
    ingredients: unique,
  };
}

function scoreIngredientOverlap(
  source: RecipeRecommendationIngredient[] | undefined,
  candidate: RecipeRecommendationIngredient[] | undefined,
): { score: number; reason: RecommendationReason | null } {
  if (!source?.length || !candidate?.length) return { score: 0, reason: null };

  const sourceMap = new Map<string, RecipeRecommendationIngredient>();
  for (const item of source) {
    const key = ingredientMatchKey(item);
    if (!key) continue;
    if (!sourceMap.has(key)) sourceMap.set(key, item);
  }

  const sharedMeaningful: RecipeRecommendationIngredient[] = [];
  const seen = new Set<string>();
  for (const item of candidate) {
    const key = ingredientMatchKey(item);
    if (!key || seen.has(key) || !sourceMap.has(key)) continue;
    seen.add(key);
    const sourceItem = sourceMap.get(key)!;
    const label = sourceItem.label || item.label || key;
    // Classify by label (stable names); identityKey may be an opaque id.
    const importance = classifyInternalLinkIngredientImportance(label);
    if (importance === "meaningful") {
      sharedMeaningful.push({
        identityKey: key,
        label,
      });
    }
    // generic + weak contribute 0
  }

  if (sharedMeaningful.length === 0) return { score: 0, reason: null };

  const raw = sharedMeaningful.length * INTERNAL_LINK_SCORE_INGREDIENT;
  const score = Math.min(INTERNAL_LINK_SCORE_INGREDIENT_CAP, raw);
  return {
    score,
    reason: formatIngredientReason(sharedMeaningful.map((item) => item.label)),
  };
}

function firstSharedMembership(
  source: RecipeRecommendationMembership[],
  candidate: RecipeRecommendationMembership[],
): RecipeRecommendationMembership | null {
  if (!source.length || !candidate.length) return null;
  const byId = new Map(candidate.map((item) => [item.id, item]));
  // Deterministic: walk source order, then fall back to sorted shared ids
  for (const item of source) {
    const hit = byId.get(item.id);
    if (hit) return { id: hit.id, name: hit.name || item.name };
  }
  return null;
}

function primaryCategoryKey(categories: RecipeRecommendationCategory[]): string {
  const first = categories[0];
  if (!first) return "";
  if (first.id?.trim()) return `id:${first.id.trim()}`;
  return `name:${normToken(first.name)}`;
}

function categoryKey(category: RecipeRecommendationCategory): string {
  if (category.id?.trim()) return `id:${category.id.trim()}`;
  return `name:${normToken(category.name)}|group:${normToken(category.group)}`;
}

/**
 * Score one candidate against source. Pure. Does not apply threshold/limit.
 */
export function scoreInternalLinkRecommendation(
  source: RecipeRecommendationCandidate,
  candidate: RecipeRecommendationCandidate,
): ScoredInternalLinkRecommendation {
  const reasons: RecommendationReason[] = [];
  let score = 0;

  const sharedSeries = firstSharedMembership(source.series ?? [], candidate.series ?? []);
  if (sharedSeries) {
    score += INTERNAL_LINK_SCORE_SERIES;
    reasons.push({
      kind: "series",
      label: `Same series: ${sharedSeries.name || "Series"}`,
      seriesName: sharedSeries.name,
    });
  }

  const sharedCollection = firstSharedMembership(
    source.collections ?? [],
    candidate.collections ?? [],
  );
  if (sharedCollection) {
    score += INTERNAL_LINK_SCORE_COLLECTION;
    reasons.push({
      kind: "collection",
      label: `Same collection: ${sharedCollection.name || "Collection"}`,
      collectionName: sharedCollection.name,
    });
  }

  const sourceRelated = new Set(
    (source.relatedRecipeIds ?? []).map((id) => String(id).trim()).filter(Boolean),
  );
  const candidateRelated = new Set(
    (candidate.relatedRecipeIds ?? []).map((id) => String(id).trim()).filter(Boolean),
  );
  const manualRelated =
    sourceRelated.has(candidate.id) || candidateRelated.has(source.id);
  if (manualRelated) {
    score += INTERNAL_LINK_SCORE_MANUAL_RELATED;
    reasons.push({
      kind: "manual_related",
      label: "Already manually related",
    });
  }

  const sourceCourse = normToken(source.course);
  const candidateCourse = normToken(candidate.course);
  let awardedStrongCategory = false;
  if (sourceCourse && candidateCourse && sourceCourse === candidateCourse) {
    score += INTERNAL_LINK_SCORE_STRONG_CATEGORY;
    awardedStrongCategory = true;
    const labelCourse = String(source.course ?? "").trim() || sourceCourse;
    reasons.push({
      kind: "course",
      label: `Same course: ${labelCourse}`,
      categoryName: labelCourse,
    });
  }

  const sourceCats = source.categories ?? [];
  const candidateCats = candidate.categories ?? [];
  const candidateByKey = new Map(
    candidateCats.map((category) => [categoryKey(category), category]),
  );

  if (!awardedStrongCategory) {
    const strongShared = sourceCats.find((category) => {
      const group = normToken(category.group) as CategoryGroup;
      if (!STRONG_CATEGORY_GROUPS.has(group)) return false;
      if (group === "method") return false;
      return candidateByKey.has(categoryKey(category));
    });
    if (strongShared) {
      score += INTERNAL_LINK_SCORE_STRONG_CATEGORY;
      awardedStrongCategory = true;
      const name = strongShared.name.trim() || "Category";
      reasons.push({
        kind: "category",
        label: `Both categorized as ${name}`,
        categoryName: name,
      });
    }
  }

  const sourcePrimary = primaryCategoryKey(sourceCats);
  const candidatePrimary = primaryCategoryKey(candidateCats);
  if (
    sourcePrimary &&
    candidatePrimary &&
    sourcePrimary === candidatePrimary
  ) {
    // Avoid double-counting the same category already used as strong signal
    const primaryName = sourceCats[0]?.name?.trim() || "";
    const already =
      awardedStrongCategory &&
      reasons.some(
        (reason) =>
          (reason.kind === "category" || reason.kind === "course") &&
          reason.categoryName &&
          normToken(reason.categoryName) === normToken(primaryName),
      );
    if (!already) {
      score += INTERNAL_LINK_SCORE_PRIMARY_CATEGORY;
      reasons.push({
        kind: "category",
        label: primaryName
          ? `Same primary category: ${primaryName}`
          : "Same primary category",
        categoryName: primaryName || undefined,
      });
    }
  }

  const sourceTypeId = String(source.typeId ?? "").trim();
  const candidateTypeId = String(candidate.typeId ?? "").trim();
  const sourceTypeName = normToken(source.typeName);
  const candidateTypeName = normToken(candidate.typeName);
  if (
    (sourceTypeId && candidateTypeId && sourceTypeId === candidateTypeId) ||
    (sourceTypeName && candidateTypeName && sourceTypeName === candidateTypeName)
  ) {
    score += INTERNAL_LINK_SCORE_TYPE;
    const typeLabel =
      String(source.typeName ?? candidate.typeName ?? "").trim() || "same type";
    reasons.push({
      kind: "type",
      label: `Same type: ${typeLabel}`,
    });
  }

  const sourceCuisine = normToken(source.cuisine);
  const candidateCuisine = normToken(candidate.cuisine);
  if (sourceCuisine && candidateCuisine && sourceCuisine === candidateCuisine) {
    score += INTERNAL_LINK_SCORE_CUISINE;
    const cuisineLabel = String(source.cuisine ?? "").trim() || sourceCuisine;
    reasons.push({
      kind: "cuisine",
      label: `Same cuisine: ${cuisineLabel}`,
    });
  }

  const ingredientOverlap = scoreIngredientOverlap(source.ingredients, candidate.ingredients);
  if (ingredientOverlap.score > 0 && ingredientOverlap.reason) {
    score += ingredientOverlap.score;
    reasons.push(ingredientOverlap.reason);
  }

  const sourceMethod = normToken(source.method);
  const candidateMethod = normToken(candidate.method);
  if (sourceMethod && candidateMethod && sourceMethod === candidateMethod) {
    score += INTERNAL_LINK_SCORE_METHOD;
    const methodLabel = String(source.method ?? "").trim() || sourceMethod;
    reasons.push({
      kind: "method",
      label: `Same method: ${methodLabel}`,
    });
  }

  const sourceTags = new Set(
    (source.tags ?? []).map((tag) => normToken(tag)).filter(Boolean),
  );
  const sharedTagCount = (candidate.tags ?? []).filter((tag) =>
    sourceTags.has(normToken(tag)),
  ).length;
  if (sharedTagCount > 0) {
    score += INTERNAL_LINK_SCORE_TAGS;
    reasons.push({
      kind: "tags",
      label: sharedTagCount === 1 ? "Shares a tag" : `Shares ${sharedTagCount} tags`,
    });
  }

  return {
    recipeId: candidate.id,
    score,
    reasons,
  };
}

function compareRecommendations(
  a: ScoredInternalLinkRecommendation & {
    title: string;
    publishedAt: string | Date | null | undefined;
  },
  b: ScoredInternalLinkRecommendation & {
    title: string;
    publishedAt: string | Date | null | undefined;
  },
): number {
  if (b.score !== a.score) return b.score - a.score;
  const pub = publishedAtMs(b.publishedAt) - publishedAtMs(a.publishedAt);
  if (pub !== 0) return pub;
  const title = a.title.localeCompare(b.title, "en");
  if (title !== 0) return title;
  return a.recipeId.localeCompare(b.recipeId, "en");
}

/**
 * Diversity among above-threshold candidates only:
 * prefer ≤ INTERNAL_LINK_SERIES_DIVERSITY_MAX per overlapping/source Series.
 * Never fill with below-threshold items. Deferred strong same-Series candidates
 * may still be appended if slots remain.
 */
function applySeriesDiversity(
  ranked: Array<
    ScoredInternalLinkRecommendation & {
      title: string;
      publishedAt: string | Date | null | undefined;
      seriesIds: string[];
    }
  >,
  limit: number,
): ScoredInternalLinkRecommendation[] {
  const picked: typeof ranked = [];
  const deferred: typeof ranked = [];
  const seriesCounts = new Map<string, number>();

  for (const entry of ranked) {
    const seriesKey = entry.seriesIds[0] ?? "";
    const count = seriesKey ? seriesCounts.get(seriesKey) ?? 0 : 0;
    if (seriesKey && count >= INTERNAL_LINK_SERIES_DIVERSITY_MAX) {
      deferred.push(entry);
      continue;
    }
    picked.push(entry);
    if (seriesKey) seriesCounts.set(seriesKey, count + 1);
    if (picked.length >= limit) break;
  }

  if (picked.length < limit) {
    for (const entry of deferred) {
      picked.push(entry);
      if (picked.length >= limit) break;
    }
  }

  return picked.slice(0, limit).map(({ recipeId, score, reasons }) => ({
    recipeId,
    score,
    reasons,
  }));
}

/**
 * Recommend internal Recipe link targets.
 * Excludes: self, non-published (when status provided), already accepted.
 * Related shelf / manual related do NOT exclude.
 */
export function recommendInternalRecipeLinks(input: {
  source: RecipeRecommendationCandidate;
  candidates: RecipeRecommendationCandidate[];
  acceptedRecipeIds?: readonly string[];
  limit?: number;
  minScore?: number;
}): ScoredInternalLinkRecommendation[] {
  const sourceId = String(input.source.id ?? "").trim();
  const accepted = new Set(
    (input.acceptedRecipeIds ?? [])
      .map((id) => String(id).trim())
      .filter(Boolean),
  );
  const limit = input.limit ?? INTERNAL_LINK_RECOMMENDATION_LIMIT;
  const minScore = input.minScore ?? INTERNAL_LINK_MIN_SCORE;

  const scored: Array<
    ScoredInternalLinkRecommendation & {
      title: string;
      publishedAt: string | Date | null | undefined;
      seriesIds: string[];
    }
  > = [];

  for (const candidate of input.candidates) {
    const id = String(candidate.id ?? "").trim();
    if (!id || id === sourceId) continue;
    if (!isPublishedStatus(candidate.status)) continue;
    if (accepted.has(id)) continue;

    const result = scoreInternalLinkRecommendation(input.source, {
      ...candidate,
      id,
    });
    if (result.score < minScore) continue;
    if (result.reasons.length === 0) continue;

    // Diversity key: prefer Series overlapping source, else candidate's first Series (stable id order)
    const sourceSeriesIds = new Set((input.source.series ?? []).map((s) => s.id));
    const overlapping = (candidate.series ?? [])
      .map((s) => s.id)
      .filter((sid) => sourceSeriesIds.has(sid))
      .sort((a, b) => a.localeCompare(b, "en"));
    const fallbackSeries = (candidate.series ?? [])
      .map((s) => s.id)
      .sort((a, b) => a.localeCompare(b, "en"));
    const seriesIds = overlapping.length > 0 ? overlapping : fallbackSeries;

    scored.push({
      ...result,
      title: candidate.title ?? "",
      publishedAt: candidate.publishedAt,
      seriesIds,
    });
  }

  scored.sort(compareRecommendations);
  return applySeriesDiversity(scored, limit);
}
