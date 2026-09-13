import type { Recipe } from "@/data/types";
import type { RecipeWithExtras } from "@/lib/recipe-timing";
import { publicRestMinutes } from "@/lib/recipe-timing";

/**
 * Shared search text normalization for catalogue + SearchOverlay.
 * Conservative: lowercase, trim, collapse whitespace, light punctuation —
 * no aggressive stemming.
 */
export function normalizeSearchText(input: string): string {
  return String(input ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\p{L}\p{N}\s'+.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function filterRecipes(recipes: Recipe[], query: string): Recipe[] {
  return searchRecipesByText(recipes, query).map((row) => row.recipe);
}

/** Same fields as /recipes search — used by SearchOverlay and discovery. */
export function recipeSearchHaystack(recipe: {
  title: string;
  excerpt: string;
  course: string;
  cuisine: string;
  method: string;
  holiday?: string;
  dishName?: string;
  typeName?: string;
  tags: string[];
  categories: string[];
  difficulty?: string;
  utensils?: string[];
  ingredients: { items: { item: string }[] }[];
}) {
  const categoryTokens = recipe.categories.flatMap((slug) => [slug, slug.replace(/-/g, " ")]);
  return normalizeSearchText(
    [
      recipe.title,
      recipe.dishName || "",
      recipe.typeName || "",
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
    ].join(" "),
  );
}

function fieldPrefixOrToken(haystack: string, needle: string) {
  const text = normalizeSearchText(haystack);
  if (!needle || !text) return false;
  if (text.startsWith(needle) || text.includes(` ${needle}`)) return true;
  return text.split(" ").some((token) => token.startsWith(needle));
}

/**
 * Deterministic relevance for free-text discovery.
 * Higher = better. Zero means no match.
 */
export function scoreRecipeTextMatch(
  recipe: Parameters<typeof recipeSearchHaystack>[0],
  query: string,
): number {
  const needle = normalizeSearchText(query);
  if (!needle) return 0;

  const title = normalizeSearchText(recipe.title);
  const dish = normalizeSearchText(recipe.dishName || "");
  const typeName = normalizeSearchText(recipe.typeName || "");
  const course = normalizeSearchText(recipe.course || "");
  const cuisine = normalizeSearchText(recipe.cuisine || "");
  const method = normalizeSearchText(recipe.method || "");
  const difficulty = normalizeSearchText(recipe.difficulty || "");
  const excerpt = normalizeSearchText(recipe.excerpt || "");
  const tags = (recipe.tags || []).map((tag) => normalizeSearchText(tag));
  const categories = (recipe.categories || []).flatMap((slug) => [
    normalizeSearchText(slug),
    normalizeSearchText(slug.replace(/-/g, " ")),
  ]);
  const ingredients = recipe.ingredients.flatMap((group) =>
    group.items.map((item) => normalizeSearchText(item.item)),
  );
  const utensils = (recipe.utensils || []).map((item) => normalizeSearchText(item));

  let score = 0;

  if (title === needle) score = Math.max(score, 1000);
  else if (title.startsWith(needle)) score = Math.max(score, 920);
  else if (fieldPrefixOrToken(recipe.title, needle)) score = Math.max(score, 860);
  else if (title.includes(needle)) score = Math.max(score, 800);

  if (dish === needle) score = Math.max(score, 980);
  else if (dish.startsWith(needle)) score = Math.max(score, 900);
  else if (dish && fieldPrefixOrToken(recipe.dishName || "", needle)) score = Math.max(score, 840);
  else if (dish.includes(needle)) score = Math.max(score, 780);

  if (categories.some((value) => value === needle || value.includes(needle))) {
    score = Math.max(score, 640);
  }
  if (typeName && (typeName === needle || typeName.includes(needle))) {
    score = Math.max(score, 620);
  }
  if (course && (course === needle || course.includes(needle))) {
    score = Math.max(score, 600);
  }

  if (
    ingredients.some(
      (value) => value === needle || value.startsWith(needle) || value.includes(needle),
    )
  ) {
    score = Math.max(score, 520);
  }

  if (
    tags.some((value) => value === needle || value.includes(needle)) ||
    (cuisine && (cuisine === needle || cuisine.includes(needle))) ||
    (method && (method === needle || method.includes(needle))) ||
    (difficulty && difficulty.includes(needle)) ||
    utensils.some((value) => value.includes(needle))
  ) {
    score = Math.max(score, 420);
  }

  if (excerpt.includes(needle)) score = Math.max(score, 280);

  if (score === 0 && recipeSearchHaystack(recipe).includes(needle)) {
    score = 120;
  }

  if (title.includes(needle)) {
    score += Math.max(0, 40 - Math.min(40, title.indexOf(needle)));
  }

  return score;
}

/**
 * Lightweight overlay ranking using title + precomputed haystack.
 * Title tiers match `scoreRecipeTextMatch`; haystack-only hits stay below title/dish.
 */
export function scoreOverlayRecipeMatch(
  recipe: { title: string; searchHaystack?: string },
  query: string,
): number {
  const needle = normalizeSearchText(query);
  if (!needle) return 0;

  const title = normalizeSearchText(recipe.title);
  let score = 0;
  if (title === needle) score = 1000;
  else if (title.startsWith(needle)) score = 920;
  else if (fieldPrefixOrToken(recipe.title, needle)) score = 860;
  else if (title.includes(needle)) score = 800;

  const haystack = recipe.searchHaystack || title;
  if (score === 0 && haystack.includes(needle)) {
    score = 120;
  }

  if (title.includes(needle)) {
    score += Math.max(0, 40 - Math.min(40, title.indexOf(needle)));
  }

  return score;
}

export function searchOverlayRecipesByText<T extends { title: string; searchHaystack?: string }>(
  recipes: T[],
  query: string,
): T[] {
  const needle = normalizeSearchText(query);
  if (!needle) return recipes;
  return recipes
    .map((recipe) => ({ recipe, score: scoreOverlayRecipeMatch(recipe, needle) }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.recipe.title.localeCompare(b.recipe.title),
    )
    .map((row) => row.recipe);
}

export function searchRecipesByText<T extends Parameters<typeof recipeSearchHaystack>[0]>(
  recipes: T[],
  query: string,
): Array<{ recipe: T; score: number }> {
  const needle = normalizeSearchText(query);
  if (!needle) {
    return recipes.map((recipe) => ({ recipe, score: 0 }));
  }

  return recipes
    .map((recipe) => ({ recipe, score: scoreRecipeTextMatch(recipe, needle) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.recipe.title.localeCompare(b.recipe.title);
    });
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

/**
 * Heat facts that contribute to countedHeatMinutes — for honest public/preview display.
 * When bake and cook are both > 0 and unequal, both rings are returned (Cooking then Baking).
 * Legacy mirrored rows (bake === cook) expose a single Baking fact so Total stays understandable.
 */
export function heatTimingRings(recipe: Recipe): HeatTimingRing[] {
  const bake = ovenBakeMinutes(recipe);
  const cook = stovetopCookMinutes(recipe);
  if (bake > 0 && cook > 0 && bake !== cook) {
    return [
      { minutes: cook, label: "Cooking" },
      { minutes: bake, label: "Baking" },
    ];
  }
  if (bake > 0) return [{ minutes: bake, label: "Baking" }];
  if (cook > 0) return [{ minutes: cook, label: "Cooking" }];
  return [];
}

/** Primary heat fact (first of heatTimingRings). Prefer heatTimingRings for full display. */
export function heatTimingRing(recipe: Recipe): HeatTimingRing | null {
  return heatTimingRings(recipe)[0] ?? null;
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
