import { site } from "@/data/site";
import { absolutePublicUrl } from "@/lib/breadcrumb-jsonld";

/** Minimum published recipes before a Category is search-indexable / sitemapped. */
export const CATEGORY_INDEXABLE_MIN_RECIPES = 3;

export function isCategoryIndexable(publishedRecipeCount: number): boolean {
  return publishedRecipeCount >= CATEGORY_INDEXABLE_MIN_RECIPES;
}

export function categoryPublicPath(slug: string): string {
  return `/category/${String(slug || "").trim()}`;
}

export function categoryMetaDescription(description: string | null | undefined): string {
  const trimmed = String(description ?? "").trim();
  if (trimmed) return trimmed;
  return `Recipes filed under this category from ${site.name}.`;
}

export type CategoryItemListRecipe = {
  title: string;
  slug: string;
};

/** ItemList for Category aggregate pages — Recipe detail pages own Recipe schema. */
export function categoryItemListJsonLd(input: {
  name: string;
  description?: string;
  slug: string;
  recipes: CategoryItemListRecipe[];
}) {
  const recipes = input.recipes.filter((recipe) => recipe.slug.trim() && recipe.title.trim());
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: input.name,
    description: String(input.description || "").trim() || undefined,
    url: absolutePublicUrl(categoryPublicPath(input.slug)),
    numberOfItems: recipes.length,
    itemListElement: recipes.map((recipe, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: recipe.title,
      url: absolutePublicUrl(`/recipes/${recipe.slug}`),
    })),
  };
}
