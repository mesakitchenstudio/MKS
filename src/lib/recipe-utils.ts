import type { Recipe } from "@/data/types";
import type { RecipeWithExtras } from "@/lib/recipe-timing";
import { publicRestMinutes } from "@/lib/recipe-timing";

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

export function ovenBakeMinutes(recipe: Recipe) {
  return recipe.bakeMinutes ?? 0;
}

export function stovetopCookMinutes(recipe: Recipe) {
  return recipe.cookMinutes ?? 0;
}

/** @deprecated Use ovenBakeMinutes — kept for callers expecting bakeMinutes(). */
export function bakeMinutes(recipe: Recipe) {
  return ovenBakeMinutes(recipe);
}

export function restMinutes(recipe: Recipe) {
  return recipe.restMinutes ?? 0;
}

export type HeatTimingRing = {
  minutes: number;
  label: "Baking" | "Cooking";
};

export function heatTimingRing(recipe: Recipe): HeatTimingRing | null {
  const bake = ovenBakeMinutes(recipe);
  const cook = stovetopCookMinutes(recipe);
  if (bake > 0) return { minutes: bake, label: "Baking" };
  if (cook > 0) return { minutes: cook, label: "Cooking" };
  return null;
}

/** Count oven + stovetop without double-counting legacy synced rows. */
export function countedHeatMinutes(recipe: Recipe) {
  const bake = ovenBakeMinutes(recipe);
  const cook = stovetopCookMinutes(recipe);
  if (bake > 0 && cook > 0 && bake !== cook) return bake + cook;
  return Math.max(bake, cook);
}

export function totalMinutes(recipe: Recipe | RecipeWithExtras) {
  const rest =
    "extras" in recipe && Array.isArray(recipe.extras)
      ? publicRestMinutes(recipe)
      : restMinutes(recipe);
  return recipe.prepMinutes + countedHeatMinutes(recipe) + rest;
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
