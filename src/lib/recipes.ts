import { categories } from "@/data/categories";
import { recipes } from "@/data/recipes";
import type { Category, Recipe } from "@/data/types";

export function getAllRecipes(): Recipe[] {
  return [...recipes].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getRecipeBySlug(slug: string): Recipe | undefined {
  return recipes.find((recipe) => recipe.slug === slug);
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((category) => category.slug === slug);
}

export function getRecipesByCategory(slug: string): Recipe[] {
  return getAllRecipes().filter((recipe) => recipe.categories.includes(slug));
}

export function getFeaturedRecipes(limit = 4): Recipe[] {
  return getAllRecipes()
    .filter((recipe) => recipe.featured)
    .slice(0, limit);
}

export function getSeasonalRecipes(limit = 4): Recipe[] {
  return getAllRecipes()
    .filter((recipe) => recipe.seasonal)
    .slice(0, limit);
}

export function getRecipesByTag(tag: string, limit = 6, excludeSlug?: string): Recipe[] {
  return getAllRecipes()
    .filter((recipe) => recipe.tags.includes(tag) && recipe.slug !== excludeSlug)
    .slice(0, limit);
}

export function getRelatedRecipes(recipe: Recipe, limit = 3): Recipe[] {
  const scored = getAllRecipes()
    .filter((item) => item.slug !== recipe.slug)
    .map((item) => {
      const sharedCategories = item.categories.filter((category) =>
        recipe.categories.includes(category),
      ).length;
      const sharedTags = item.tags.filter((tag) => recipe.tags.includes(tag)).length;
      return { item, score: sharedCategories * 2 + sharedTags };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((entry) => entry.item);
}

export function searchRecipes(query: string): Recipe[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return getAllRecipes();

  return getAllRecipes().filter((recipe) => {
    const haystack = [
      recipe.title,
      recipe.excerpt,
      recipe.course,
      recipe.cuisine,
      ...recipe.tags,
      ...recipe.categories,
      ...recipe.ingredients.flatMap((group) => group.items.map((item) => item.item)),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(needle);
  });
}

export function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export function isoDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `PT${hours}H${rest}M`;
  if (hours) return `PT${hours}H`;
  return `PT${rest}M`;
}
