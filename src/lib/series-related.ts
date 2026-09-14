/**
 * Deterministic Related Collections scoring (no AI, no personalization, no schema).
 */

export type RelatedSeriesScoringCandidate = {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  syncMode: string;
  /** Published recipe IDs visible on the public Collection. */
  publishedRecipeIds: string[];
  /** Unique category slugs from those published recipes. */
  categorySlugs: string[];
  /** Unique recipe type names from those published recipes. */
  typeNames: string[];
  /** Publicly renderable item count (recipes and/or videos). */
  visibleItemCount: number;
  isPublished: boolean;
};

export type RelatedSeriesScoreResult = {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  score: number;
  sharedRecipeCount: number;
  sharedCategoryCount: number;
  sharedTypeCount: number;
  syncModeBonus: number;
};

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function intersectionSize(a: string[], b: Set<string>): number {
  let n = 0;
  for (const value of a) {
    if (b.has(value)) n += 1;
  }
  return n;
}

export function scoreRelatedSeriesCandidate(
  current: RelatedSeriesScoringCandidate,
  candidate: RelatedSeriesScoringCandidate,
): RelatedSeriesScoreResult | null {
  if (candidate.id === current.id) return null;
  if (!candidate.isPublished) return null;
  if (candidate.visibleItemCount <= 0) return null;

  const currentRecipes = new Set(uniqueStrings(current.publishedRecipeIds));
  const sharedRecipeCount = intersectionSize(
    uniqueStrings(candidate.publishedRecipeIds),
    currentRecipes,
  );
  const currentCategories = new Set(uniqueStrings(current.categorySlugs));
  const sharedCategoryCount = intersectionSize(
    uniqueStrings(candidate.categorySlugs),
    currentCategories,
  );
  const currentTypes = new Set(uniqueStrings(current.typeNames));
  const sharedTypeCount = intersectionSize(uniqueStrings(candidate.typeNames), currentTypes);

  const syncModeBonus =
    current.syncMode.trim() &&
    candidate.syncMode.trim() &&
    current.syncMode.trim() === candidate.syncMode.trim()
      ? 1
      : 0;

  const score =
    sharedRecipeCount * 10 + sharedCategoryCount * 3 + sharedTypeCount * 2 + syncModeBonus;

  // A: at least one shared published recipe (score will be >= 10).
  const qualifiesBySharedRecipe = sharedRecipeCount >= 1 && score >= 10;
  // B: score >= 6 from at least two distinct non-recipe overlap signals (category + type).
  const nonRecipeSignalCount =
    (sharedCategoryCount > 0 ? 1 : 0) + (sharedTypeCount > 0 ? 1 : 0);
  const qualifiesByTaxonomy = score >= 6 && nonRecipeSignalCount >= 2;

  if (!qualifiesBySharedRecipe && !qualifiesByTaxonomy) return null;

  return {
    id: candidate.id,
    slug: candidate.slug,
    title: candidate.title,
    sortOrder: candidate.sortOrder,
    score,
    sharedRecipeCount,
    sharedCategoryCount,
    sharedTypeCount,
    syncModeBonus,
  };
}

/**
 * Rank related Collections. Max 3. Deterministic tie-break:
 * score desc → shared recipes desc → sortOrder asc → title asc.
 */
export function selectRelatedSeries(
  current: RelatedSeriesScoringCandidate,
  candidates: RelatedSeriesScoringCandidate[],
  limit = 3,
): RelatedSeriesScoreResult[] {
  const seen = new Set<string>();
  const scored: RelatedSeriesScoreResult[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const result = scoreRelatedSeriesCandidate(current, candidate);
    if (result) scored.push(result);
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.sharedRecipeCount !== a.sharedRecipeCount) {
      return b.sharedRecipeCount - a.sharedRecipeCount;
    }
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });

  return scored.slice(0, Math.max(0, limit));
}
