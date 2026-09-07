import type { Recipe } from "@/data/types";
import {
  PRIMARY_CATEGORY_LABELS,
  PRIMARY_PUBLIC_FILTERS,
  type PrimaryCategorySlug,
  recipeMatchesPrimaryCategory,
} from "@/lib/recipe-primary-taxonomy";
import { hasRecipeYoutube } from "@/lib/recipe-youtube";
import {
  normalizeSearchText,
  searchRecipesByText,
  totalMinutes,
} from "@/lib/recipe-utils";

export type RecipeSort = "latest" | "alpha";

/**
 * Time filter semantics: total commitment minutes
 * (prep + counted heat + rest), matching card `totalMinutes`.
 * Recipes with totalMinutes === 0 are excluded from timed buckets.
 */
export type DiscoveryTimeFilter = "30" | "60" | "120" | "over";

export type RecipeDiscoveryParams = {
  q?: string;
  category?: string;
  collection?: string;
  sort?: RecipeSort;
  /** Max total minutes: 30 / 60 / 120, or over (>120). */
  time?: DiscoveryTimeFilter;
  /** `1` when only recipes with a resolvable YouTube video. */
  video?: boolean;
  /** Exact cuisine label (case-insensitive match). */
  cuisine?: string;
  /** Exact method label (case-insensitive match). */
  method?: string;
};

export const DISCOVERY_CATEGORIES = PRIMARY_PUBLIC_FILTERS;

export const DISCOVERY_SORTS: { id: RecipeSort; label: string }[] = [
  { id: "latest", label: "Latest" },
  { id: "alpha", label: "A–Z" },
];

export const DISCOVERY_TIME_OPTIONS: { id: DiscoveryTimeFilter; label: string }[] = [
  { id: "30", label: "Under 30 min" },
  { id: "60", label: "Under 1 hour" },
  { id: "120", label: "1–2 hours" },
  { id: "over", label: "2+ hours" },
];

export type DiscoveryAppliedChip = {
  key: string;
  label: string;
  clear: Partial<RecipeDiscoveryParams>;
};

export type DiscoverySuggestion =
  | { kind: "recipe"; slug: string; title: string; score: number }
  | { kind: "category"; id: string; label: string }
  | { kind: "cuisine"; id: string; label: string };

function isPrimaryCategorySlug(value: string): value is PrimaryCategorySlug {
  return value in PRIMARY_CATEGORY_LABELS;
}

function matchesCategory(recipe: Recipe, category: string) {
  if (isPrimaryCategorySlug(category)) {
    return recipeMatchesPrimaryCategory(recipe, category);
  }
  return recipe.categories.includes(category);
}

export function recipeMatchesDiscoveryCategory(recipe: Recipe, category: string) {
  return matchesCategory(recipe, category);
}

function parseTimeFilter(raw: string | undefined): DiscoveryTimeFilter | undefined {
  if (raw === "30" || raw === "60" || raw === "120" || raw === "over") return raw;
  return undefined;
}

function parseVideoFilter(raw: string | undefined): boolean | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes") return true;
  return undefined;
}

export function cuisineFilterValue(cuisine: string) {
  return normalizeSearchText(cuisine);
}

export function parseDiscoveryParams(
  input: Record<string, string | string[] | undefined> | URLSearchParams,
): RecipeDiscoveryParams {
  const get = (key: string) => {
    if (input instanceof URLSearchParams) return input.get(key) || undefined;
    const value = input[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const sort = get("sort");
  const category = get("category");
  const cuisine = get("cuisine")?.trim();
  const method = get("method")?.trim();

  return {
    q: get("q")?.trim() || undefined,
    category: category && category !== "all" ? category : undefined,
    collection: get("collection")?.trim() || undefined,
    sort: sort === "alpha" ? "alpha" : sort === "latest" ? "latest" : undefined,
    time: parseTimeFilter(get("time")?.trim()),
    video: parseVideoFilter(get("video")),
    cuisine: cuisine || undefined,
    method: method || undefined,
  };
}

export function buildRecipesUrl(params: RecipeDiscoveryParams) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (params.collection) search.set("collection", params.collection);
  if (params.sort && params.sort !== "latest") search.set("sort", params.sort);
  if (params.time) search.set("time", params.time);
  if (params.video) search.set("video", "1");
  if (params.cuisine) search.set("cuisine", params.cuisine);
  if (params.method) search.set("method", params.method);
  const query = search.toString();
  return query ? `/recipes?${query}` : "/recipes";
}

export function sortRecipeList(recipes: Recipe[], sort: RecipeSort = "latest") {
  const list = [...recipes];
  if (sort === "alpha") {
    return list.sort((a, b) => a.title.localeCompare(b.title));
  }
  // Public "Latest" is publication order — editorial edits must not resurface old recipes.
  return list.sort((a, b) => {
    const publishedDiff =
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    if (publishedDiff !== 0) return publishedDiff;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Time buckets use totalMinutes (prep + heat + rest).
 * Untimed recipes (0) never match a timed filter.
 */
export function recipeMatchesDiscoveryTime(recipe: Recipe, time: DiscoveryTimeFilter) {
  const minutes = totalMinutes(recipe);
  if (!minutes || minutes < 1) return false;
  if (time === "30") return minutes <= 30;
  if (time === "60") return minutes <= 60;
  if (time === "120") return minutes > 60 && minutes <= 120;
  return minutes > 120;
}

export function recipeMatchesDiscoveryCuisine(recipe: Recipe, cuisine: string) {
  const wanted = cuisineFilterValue(cuisine);
  if (!wanted) return false;
  return cuisineFilterValue(recipe.cuisine || "") === wanted;
}

export function recipeMatchesDiscoveryMethod(recipe: Recipe, method: string) {
  const wanted = cuisineFilterValue(method);
  if (!wanted) return false;
  return cuisineFilterValue(recipe.method || "") === wanted;
}

export function listDiscoveryCuisines(recipes: Recipe[]) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const recipe of recipes) {
    const label = recipe.cuisine?.trim();
    if (!label) continue;
    const key = cuisineFilterValue(label);
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { label, count: 1 });
  }
  return [...counts.values()]
    .filter((row) => row.count >= 1)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function listDiscoveryMethods(recipes: Recipe[]) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const recipe of recipes) {
    const label = recipe.method?.trim();
    if (!label) continue;
    const key = cuisineFilterValue(label);
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { label, count: 1 });
  }
  return [...counts.values()]
    .filter((row) => row.count >= 1)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function applyDiscoveryFilters(
  recipes: Recipe[],
  params: RecipeDiscoveryParams,
  collectionSlugs: Record<string, string[]>,
) {
  let result = [...recipes];
  let preservedCollectionOrder = false;

  if (params.collection) {
    const slugs = collectionSlugs[params.collection];
    if (slugs?.length) {
      const order = new Map(slugs.map((slug, index) => [slug, index]));
      result = result
        .filter((recipe) => order.has(recipe.slug))
        .sort((a, b) => (order.get(a.slug)! - order.get(b.slug)!));
      preservedCollectionOrder = true;
    } else {
      result = [];
    }
  }

  if (params.category) {
    result = result.filter((recipe) => matchesCategory(recipe, params.category!));
  }

  if (params.time) {
    result = result.filter((recipe) => recipeMatchesDiscoveryTime(recipe, params.time!));
  }

  if (params.video) {
    result = result.filter((recipe) => hasRecipeYoutube(recipe));
  }

  if (params.cuisine) {
    result = result.filter((recipe) => recipeMatchesDiscoveryCuisine(recipe, params.cuisine!));
  }

  if (params.method) {
    result = result.filter((recipe) => recipeMatchesDiscoveryMethod(recipe, params.method!));
  }

  if (params.q) {
    const ranked = searchRecipesByText(result, params.q);
    result = ranked.map((row) => row.recipe);
    if (params.sort === "alpha") {
      return sortRecipeList(result, "alpha");
    }
    // Relevance order wins for text search unless A–Z was chosen.
    return result;
  }

  if (preservedCollectionOrder && !params.sort) {
    return result;
  }

  return sortRecipeList(result, params.sort ?? "latest");
}

export function hasActiveDiscoveryFilters(params: RecipeDiscoveryParams) {
  return Boolean(
    params.q ||
      params.category ||
      params.collection ||
      params.sort ||
      params.time ||
      params.video ||
      params.cuisine ||
      params.method,
  );
}

export function primaryCategoryLabel(slug: string) {
  if (isPrimaryCategorySlug(slug)) return PRIMARY_CATEGORY_LABELS[slug];
  return slug;
}

export function discoveryTimeLabel(time: DiscoveryTimeFilter) {
  return DISCOVERY_TIME_OPTIONS.find((option) => option.id === time)?.label ?? time;
}

export function buildDiscoveryAppliedChips(
  params: RecipeDiscoveryParams,
  collectionTitles: Record<string, string> = {},
): DiscoveryAppliedChip[] {
  const chips: DiscoveryAppliedChip[] = [];
  if (params.q) {
    chips.push({ key: "q", label: `Search: “${params.q}”`, clear: { q: undefined } });
  }
  if (params.category) {
    chips.push({
      key: "category",
      label: primaryCategoryLabel(params.category),
      clear: { category: undefined },
    });
  }
  if (params.collection) {
    chips.push({
      key: "collection",
      label: collectionTitles[params.collection] ?? params.collection,
      clear: { collection: undefined },
    });
  }
  if (params.time) {
    chips.push({
      key: "time",
      label: discoveryTimeLabel(params.time),
      clear: { time: undefined },
    });
  }
  if (params.video) {
    chips.push({ key: "video", label: "Has video", clear: { video: undefined } });
  }
  if (params.cuisine) {
    chips.push({ key: "cuisine", label: params.cuisine, clear: { cuisine: undefined } });
  }
  if (params.method) {
    chips.push({ key: "method", label: params.method, clear: { method: undefined } });
  }
  return chips;
}

/** Lightweight autocomplete for catalogue + overlay. */
export function buildDiscoverySuggestions(input: {
  query: string;
  recipes: Recipe[];
  limit?: number;
}): DiscoverySuggestion[] {
  const needle = normalizeSearchText(input.query);
  if (needle.length < 2) return [];
  const limit = input.limit ?? 8;
  const suggestions: DiscoverySuggestion[] = [];

  for (const category of DISCOVERY_CATEGORIES) {
    if (category.id === "all") continue;
    const label = normalizeSearchText(category.label);
    if (label.startsWith(needle) || label.includes(needle)) {
      suggestions.push({ kind: "category", id: category.id, label: category.label });
    }
  }

  for (const cuisine of listDiscoveryCuisines(input.recipes)) {
    const label = normalizeSearchText(cuisine.label);
    if (label.startsWith(needle) || label.includes(needle)) {
      suggestions.push({ kind: "cuisine", id: cuisine.label, label: cuisine.label });
    }
  }

  const ranked = searchRecipesByText(input.recipes, needle).slice(0, limit);
  for (const row of ranked) {
    suggestions.push({
      kind: "recipe",
      slug: row.recipe.slug,
      title: row.recipe.title,
      score: row.score,
    });
  }

  return suggestions.slice(0, limit);
}
