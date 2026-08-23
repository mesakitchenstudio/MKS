import type { Recipe } from "@/data/types";

export function filterRecipes(recipes: Recipe[], query: string): Recipe[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return recipes;

  return recipes.filter((recipe) => {
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
