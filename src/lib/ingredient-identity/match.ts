import { normalizeIngredientLookupKey } from "./normalize";
import type {
  IngredientAliasRecord,
  IngredientCatalog,
  IngredientIdentityRecord,
  IngredientMatchResult,
} from "./types";

/**
 * Match authored ingredient item text to a catalog identity.
 *
 * Order (documented + tested):
 * 1. normalize authored item
 * 2. exact aliasNorm match
 * 3. exact canonical nameNorm match
 * 4. unresolved
 *
 * Alias-before-canonical lets curated phrases like "large eggs" resolve to Egg
 * before any accidental same-string canonical collision. Uniqueness validation
 * forbids an aliasNorm from pointing at two ingredients or colliding with a
 * different ingredient's nameNorm.
 *
 * No fuzzy, substring, stemming, or auto-create behavior.
 */
export function matchIngredientIdentity(input: {
  authoredItem: string;
  ingredients: IngredientIdentityRecord[];
  aliases: IngredientAliasRecord[];
}): IngredientMatchResult {
  const normalizedInput = normalizeIngredientLookupKey(input.authoredItem);
  if (!normalizedInput) {
    return { status: "unresolved", normalizedInput: "" };
  }

  const aliasHit = input.aliases.find((alias) => alias.aliasNorm === normalizedInput);
  if (aliasHit) {
    const ingredient =
      input.ingredients.find((row) => row.id && row.id === aliasHit.ingredientId) ||
      input.ingredients.find((row) => row.nameNorm === normalizedInput);
    return {
      status: "alias",
      ingredientId: aliasHit.ingredientId || ingredient?.id,
      ingredientName: ingredient?.name,
      normalizedInput,
    };
  }

  const exact = input.ingredients.find((row) => row.nameNorm === normalizedInput);
  if (exact) {
    return {
      status: "exact",
      ingredientId: exact.id,
      ingredientName: exact.name,
      normalizedInput,
    };
  }

  return { status: "unresolved", normalizedInput };
}

export function matchIngredientIdentityAgainstCatalog(
  authoredItem: string,
  catalog: IngredientCatalog,
): IngredientMatchResult {
  return matchIngredientIdentity({
    authoredItem,
    ingredients: catalog.ingredients,
    aliases: catalog.aliases,
  });
}
