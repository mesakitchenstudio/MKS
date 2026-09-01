import type { Recipe } from "@/data/types";
import { normalizeRecipeImageSrc, RECIPE_IMAGE_FALLBACK } from "@/lib/recipe-images";

/**
 * Homepage promotion is stricter than /recipes catalogue listing.
 * Image-content accuracy (correct dish) remains editorial; this gate only
 * excludes empty/broken/fallback imagery and incomplete card copy.
 */
export function isHomepageEligibleRecipe(recipe: Recipe): boolean {
  if ("status" in recipe && recipe.status === "draft") return false;
  if (!recipe.slug?.trim() || !recipe.title?.trim()) return false;
  if (!recipe.excerpt?.trim()) return false;

  const normalized = normalizeRecipeImageSrc(recipe.image);
  if (!normalized) return false;
  if (normalized === RECIPE_IMAGE_FALLBACK) return false;

  return true;
}

export function homepageEligibleRecipes(recipes: Recipe[]): Recipe[] {
  return recipes.filter(isHomepageEligibleRecipe);
}
