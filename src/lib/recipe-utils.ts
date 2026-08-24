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
      recipe.difficulty || "",
      ...(recipe.utensils || []),
      ...recipe.ingredients.flatMap((group) => group.items.map((item) => item.item)),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(needle);
  });
}

export function bakeMinutes(recipe: Recipe) {
  return recipe.bakeMinutes || recipe.cookMinutes || 0;
}

export function restMinutes(recipe: Recipe) {
  return recipe.restMinutes || 0;
}

export function totalMinutes(recipe: Recipe) {
  return recipe.prepMinutes + bakeMinutes(recipe) + restMinutes(recipe);
}

export function formatTime(minutes: number): string {
  if (!minutes) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function difficultyLabel(value?: string) {
  if (value === "Easy") return "Easy 👌";
  if (value === "Medium") return "Medium";
  if (value === "Hard") return "Hard";
  return value || "Easy 👌";
}

export function isoDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `PT${hours}H${rest}M`;
  if (hours) return `PT${hours}H`;
  return `PT${rest}M`;
}
