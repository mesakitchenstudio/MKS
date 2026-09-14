import { slugify } from "@/lib/fields";
import { normalizeIngredientLookupKey } from "./normalize";

/**
 * Stable Ingredient.slug for future creation paths (ING-3+).
 * Reuses Mesa slugify — do not invent a second algorithm.
 * Callers should treat slug as immutable after first persist.
 */
export function ingredientSlugFromName(name: string): string {
  return slugify(name);
}

/** Build create payload fields for a canonical Ingredient (no DB write). */
export function buildIngredientCreateFields(name: string): {
  name: string;
  nameNorm: string;
  slug: string;
} {
  const trimmed = String(name ?? "").trim();
  return {
    name: trimmed,
    nameNorm: normalizeIngredientLookupKey(trimmed),
    slug: ingredientSlugFromName(trimmed),
  };
}

/** Allowed RecipeIngredient.matchedVia values (String field — no Prisma enum). */
export const INGREDIENT_MATCH_VIA = {
  EXACT: "EXACT",
  ALIAS: "ALIAS",
  UNRESOLVED: "UNRESOLVED",
} as const;

export type IngredientMatchVia =
  (typeof INGREDIENT_MATCH_VIA)[keyof typeof INGREDIENT_MATCH_VIA];

export function isIngredientMatchVia(value: string): value is IngredientMatchVia {
  return (
    value === INGREDIENT_MATCH_VIA.EXACT ||
    value === INGREDIENT_MATCH_VIA.ALIAS ||
    value === INGREDIENT_MATCH_VIA.UNRESOLVED
  );
}
