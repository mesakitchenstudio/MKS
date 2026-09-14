/**
 * Ingredient index (ING-3) — derived RecipeIngredient persistence.
 *
 * Recipe.values.ingredients remains authoritative.
 * Pure matching stays in ingredient-identity/; this module adapts DB + rebuilds.
 */

import type { IngredientMatchVia } from "@/lib/ingredient-identity";

export type AuthoredIngredientItemRef = {
  groupIndex: number;
  itemIndex: number;
  /** Trimmed authored item text snapshot. */
  authoredItem: string;
};

export type ProspectiveRecipeIngredientRow = {
  recipeId: string;
  groupIndex: number;
  itemIndex: number;
  authoredItem: string;
  authoredItemNorm: string;
  ingredientId: string | null;
  matchedVia: IngredientMatchVia;
};

export type IngredientLookupMaps = {
  /** nameNorm → Ingredient id */
  byNameNorm: Map<string, { id: string; name: string; nameNorm: string }>;
  /** aliasNorm → Ingredient id + name */
  byAliasNorm: Map<string, { ingredientId: string; ingredientName: string; alias: string }>;
};

export type RecipeIngredientCoverageReport = {
  recipesIndexed: number;
  ingredientRowsIndexed: number;
  exact: number;
  alias: number;
  unresolved: number;
  matched: number;
  coveragePercent: number;
  distinctUnresolvedKeys: number;
  unresolvedGrouped: Array<{
    authoredItemNorm: string;
    representativeAuthoredItem: string;
    occurrenceCount: number;
    recipeCount: number;
  }>;
  canonicalIngredients: number;
  aliases: number;
};

export type IngredientSeedReport = {
  status: "SUCCESS" | "FAILED";
  ingredientsCreated: number;
  ingredientsExisting: number;
  aliasesCreated: number;
  aliasesExisting: number;
  failures: string[];
};

export type RecipeIngredientBackfillReport = {
  status: "SUCCESS" | "FAILED" | "DRY_RUN";
  mode: "dry_run" | "apply";
  examined: number;
  rebuilt: number;
  rowsWritten: number;
  failures: Array<{ recipeId: string; title: string; message: string }>;
};
