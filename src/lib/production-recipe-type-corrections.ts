/**
 * One-shot CMS corrections for mis-assigned RecipeType rows.
 * Does not change Course or Categories — only `recipe.typeId`.
 */

export type RecipeTypeCorrection = {
  slug: string;
  /** Target RecipeType.slug (e.g. "main"). */
  typeSlug: string;
};

/** Known mis-typed published recipes (AI import historically preferred Condiment for Caesar). */
export const PRODUCTION_RECIPE_TYPE_CORRECTIONS: RecipeTypeCorrection[] = [
  {
    slug: "homemade-chicken-caesar-salad-with-garlic-croutons",
    typeSlug: "main",
  },
  {
    slug: "homemade-chicken-caesar-salad",
    typeSlug: "main",
  },
];

export function recipeTypeCorrectionForSlug(slug: string): RecipeTypeCorrection | undefined {
  return PRODUCTION_RECIPE_TYPE_CORRECTIONS.find((row) => row.slug === slug);
}
