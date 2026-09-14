/**
 * Build Shopping List contributions from Recipe ingredient rows (ING-7).
 */

import type { IngredientGroup, Recipe } from "@/data/types";
import { clampRecipeServings, scaleAmount } from "@/lib/culinary-format";
import { normalizeIngredientLookupKey } from "@/lib/ingredient-identity";
import type {
  ShoppingListContribution,
  ShoppingSourceMode,
} from "./types";

export type RecipeIngredientIdentityHint = {
  groupIndex: number;
  itemIndex: number;
  ingredientId?: string | null;
  authoredItem?: string;
};

export function shoppingItemKeyFromAuthored(authoredItem: string): string {
  return normalizeIngredientLookupKey(authoredItem);
}

export function contributionIdFor(
  recipeId: string,
  groupIndex: number,
  itemIndex: number,
): string {
  return `${recipeId}:${groupIndex}:${itemIndex}`;
}

export function normalizeNotesKey(notes: string | undefined | null): string {
  return String(notes ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function notesCompatible(a?: string | null, b?: string | null): boolean {
  const left = normalizeNotesKey(a);
  const right = normalizeNotesKey(b);
  // Blank vs nonblank → separate (conservative)
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left === right;
}

function recipePublicId(recipe: Pick<Recipe, "id" | "slug">): string {
  return recipe.id?.trim() || recipe.slug;
}

/**
 * Build contributions for a Recipe at selected servings.
 * Uses stored Recipe.ingredients positions (same space as RecipeIngredient index).
 */
export function buildRecipeShoppingContributions(input: {
  recipe: Recipe;
  selectedServings: number;
  sourceMode: ShoppingSourceMode;
  /** Optional identity hints from RecipeIngredient rows. */
  identityHints?: RecipeIngredientIdentityHint[];
  /** Restrict to these positions (CWYW missing). Omit = all non-empty rows. */
  onlyPositions?: Array<{ groupIndex: number; itemIndex: number }>;
  now?: Date;
}): ShoppingListContribution[] {
  const recipeId = recipePublicId(input.recipe);
  const baseServings = Math.max(1, input.recipe.servings || 1);
  const selectedServings = clampRecipeServings(input.selectedServings);
  const factor = selectedServings / baseServings;
  const nowIso = (input.now ?? new Date()).toISOString();
  const groups = Array.isArray(input.recipe.ingredients)
    ? (input.recipe.ingredients as IngredientGroup[])
    : [];

  const hintMap = new Map<string, RecipeIngredientIdentityHint>();
  for (const hint of input.identityHints ?? []) {
    hintMap.set(`${hint.groupIndex}:${hint.itemIndex}`, hint);
  }

  const only = input.onlyPositions
    ? new Set(input.onlyPositions.map((p) => `${p.groupIndex}:${p.itemIndex}`))
    : null;

  const out: ShoppingListContribution[] = [];

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const items = Array.isArray(group?.items) ? group.items : [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const posKey = `${groupIndex}:${itemIndex}`;
      if (only && !only.has(posKey)) continue;
      const row = items[itemIndex];
      const authoredItem = String(row?.item ?? "").trim();
      if (!authoredItem) continue;

      const amountText = String(row?.amount ?? "").trim();
      const notesRaw = String(row?.notes ?? "").trim();
      const notes = notesRaw || undefined;
      const hint = hintMap.get(posKey);
      const ingredientId = hint?.ingredientId?.trim() || undefined;
      const scaledAmountText = scaleAmount(amountText, factor);

      out.push({
        id: contributionIdFor(recipeId, groupIndex, itemIndex),
        sourceMode: input.sourceMode,
        recipeId,
        recipeSlug: input.recipe.slug,
        recipeTitle: input.recipe.title,
        servings: selectedServings,
        baseServings,
        groupIndex,
        itemIndex,
        ingredientId,
        authoredItem,
        authoredItemNorm: normalizeIngredientLookupKey(authoredItem),
        shoppingItemKey: shoppingItemKeyFromAuthored(authoredItem),
        amountText,
        notes,
        scaledAmountText,
        addedAt: nowIso,
      });
    }
  }

  return out;
}

/**
 * CWYW missing → contributions using authoritative Recipe rows + base servings.
 */
export function buildCwywMissingContributions(input: {
  recipe: Recipe;
  missing: Array<{
    ingredientId?: string;
    source?: { groupIndex: number; itemIndex: number };
  }>;
  now?: Date;
}): ShoppingListContribution[] {
  const positions: Array<{ groupIndex: number; itemIndex: number }> = [];
  const hints: RecipeIngredientIdentityHint[] = [];
  for (const item of input.missing) {
    if (
      item.source == null ||
      !Number.isFinite(item.source.groupIndex) ||
      !Number.isFinite(item.source.itemIndex)
    ) {
      continue;
    }
    positions.push({
      groupIndex: item.source.groupIndex,
      itemIndex: item.source.itemIndex,
    });
    hints.push({
      groupIndex: item.source.groupIndex,
      itemIndex: item.source.itemIndex,
      ingredientId: item.ingredientId,
    });
  }
  if (!positions.length) return [];

  return buildRecipeShoppingContributions({
    recipe: input.recipe,
    selectedServings: input.recipe.servings,
    sourceMode: "CWYW_MISSING",
    identityHints: hints,
    onlyPositions: positions,
    now: input.now,
  });
}
