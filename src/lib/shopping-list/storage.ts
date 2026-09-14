/**
 * Shopping List localStorage + contribution apply rules (ING-7).
 */

import type { ApplyRecipeContributionsResult, ShoppingListContribution, ShoppingListState } from "./types";
import {
  SHOPPING_LIST_MAX_CONTRIBUTIONS,
  SHOPPING_LIST_MAX_PAYLOAD_CHARS,
  SHOPPING_LIST_MAX_RECIPES,
  SHOPPING_LIST_STORAGE_KEY,
  SHOPPING_LIST_VERSION,
} from "./types";

export function emptyShoppingListState(): ShoppingListState {
  return { version: SHOPPING_LIST_VERSION, contributions: [], purchasedKeys: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeContribution(raw: unknown): ShoppingListContribution | null {
  if (!isRecord(raw)) return null;
  const id = String(raw.id ?? "").trim();
  const recipeId = String(raw.recipeId ?? "").trim();
  const recipeSlug = String(raw.recipeSlug ?? "").trim();
  const recipeTitle = String(raw.recipeTitle ?? "").trim();
  const authoredItem = String(raw.authoredItem ?? "").trim();
  if (!id || !recipeId || !recipeSlug || !recipeTitle || !authoredItem) return null;

  const sourceMode = raw.sourceMode === "CWYW_MISSING" ? "CWYW_MISSING" : "RECIPE";
  const groupIndex = Number(raw.groupIndex);
  const itemIndex = Number(raw.itemIndex);
  if (!Number.isFinite(groupIndex) || !Number.isFinite(itemIndex)) return null;

  const servings = Number(raw.servings);
  const baseServings = Number(raw.baseServings);
  const ingredientId = String(raw.ingredientId ?? "").trim() || undefined;
  const notes = String(raw.notes ?? "").trim() || undefined;

  return {
    id,
    sourceMode,
    recipeId,
    recipeSlug,
    recipeTitle,
    servings: Number.isFinite(servings) && servings > 0 ? servings : 1,
    baseServings: Number.isFinite(baseServings) && baseServings > 0 ? baseServings : 1,
    groupIndex,
    itemIndex,
    ingredientId,
    authoredItem,
    authoredItemNorm: String(raw.authoredItemNorm ?? "").trim() || authoredItem.toLowerCase(),
    shoppingItemKey: String(raw.shoppingItemKey ?? "").trim() || authoredItem.toLowerCase(),
    amountText: String(raw.amountText ?? ""),
    notes,
    scaledAmountText: String(raw.scaledAmountText ?? raw.amountText ?? ""),
    addedAt: String(raw.addedAt ?? "").trim() || new Date(0).toISOString(),
  };
}

export function validateShoppingListState(raw: unknown): ShoppingListState {
  if (!isRecord(raw)) return emptyShoppingListState();
  if (raw.version !== SHOPPING_LIST_VERSION) return emptyShoppingListState();

  const contributions: ShoppingListContribution[] = [];
  const seenIds = new Set<string>();
  const recipeIds = new Set<string>();
  const list = Array.isArray(raw.contributions) ? raw.contributions : [];

  for (const item of list) {
    if (contributions.length >= SHOPPING_LIST_MAX_CONTRIBUTIONS) break;
    const c = normalizeContribution(item);
    if (!c || seenIds.has(c.id)) continue;
    if (!recipeIds.has(c.recipeId) && recipeIds.size >= SHOPPING_LIST_MAX_RECIPES) continue;
    seenIds.add(c.id);
    recipeIds.add(c.recipeId);
    contributions.push(c);
  }

  const purchasedKeys: string[] = [];
  const purchasedSeen = new Set<string>();
  const purchasedRaw = Array.isArray(raw.purchasedKeys) ? raw.purchasedKeys : [];
  for (const key of purchasedRaw) {
    const value = String(key ?? "").trim();
    if (!value || purchasedSeen.has(value)) continue;
    purchasedSeen.add(value);
    purchasedKeys.push(value);
    if (purchasedKeys.length >= SHOPPING_LIST_MAX_CONTRIBUTIONS) break;
  }

  return { version: SHOPPING_LIST_VERSION, contributions, purchasedKeys };
}

export function parseShoppingListState(raw: string | null | undefined): ShoppingListState {
  if (!raw || raw.length > SHOPPING_LIST_MAX_PAYLOAD_CHARS) return emptyShoppingListState();
  try {
    return validateShoppingListState(JSON.parse(raw) as unknown);
  } catch {
    return emptyShoppingListState();
  }
}

export function serializeShoppingListState(state: ShoppingListState): string | null {
  const validated = validateShoppingListState(state);
  const json = JSON.stringify(validated);
  if (json.length > SHOPPING_LIST_MAX_PAYLOAD_CHARS) return null;
  return json;
}

export function loadShoppingListState(): ShoppingListState {
  try {
    if (typeof window === "undefined") return emptyShoppingListState();
    return parseShoppingListState(window.localStorage.getItem(SHOPPING_LIST_STORAGE_KEY));
  } catch {
    return emptyShoppingListState();
  }
}

export function saveShoppingListState(state: ShoppingListState): boolean {
  try {
    if (typeof window === "undefined") return false;
    const json = serializeShoppingListState(state);
    if (!json) return false;
    window.localStorage.setItem(SHOPPING_LIST_STORAGE_KEY, json);
    window.dispatchEvent(new CustomEvent("mesa-shopping-list-changed"));
    return true;
  } catch {
    return false;
  }
}

function prunePurchasedKeys(state: ShoppingListState): ShoppingListState {
  // Keep purchased keys; stale keys are harmless and drop naturally on reaggregate miss
  return state;
}

/**
 * Apply new contributions for one recipeId with source-mode precedence.
 *
 * FULL_RECIPE dominates CWYW_MISSING.
 */
export function applyRecipeContributions(
  state: ShoppingListState,
  nextContributions: ShoppingListContribution[],
): ApplyRecipeContributionsResult {
  if (!nextContributions.length) {
    return {
      state,
      outcome: "noop",
      message: "Nothing to add.",
    };
  }

  const recipeId = nextContributions[0]!.recipeId;
  const nextMode = nextContributions[0]!.sourceMode;
  const title = nextContributions[0]!.recipeTitle;
  const existing = state.contributions.filter((c) => c.recipeId === recipeId);
  const existingMode = existing.some((c) => c.sourceMode === "RECIPE")
    ? "RECIPE"
    : existing.length
      ? "CWYW_MISSING"
      : null;

  if (existingMode === "RECIPE" && nextMode === "CWYW_MISSING") {
    return {
      state,
      outcome: "kept_full",
      message: "This recipe is already fully included.",
    };
  }

  const others = state.contributions.filter((c) => c.recipeId !== recipeId);
  const otherRecipeCount = new Set(others.map((c) => c.recipeId)).size;

  if (!existing.length && otherRecipeCount >= SHOPPING_LIST_MAX_RECIPES) {
    return {
      state,
      outcome: "noop",
      message: "Shopping list recipe limit reached.",
    };
  }

  const merged = [...others, ...nextContributions];
  if (merged.length > SHOPPING_LIST_MAX_CONTRIBUTIONS) {
    return {
      state,
      outcome: "noop",
      message: "Shopping list item limit reached.",
    };
  }

  const nextState = prunePurchasedKeys({
    version: SHOPPING_LIST_VERSION,
    contributions: merged,
    purchasedKeys: state.purchasedKeys,
  });

  if (!existing.length) {
    return {
      state: nextState,
      outcome: "added",
      message:
        nextMode === "CWYW_MISSING"
          ? `Added ${nextContributions.length} missing ingredient${
              nextContributions.length === 1 ? "" : "s"
            } to your shopping list.`
          : `Added ${title} to your shopping list.`,
    };
  }

  return {
    state: nextState,
    outcome: "updated",
    message:
      nextMode === "CWYW_MISSING"
        ? `Updated missing ingredients for ${title}.`
        : `Updated ${title} in your shopping list.`,
  };
}

export function removeRecipeContributions(
  state: ShoppingListState,
  recipeId: string,
): ShoppingListState {
  return {
    version: SHOPPING_LIST_VERSION,
    contributions: state.contributions.filter((c) => c.recipeId !== recipeId),
    purchasedKeys: state.purchasedKeys,
  };
}

export function removeContributionsByIds(
  state: ShoppingListState,
  contributionIds: string[],
): ShoppingListState {
  const remove = new Set(contributionIds);
  return {
    version: SHOPPING_LIST_VERSION,
    contributions: state.contributions.filter((c) => !remove.has(c.id)),
    purchasedKeys: state.purchasedKeys,
  };
}

export function setPurchasedKey(
  state: ShoppingListState,
  key: string,
  purchased: boolean,
): ShoppingListState {
  const set = new Set(state.purchasedKeys);
  if (purchased) set.add(key);
  else set.delete(key);
  return {
    version: SHOPPING_LIST_VERSION,
    contributions: state.contributions,
    purchasedKeys: [...set],
  };
}

/** Clear purchased: remove contributions belonging to purchased display rows. */
export function clearPurchasedContributions(
  state: ShoppingListState,
  purchasedContributionIds: string[],
): ShoppingListState {
  const remove = new Set(purchasedContributionIds);
  return {
    version: SHOPPING_LIST_VERSION,
    contributions: state.contributions.filter((c) => !remove.has(c.id)),
    purchasedKeys: [],
  };
}

export function clearShoppingList(): ShoppingListState {
  return emptyShoppingListState();
}
