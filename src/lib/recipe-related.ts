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
  const categories = new Set(recipe.categories.map((item) => item.toLowerCase()));
  const tags = new Set(recipe.tags.map((tag) => tag.toLowerCase()));
  const primaryCategory = recipe.categories[0]?.toLowerCase() || "";

  let score = 0;
  if (seriesPeers.has(candidate.slug)) score += 200;
  if (course && candidateCourse === course) score += 90;

  const sharedCategories = candidate.categories.filter((category) =>
    categories.has(category.toLowerCase()),
  );
  if (primaryCategory && sharedCategories.some((category) => category.toLowerCase() === primaryCategory)) {
    score += 70;
  }
  score += sharedCategories.length * 28;

  if (recipe.typeName && candidate.typeName) {
    if (recipe.typeName.trim().toLowerCase() === candidate.typeName.trim().toLowerCase()) {
      score += 50;
    }
  }

  const sharedTags = candidate.tags.filter((tag) => tags.has(tag.toLowerCase())).length;
  score += sharedTags * 8;
  if (candidate.featured) score += 1;
  return score;
}

export async function getRankedRelatedRecipes(
  recipe: Recipe,
  options: {
    limit?: number;
    seriesPeerSlugs?: string[];
    excludeSlugs?: string[];
  } = {},
): Promise<PublicRecipe[]> {
  const limit = options.limit ?? 3;
  const seriesPeers = new Set(options.seriesPeerSlugs ?? []);
  const excluded = new Set([recipe.slug, ...(options.excludeSlugs ?? [])]);
  const all = await getAllRecipes();

  const scored = all
    .filter((item) => !excluded.has(item.slug))
    .map((item) => ({ item, score: scoreRelatedRecipe(recipe, item, seriesPeers) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));

  if (scored.length >= limit) {
    return scored.slice(0, limit).map((entry) => entry.item);
  }

  const picked = new Set(scored.map((entry) => entry.item.slug));
  const course = recipe.course.trim().toLowerCase();
  const categories = new Set(recipe.categories.map((item) => item.toLowerCase()));

  // Soft fallback: same course/category only — avoid unrelated desserts on a bread page.
  const softFallback = all
    .filter((item) => !excluded.has(item.slug) && !picked.has(item.slug))
    .filter((item) => {
      if (course && item.course.trim().toLowerCase() === course) return true;
      return item.categories.some((category) => categories.has(category.toLowerCase()));
    })
    .slice(0, limit - scored.length);

  softFallback.forEach((item) => picked.add(item.slug));

  const generalFallback =
    scored.length + softFallback.length >= limit
      ? []
      : all
          .filter((item) => !excluded.has(item.slug) && !picked.has(item.slug))
          .slice(0, limit - scored.length - softFallback.length);

  return [
    ...scored.map((entry) => entry.item),
    ...softFallback,
    ...generalFallback,
  ].slice(0, limit);
}
