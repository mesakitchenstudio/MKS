/**
 * Ingredient identity foundation (ING-1).
 *
 * Terminology:
 * - Authored item: editor-written display string (untouched source of truth)
 * - Lookup key: deterministic comparison form from normalizeIngredientLookupKey
 * - Canonical ingredient: future Ingredient entity identity
 * - Alias: known phrase mapped to a canonical ingredient
 *
 * Recipe.values.ingredients remains authoritative. These helpers never mutate
 * amount, notes, groups, ordering, or authored item text.
 */

export type IngredientIdentityRecord = {
  /** Optional stable id for future DB rows. */
  id?: string;
  /** Display / canonical name (e.g. "Egg"). */
  name: string;
  /** normalizeIngredientLookupKey(name). */
  nameNorm: string;
};

export type IngredientAliasRecord = {
  /** Optional FK to IngredientIdentityRecord.id. */
  ingredientId?: string;
  /** Human alias phrase (e.g. "large eggs"). */
  alias: string;
  /** normalizeIngredientLookupKey(alias). */
  aliasNorm: string;
};

export type IngredientMatchStatus = "exact" | "alias" | "unresolved";

export type IngredientMatchResult = {
  status: IngredientMatchStatus;
  /** Present when status is exact or alias. */
  ingredientId?: string;
  /** Canonical name when matched. */
  ingredientName?: string;
  normalizedInput: string;
};

/** Curated seed entry before ids/norms are assigned. */
export type IngredientSeedEntry = {
  name: string;
  aliases?: string[];
};

export type IngredientCatalog = {
  ingredients: IngredientIdentityRecord[];
  aliases: IngredientAliasRecord[];
};

export type AuthoredIngredientOccurrence = {
  authoredItem: string;
  normalizedKey: string;
  recipeTitle?: string;
  groupIndex: number;
  itemIndex: number;
};

export type IngredientCorpusReport = {
  recipesAnalyzed: number;
  ingredientRows: number;
  distinctAuthoredItems: number;
  distinctNormalizedKeys: number;
  matchedExact: number;
  matchedAlias: number;
  unresolved: number;
  /** Distinct authored items that matched (exact + alias). */
  matchedDistinct: number;
  coveragePercent: number;
  unresolvedAuthored: Array<{ authoredItem: string; normalizedKey: string; count: number }>;
  matchedAuthored: Array<{
    authoredItem: string;
    normalizedKey: string;
    status: "exact" | "alias";
    ingredientName: string;
    count: number;
  }>;
};

export type IngredientSeedValidationIssue = {
  kind:
    | "empty_name"
    | "duplicate_name_norm"
    | "empty_alias"
    | "duplicate_alias_norm"
    | "alias_collides_with_other_canonical";
  message: string;
  nameNorm?: string;
  aliasNorm?: string;
};
