import type { Recipe } from "@/data/types";
import {
  PRIMARY_CATEGORY_LABELS,
  PRIMARY_CATEGORY_SLUGS,
  PRIMARY_PUBLIC_FILTERS,
  recipeMatchesPrimaryCategory,
  type PrimaryCategorySlug,
} from "@/lib/recipe-primary-taxonomy";

export type PublicPrimaryCategoryLink = {
  slug: PrimaryCategorySlug;
  label: string;
};

/**
 * Primary course categories that currently have at least one published recipe.
 * Used to hide empty Drinks / Condiments (etc.) from public nav and browse surfaces.
 */
export function listPopulatedPrimaryCategorySlugs(
  recipes: Parameters<typeof recipeMatchesPrimaryCategory>[0][],
): PrimaryCategorySlug[] {
  return PRIMARY_CATEGORY_SLUGS.filter((slug) =>
    recipes.some((recipe) => recipeMatchesPrimaryCategory(recipe, slug)),
  );
}

export function listPopulatedPrimaryCategoryLinks(
  recipes: Parameters<typeof recipeMatchesPrimaryCategory>[0][],
): PublicPrimaryCategoryLink[] {
  return listPopulatedPrimaryCategorySlugs(recipes).map((slug) => ({
    slug,
    label: PRIMARY_CATEGORY_LABELS[slug],
  }));
}

/** Discovery chips: All + primary categories that have published membership. */
export function listPopulatedDiscoveryCategories(
  recipes: Parameters<typeof recipeMatchesPrimaryCategory>[0][],
) {
  const populated = new Set(listPopulatedPrimaryCategorySlugs(recipes));
  return PRIMARY_PUBLIC_FILTERS.filter(
    (entry) => entry.id === "all" || populated.has(entry.id as PrimaryCategorySlug),
  );
}

/** Narrow Recipe-shaped objects already used on the public catalogue. */
export type PublicCategoryMembershipRecipe = Pick<
  Recipe,
  "categories" | "course" | "typeName"
>;
