import {
  INGREDIENT_MATCH_VIA,
  matchIngredientIdentity,
  normalizeIngredientLookupKey,
  type IngredientAliasRecord,
  type IngredientIdentityRecord,
  type IngredientMatchVia,
} from "@/lib/ingredient-identity";
import type {
  AuthoredIngredientItemRef,
  ProspectiveRecipeIngredientRow,
} from "./types";

/**
 * Walk stored Recipe.values.ingredients without mutating or repairing them.
 * Skips blank/whitespace-only item rows. Uses positional indices as stored.
 */
export function extractAuthoredIngredientItems(rawIngredients: unknown): AuthoredIngredientItemRef[] {
  if (!Array.isArray(rawIngredients)) return [];

  const out: AuthoredIngredientItemRef[] = [];
  for (let groupIndex = 0; groupIndex < rawIngredients.length; groupIndex += 1) {
    const group = rawIngredients[groupIndex];
    if (!group || typeof group !== "object") continue;
    const items = Array.isArray((group as { items?: unknown }).items)
      ? ((group as { items: unknown[] }).items)
      : [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const row = items[itemIndex];
      if (!row || typeof row !== "object") continue;
      const authoredItem = String((row as { item?: unknown }).item ?? "").trim();
      if (!authoredItem) continue;
      out.push({ groupIndex, itemIndex, authoredItem });
    }
  }
  return out;
}

export function parseRecipeValuesIngredients(
  values: string | Record<string, unknown> | null | undefined,
): unknown {
  if (values == null) return [];
  if (typeof values === "string") {
    try {
      const parsed = JSON.parse(values) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
      return (parsed as Record<string, unknown>).ingredients ?? [];
    } catch {
      return [];
    }
  }
  if (typeof values === "object" && !Array.isArray(values)) {
    return values.ingredients ?? [];
  }
  return [];
}

/**
 * Enforce matchedVia ↔ ingredientId invariant before DB write.
 * UNRESOLVED must be null; EXACT/ALIAS must be non-null.
 */
export function assertRecipeIngredientRowInvariant(
  row: ProspectiveRecipeIngredientRow,
): void {
  if (row.matchedVia === INGREDIENT_MATCH_VIA.UNRESOLVED) {
    if (row.ingredientId != null) {
      throw new Error(
        `Ingredient index invariant: UNRESOLVED row must have null ingredientId (got ${row.ingredientId}).`,
      );
    }
    return;
  }
  if (
    row.matchedVia === INGREDIENT_MATCH_VIA.EXACT ||
    row.matchedVia === INGREDIENT_MATCH_VIA.ALIAS
  ) {
    if (!row.ingredientId) {
      throw new Error(
        `Ingredient index invariant: ${row.matchedVia} row requires non-null ingredientId.`,
      );
    }
    return;
  }
  throw new Error(`Ingredient index invariant: unknown matchedVia "${row.matchedVia}".`);
}

function statusToMatchedVia(status: "exact" | "alias" | "unresolved"): IngredientMatchVia {
  if (status === "exact") return INGREDIENT_MATCH_VIA.EXACT;
  if (status === "alias") return INGREDIENT_MATCH_VIA.ALIAS;
  return INGREDIENT_MATCH_VIA.UNRESOLVED;
}

/**
 * Pure builder: authored items + ING-1 match results → prospective index rows.
 * Does not mutate ingredientGroups / source refs.
 */
export function buildRecipeIngredientIndexRows(input: {
  recipeId: string;
  items: AuthoredIngredientItemRef[];
  ingredients: IngredientIdentityRecord[];
  aliases: IngredientAliasRecord[];
}): ProspectiveRecipeIngredientRow[] {
  const rows: ProspectiveRecipeIngredientRow[] = [];

  for (const item of input.items) {
    const match = matchIngredientIdentity({
      authoredItem: item.authoredItem,
      ingredients: input.ingredients,
      aliases: input.aliases,
    });
    const matchedVia = statusToMatchedVia(match.status);
    const ingredientId =
      matchedVia === INGREDIENT_MATCH_VIA.UNRESOLVED
        ? null
        : match.ingredientId
          ? String(match.ingredientId)
          : null;

    const row: ProspectiveRecipeIngredientRow = {
      recipeId: input.recipeId,
      groupIndex: item.groupIndex,
      itemIndex: item.itemIndex,
      authoredItem: item.authoredItem,
      authoredItemNorm:
        match.normalizedInput || normalizeIngredientLookupKey(item.authoredItem),
      ingredientId,
      matchedVia,
    };
    assertRecipeIngredientRowInvariant(row);
    rows.push(row);
  }

  return rows;
}
