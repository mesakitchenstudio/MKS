/**
 * Shopping List domain types (ING-7).
 * Browser-local snapshot — no Prisma, no member sync.
 */

export const SHOPPING_LIST_PATH = "/shopping-list";
export const SHOPPING_LIST_STORAGE_KEY = "mesa:shopping-list:v1";
export const SHOPPING_LIST_VERSION = 1 as const;

export const SHOPPING_LIST_MAX_RECIPES = 20;
export const SHOPPING_LIST_MAX_CONTRIBUTIONS = 300;
/** Soft guard against pathological localStorage payloads (UTF-16-ish bytes). */
export const SHOPPING_LIST_MAX_PAYLOAD_CHARS = 200_000;

export type ShoppingSourceMode = "RECIPE" | "CWYW_MISSING";

export type ShoppingListContribution = {
  id: string;
  sourceMode: ShoppingSourceMode;
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  servings: number;
  baseServings: number;
  groupIndex: number;
  itemIndex: number;
  ingredientId?: string;
  authoredItem: string;
  /** Identity-style norm for unresolved grouping (not alias collapse). */
  authoredItemNorm: string;
  /** Conservative grocery merge key from authored item text. */
  shoppingItemKey: string;
  /** Original authored amount before servings scale. */
  amountText: string;
  notes?: string;
  /** Snapshot after servings scale — display/aggregate source of truth. */
  scaledAmountText: string;
  addedAt: string;
};

export type ShoppingListState = {
  version: typeof SHOPPING_LIST_VERSION;
  contributions: ShoppingListContribution[];
  /** Deterministic display-row keys marked purchased. */
  purchasedKeys: string[];
};

export type ShoppingListRecipeSource = {
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  servings: number;
  sourceMode: ShoppingSourceMode;
  contributionCount: number;
};

export type ShoppingListDisplayItem = {
  /** Stable aggregation key for purchased association. */
  key: string;
  amountDisplay: string;
  itemDisplay: string;
  notesDisplay?: string;
  contributionIds: string[];
  sources: Array<{
    recipeId: string;
    recipeSlug: string;
    recipeTitle: string;
    servings: number;
  }>;
  purchased: boolean;
};

export type ShoppingListView = {
  sources: ShoppingListRecipeSource[];
  unchecked: ShoppingListDisplayItem[];
  purchased: ShoppingListDisplayItem[];
  itemCount: number;
  recipeCount: number;
};

export type ApplyRecipeContributionsResult = {
  state: ShoppingListState;
  outcome: "added" | "updated" | "kept_full" | "noop";
  message: string;
};

/** Gate: independent of ingredient discovery / CWYW. Default OFF. */
export function isShoppingListEnabled(): boolean {
  // Server gate. NEXT_PUBLIC_ mirror optional for any client-only reads.
  return (
    process.env.SHOPPING_LIST_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_SHOPPING_LIST_ENABLED === "true"
  );
}
