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
  const course = recipe.course.trim().toLowerCase();
  const categories = new Set(recipe.categories);
  const tags = new Set(recipe.tags.map((tag) => tag.toLowerCase()));

  const scored = (await getAllRecipes())
    .filter((item) => !excluded.has(item.slug))
    .map((item) => {
      let score = 0;
      if (seriesPeers.has(item.slug)) score += 100;
      if (course && item.course.trim().toLowerCase() === course) score += 40;
      const sharedCategories = item.categories.filter((category) => categories.has(category)).length;
      score += sharedCategories * 12;
      const sharedTags = item.tags.filter((tag) => tags.has(tag.toLowerCase())).length;
      score += sharedTags * 4;
      if (item.featured) score += 1;
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.title.localeCompare(a.item.title));

  if (scored.length >= limit) {
    return scored.slice(0, limit).map((entry) => entry.item);
  }

  const picked = new Set(scored.map((entry) => entry.item.slug));
  const fallback = (await getAllRecipes())
    .filter((item) => !excluded.has(item.slug) && !picked.has(item.slug))
    .slice(0, limit - scored.length);

  return [...scored.map((entry) => entry.item), ...fallback].slice(0, limit);
}
