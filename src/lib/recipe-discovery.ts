import type { Recipe } from "@/data/types";
import { filterRecipes, totalMinutes } from "@/lib/recipe-utils";

export type RecipeSort = "latest" | "alpha" | "fastest";

export type RecipeDiscoveryParams = {
  q?: string;
  category?: string;
  collection?: string;
  sort?: RecipeSort;
};

export const DISCOVERY_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "breakfast", label: "Breakfast" },
  { id: "main-dishes", label: "Main dishes" },
  { id: "side-dishes", label: "Sides" },
  { id: "desserts", label: "Desserts" },
  { id: "drinks", label: "Drinks" },
  { id: "breads", label: "Breads" },
] as const;

export const DISCOVERY_SORTS: { id: RecipeSort; label: string }[] = [
  { id: "latest", label: "Latest" },
  { id: "alpha", label: "A–Z" },
  { id: "fastest", label: "Fastest" },
];

const DESSERT_SLUGS = new Set(["desserts", "cookies", "cakes", "brownies-bars"]);

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
    sort: sort === "alpha" || sort === "fastest" ? sort : sort === "latest" ? "latest" : undefined,
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

function matchesCategory(recipe: Recipe, category: string) {
  if (category === "desserts") {
    return recipe.categories.some((slug) => DESSERT_SLUGS.has(slug));
  }
  return recipe.categories.includes(category);
}

export function recipeMatchesDiscoveryCategory(recipe: Recipe, category: string) {
  return matchesCategory(recipe, category);
}

/** Primary public browse taxonomy — excludes method/holiday facets. */
export const PRIMARY_BROWSE_GROUPS = ["desserts", "course"] as const;

export function browsableCategoriesWithCounts(
  categories: { slug: string; name: string; group: string }[],
  recipes: Recipe[],
  preferredOrder: string[] = [],
  options?: { groups?: readonly string[] },
) {
  const allowedGroups = options?.groups ? new Set(options.groups) : null;
  const bySlug = new Map(categories.map((category) => [category.slug, category]));
  const ordered: string[] = [];
  for (const slug of preferredOrder) {
    if (bySlug.has(slug) && !ordered.includes(slug)) ordered.push(slug);
  }
  for (const category of categories) {
    if (!ordered.includes(category.slug)) ordered.push(category.slug);
  }

  return ordered
    .map((slug) => {
      const category = bySlug.get(slug);
      if (!category) return null;
      if (allowedGroups && !allowedGroups.has(category.group)) return null;
      const count = recipes.filter((recipe) => matchesCategory(recipe, slug)).length;
      if (!count) return null;
      return {
        slug,
        name: category.name,
        group: category.group,
        count,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export function sortRecipeList(recipes: Recipe[], sort: RecipeSort = "latest") {
  const list = [...recipes];
  if (sort === "alpha") {
    return list.sort((a, b) => a.title.localeCompare(b.title));
  }
  if (sort === "fastest") {
    return list.sort((a, b) => totalMinutes(a) - totalMinutes(b));
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
