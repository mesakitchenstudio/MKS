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

function normalizedTypeName(recipe: Recipe) {
  return recipe.typeName?.trim().toLowerCase() ?? "";
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

/** One display label per card — aligns type/category, not free-text course. */
export function resolveRecipePrimaryCategorySlug(recipe: Recipe): PrimaryCategorySlug | undefined {
  if (isBreadRecipe(recipe)) return "breads";
  if (isDessertRecipe(recipe)) return "desserts";
  for (const slug of PRIMARY_CATEGORY_SLUGS) {
    if (slug === "breads" || slug === "desserts") continue;
    if (recipeMatchesPrimaryCategory(recipe, slug)) return slug;
  }
  return undefined;
}

export function recipePrimaryCategoryDisplayLabel(recipe: Recipe): string {
  const slug = resolveRecipePrimaryCategorySlug(recipe);
  if (slug) return PRIMARY_CATEGORY_LABELS[slug];
  return recipe.course.trim() || "Recipe";
}
