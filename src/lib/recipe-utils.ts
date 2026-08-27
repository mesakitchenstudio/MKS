import type { Recipe } from "@/data/types";

export function filterRecipes(recipes: Recipe[], query: string): Recipe[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return recipes;

  return recipes.filter((recipe) => recipeSearchHaystack(recipe).includes(needle));
}

/** Same fields as /recipes search — used by SearchOverlay and discovery. */
export function recipeSearchHaystack(recipe: {
  title: string;
  excerpt: string;
  course: string;
  cuisine: string;
  method: string;
  holiday?: string;
  tags: string[];
  categories: string[];
  difficulty?: string;
  utensils?: string[];
  ingredients: { items: { item: string }[] }[];
}) {
  const categoryTokens = recipe.categories.flatMap((slug) => [slug, slug.replace(/-/g, " ")]);
  return [
    recipe.title,
    recipe.excerpt,
    recipe.course,
    recipe.cuisine,
    recipe.method,
    recipe.holiday || "",
    ...recipe.tags,
    ...categoryTokens,
    recipe.difficulty || "",
    ...(recipe.utensils || []),
    ...recipe.ingredients.flatMap((group) => group.items.map((item) => item.item)),
  ]
    .join(" ")
    .toLowerCase();
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
