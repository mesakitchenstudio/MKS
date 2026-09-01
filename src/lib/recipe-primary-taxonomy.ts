import type { Recipe } from "@/data/types";

/** Dessert child categories — matched under the Desserts primary filter, not as peers. */
export const DESSERT_CATEGORY_SLUGS = new Set([
  "desserts",
  "cookies",
  "cakes",
  "brownies-bars",
]);

/** Primary public course filters — single vocabulary for chips, cards, and footer. */
export const PRIMARY_CATEGORY_SLUGS = [
  "breakfast",
  "breads",
  "main-dishes",
  "side-dishes",
  "desserts",
  "drinks",
  "toppings",
] as const;

export type PrimaryCategorySlug = (typeof PRIMARY_CATEGORY_SLUGS)[number];

export const PRIMARY_CATEGORY_LABELS: Record<PrimaryCategorySlug, string> = {
  breakfast: "Breakfast",
  breads: "Breads",
  "main-dishes": "Main Dishes",
  "side-dishes": "Side Dishes",
  desserts: "Desserts",
  drinks: "Drinks",
  toppings: "Condiments",
};

export const PRIMARY_PUBLIC_FILTERS = [
  { id: "all", label: "All" },
  ...PRIMARY_CATEGORY_SLUGS.map((slug) => ({
    id: slug,
    label: PRIMARY_CATEGORY_LABELS[slug],
  })),
] as const;

/**
 * FILTER SEMANTICS (public /recipes chips):
 * A recipe may match multiple primary filters when it carries multiple associations
 * (category slug, RecipeType, or legacy course). Example: iced horchata may appear
 * under both Breakfast and Drinks filters.
 *
 * CARD SEMANTICS:
 * Exactly one intentional primary label per card, resolved via editorial signals
 * below — never by arbitrary category-array order.
 */

/** CMS RecipeType.name → public primary slug (editorial intent). */
const RECIPE_TYPE_TO_PRIMARY: Record<string, PrimaryCategorySlug> = {
  breakfast: "breakfast",
  bread: "breads",
  main: "main-dishes",
  side: "side-dishes",
  dessert: "desserts",
  cake: "desserts",
  cookie: "desserts",
  drink: "drinks",
  condiment: "toppings",
};

/** Legacy values.course → public primary slug when type is unavailable. */
const COURSE_TO_PRIMARY: Record<string, PrimaryCategorySlug> = {
  breakfast: "breakfast",
  bread: "breads",
  breads: "breads",
  main: "main-dishes",
  side: "side-dishes",
  dessert: "desserts",
  drink: "drinks",
  drinks: "drinks",
  condiment: "toppings",
};

function normalizedTypeName(recipe: Recipe) {
  return recipe.typeName?.trim().toLowerCase() ?? "";
}

function primaryFromRecipeType(recipe: Recipe): PrimaryCategorySlug | undefined {
  const key = normalizedTypeName(recipe);
  return key ? RECIPE_TYPE_TO_PRIMARY[key] : undefined;
}

function primaryFromCourse(recipe: Recipe): PrimaryCategorySlug | undefined {
  const key = recipe.course.trim().toLowerCase();
  return key ? COURSE_TO_PRIMARY[key] : undefined;
}

export function isBreadRecipe(recipe: Recipe) {
  if (recipe.categories.includes("breads")) return true;
  if (normalizedTypeName(recipe) === "bread") return true;
  const course = recipe.course.trim().toLowerCase();
  return course === "bread" || course === "breads";
}

export function isDessertRecipe(recipe: Recipe) {
  return recipe.categories.some((slug) => DESSERT_CATEGORY_SLUGS.has(slug));
}

export function isCondimentRecipe(recipe: Recipe) {
  if (recipe.categories.includes("toppings")) return true;
  return normalizedTypeName(recipe) === "condiment";
}

/** Whether a recipe should appear under a primary filter chip (may match several). */
export function recipeMatchesPrimaryCategory(recipe: Recipe, slug: PrimaryCategorySlug): boolean {
  switch (slug) {
    case "breads":
      return isBreadRecipe(recipe);
    case "desserts":
      return isDessertRecipe(recipe);
    case "toppings":
      return isCondimentRecipe(recipe);
    case "breakfast":
      return recipe.categories.includes("breakfast") || normalizedTypeName(recipe) === "breakfast";
    case "main-dishes":
      return recipe.categories.includes("main-dishes") || normalizedTypeName(recipe) === "main";
    case "side-dishes":
      return recipe.categories.includes("side-dishes") || normalizedTypeName(recipe) === "side";
    case "drinks":
      return recipe.categories.includes("drinks") || normalizedTypeName(recipe) === "drink";
    default:
      return false;
  }
}

/**
 * One intentional primary label per card.
 * Priority: RecipeType → values.course → type/category compatibility fallbacks.
 */
export function resolveRecipePrimaryCategorySlug(recipe: Recipe): PrimaryCategorySlug | undefined {
  const fromType = primaryFromRecipeType(recipe);
  if (fromType) return fromType;

  const fromCourse = primaryFromCourse(recipe);
  if (fromCourse) return fromCourse;

  if (isBreadRecipe(recipe)) return "breads";
  if (isDessertRecipe(recipe)) return "desserts";
  if (isCondimentRecipe(recipe)) return "toppings";

  const directPrimary = PRIMARY_CATEGORY_SLUGS.filter((slug) =>
    recipe.categories.includes(slug),
  );
  if (directPrimary.length === 1) return directPrimary[0];

  return undefined;
}

export function recipePrimaryCategoryDisplayLabel(recipe: Recipe): string {
  const slug = resolveRecipePrimaryCategorySlug(recipe);
  if (slug) return PRIMARY_CATEGORY_LABELS[slug];
  return recipe.course.trim() || "Recipe";
}

/** List every primary filter a recipe legitimately matches (for audits). */
export function listMatchedPrimaryCategorySlugs(recipe: Recipe): PrimaryCategorySlug[] {
  return PRIMARY_CATEGORY_SLUGS.filter((slug) => recipeMatchesPrimaryCategory(recipe, slug));
}
