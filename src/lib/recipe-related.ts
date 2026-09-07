import type { Recipe } from "@/data/types";
import type { WatchNextRecommendation } from "@/lib/youtube-data/watch-next-select";
import type { RecipeSeriesLink } from "@/lib/series-types";
import { getAllRecipes, type PublicRecipe } from "@/lib/recipes";

const TIMING_DEDUP_KEYS = new Set([
  "riseHours",
  "proofingHours",
  "restHours",
  "fermentationHours",
  "proofHours",
  "restingHours",
]);

/** Hide type-specific duration fields already shown in recipe-at-a-glance timing. */
export function isPublicTimingExtraRedundant(key: string): boolean {
  return TIMING_DEDUP_KEYS.has(key);
}

/** Slug shown in Next in Series / continued-viewing — exclude from related row. */
export function getContinuedViewingRecipeSlug(
  watchNext: WatchNextRecommendation | null,
  seriesLinks: RecipeSeriesLink[],
): string | null {
  const seriesNext = seriesLinks[0]?.nextItem?.recipeSlug;
  if (seriesNext) return seriesNext;
  if (watchNext?.recipeSlug) return watchNext.recipeSlug;
  return null;
}

export function scoreRelatedRecipe(
  recipe: Recipe,
  candidate: Recipe,
  seriesPeers: Set<string>,
): number {
  const course = recipe.course.trim().toLowerCase();
  const candidateCourse = candidate.course.trim().toLowerCase();
  const method = recipe.method.trim().toLowerCase();
  const candidateMethod = candidate.method.trim().toLowerCase();
  const categories = new Set(recipe.categories.map((item) => item.toLowerCase()));
  const tags = new Set(recipe.tags.map((tag) => tag.toLowerCase()));
  const primaryCategory = recipe.categories[0]?.toLowerCase() || "";

  let score = 0;
  if (seriesPeers.has(candidate.slug)) score += 200;
  if (course && candidateCourse === course) score += 90;

  if (recipe.typeName && candidate.typeName) {
    if (recipe.typeName.trim().toLowerCase() === candidate.typeName.trim().toLowerCase()) {
      score += 55;
    }
  }

  const sharedCategories = candidate.categories.filter((category) =>
    categories.has(category.toLowerCase()),
  );
  if (
    primaryCategory &&
    sharedCategories.some((category) => category.toLowerCase() === primaryCategory)
  ) {
    score += 70;
  }
  score += sharedCategories.length * 28;

  if (method && candidateMethod && method === candidateMethod) score += 40;

  const sharedTags = candidate.tags.filter((tag) => tags.has(tag.toLowerCase())).length;
  score += sharedTags * 10;
  return score;
}

/** Resolve optional editorial pins (Recipe.id order). Drops missing/unpublished/self. */
export function resolveManualRelatedRecipes(
  pool: Recipe[],
  manualRelatedIds: string[] | undefined,
  options: { excludeSlugs?: string[]; currentSlug?: string } = {},
): Recipe[] {
  if (!manualRelatedIds?.length) return [];
  const byId = new Map<string, Recipe>();
  for (const item of pool) {
    const id = item.id?.trim();
    if (id) byId.set(id, item);
  }
  const excluded = new Set([
    ...(options.currentSlug ? [options.currentSlug] : []),
    ...(options.excludeSlugs ?? []),
  ]);
  const resolved: Recipe[] = [];
  const seen = new Set<string>();
  for (const id of manualRelatedIds) {
    const item = byId.get(id.trim());
    if (!item || excluded.has(item.slug) || seen.has(item.slug)) continue;
    seen.add(item.slug);
    resolved.push(item);
  }
  return resolved;
}

export function rankRelatedRecipesFromPool(
  recipe: Recipe,
  pool: Recipe[],
  options: {
    limit?: number;
    seriesPeerSlugs?: string[];
    excludeSlugs?: string[];
    /** Optional ordered Recipe.id pins — shown first, then automatic fill. */
    manualRelatedIds?: string[];
  } = {},
): Recipe[] {
  const limit = options.limit ?? 3;
  const seriesPeers = new Set(options.seriesPeerSlugs ?? []);
  const excluded = new Set([recipe.slug, ...(options.excludeSlugs ?? [])]);
  const all = pool;

  const manual = resolveManualRelatedRecipes(all, options.manualRelatedIds, {
    excludeSlugs: options.excludeSlugs,
    currentSlug: recipe.slug,
  }).slice(0, limit);
  if (manual.length >= limit) return manual;

  const picked = new Set(manual.map((item) => item.slug));
  const remaining = limit - manual.length;

  const scored = all
    .filter((item) => !excluded.has(item.slug) && !picked.has(item.slug))
    .map((item) => ({
      item,
      score: scoreRelatedRecipe(recipe, item, seriesPeers),
      featured: Boolean(item.featured),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.featured) - Number(a.featured) ||
        a.item.title.localeCompare(b.item.title),
    );

  if (scored.length >= remaining) {
    return [...manual, ...scored.slice(0, remaining).map((entry) => entry.item)];
  }

  scored.forEach((entry) => picked.add(entry.item.slug));
  const course = recipe.course.trim().toLowerCase();
  const categories = new Set(recipe.categories.map((item) => item.toLowerCase()));
  const method = recipe.method.trim().toLowerCase();

  // Soft fallback: same course, category, type, or method only — no fabricated dessert padding.
  const softFallback = all
    .filter((item) => !excluded.has(item.slug) && !picked.has(item.slug))
    .filter((item) => {
      if (course && item.course.trim().toLowerCase() === course) return true;
      if (method && item.method.trim().toLowerCase() === method) return true;
      if (
        recipe.typeName &&
        item.typeName &&
        recipe.typeName.trim().toLowerCase() === item.typeName.trim().toLowerCase()
      ) {
        return true;
      }
      return item.categories.some((category) => categories.has(category.toLowerCase()));
    })
    .slice(0, remaining - scored.length);

  softFallback.forEach((item) => picked.add(item.slug));

  const related = [...manual, ...scored.map((entry) => entry.item), ...softFallback];

  if (related.length >= limit) {
    return related.slice(0, limit);
  }

  // Fill remaining slots from other published recipes so the discovery row
  // can show three cards when enough eligible recipes exist. Related/soft
  // matches stay first; this only pads after those are exhausted.
  const filler = all
    .filter((item) => !excluded.has(item.slug) && !picked.has(item.slug))
    .sort(
      (a, b) =>
        Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
        a.title.localeCompare(b.title),
    )
    .slice(0, limit - related.length);

  return [...related, ...filler].slice(0, limit);
}

export async function getRankedRelatedRecipes(
  recipe: Recipe,
  options: {
    limit?: number;
    seriesPeerSlugs?: string[];
    excludeSlugs?: string[];
    manualRelatedIds?: string[];
  } = {},
): Promise<PublicRecipe[]> {
  const all = await getAllRecipes();
  return rankRelatedRecipesFromPool(recipe, all, options) as PublicRecipe[];
}
