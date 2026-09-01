import type { Recipe } from "@/data/types";
import {
  PRIMARY_CATEGORY_LABELS,
  PRIMARY_PUBLIC_FILTERS,
  type PrimaryCategorySlug,
  recipeMatchesPrimaryCategory,
} from "@/lib/recipe-primary-taxonomy";
import { filterRecipes } from "@/lib/recipe-utils";

export type RecipeSort = "latest" | "alpha";

export type RecipeDiscoveryParams = {
  q?: string;
  category?: string;
  collection?: string;
  sort?: RecipeSort;
};

export const DISCOVERY_CATEGORIES = PRIMARY_PUBLIC_FILTERS;

export const DISCOVERY_SORTS: { id: RecipeSort; label: string }[] = [
  { id: "latest", label: "Latest" },
  { id: "alpha", label: "A–Z" },
];

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

  return {
    q: get("q")?.trim() || undefined,
    category: category && category !== "all" ? category : undefined,
    collection: get("collection")?.trim() || undefined,
    sort: sort === "alpha" ? "alpha" : sort === "latest" ? "latest" : undefined,
  };
}

export function buildRecipesUrl(params: RecipeDiscoveryParams) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (params.collection) search.set("collection", params.collection);
  if (params.sort && params.sort !== "latest") search.set("sort", params.sort);
  const query = search.toString();
  return query ? `/recipes?${query}` : "/recipes";
}

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

export function sortRecipeList(recipes: Recipe[], sort: RecipeSort = "latest") {
  const list = [...recipes];
  if (sort === "alpha") {
    return list.sort((a, b) => a.title.localeCompare(b.title));
  }
  return list.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function applyDiscoveryFilters(
  recipes: Recipe[],
  params: RecipeDiscoveryParams,
  collectionSlugs: Record<string, string[]>,
) {
  let result = [...recipes];

  if (params.collection) {
    const slugs = collectionSlugs[params.collection];
    if (slugs?.length) {
      const order = new Map(slugs.map((slug, index) => [slug, index]));
      result = result
        .filter((recipe) => order.has(recipe.slug))
        .sort((a, b) => (order.get(a.slug)! - order.get(b.slug)!));
    } else {
      result = [];
    }
  }

  if (params.category) {
    result = result.filter((recipe) => matchesCategory(recipe, params.category!));
  }

  if (params.q) {
    result = filterRecipes(result, params.q);
  }

  if (params.collection && !params.sort) {
    return result;
  }

  return sortRecipeList(result, params.sort ?? "latest");
}

export function hasActiveDiscoveryFilters(params: RecipeDiscoveryParams) {
  return Boolean(params.q || params.category || params.collection || params.sort);
}

export function primaryCategoryLabel(slug: string) {
  if (isPrimaryCategorySlug(slug)) return PRIMARY_CATEGORY_LABELS[slug];
  return slug;
}
