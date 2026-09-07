/** Ephemeral bridge so Cooking Mode can inherit servings from the recipe page scaler. */

export const RECIPE_SERVINGS_BRIDGE_EVENT = "mesa:recipe-servings";

export function recipeServingsBridgeKey(slug: string): string {
  return `mesa:recipe-servings:${slug}`;
}

export function writeRecipeServingsBridge(slug: string, servings: number): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(recipeServingsBridgeKey(slug), String(Math.max(1, Math.round(servings))));
    window.dispatchEvent(new CustomEvent(RECIPE_SERVINGS_BRIDGE_EVENT, { detail: { slug } }));
  } catch {
    // ignore
  }
}

export function readRecipeServingsBridge(slug: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(recipeServingsBridgeKey(slug));
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.min(99, Math.round(n));
  } catch {
    return null;
  }
}

export function subscribeRecipeServingsBridge(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onStoreChange();
  window.addEventListener(RECIPE_SERVINGS_BRIDGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(RECIPE_SERVINGS_BRIDGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
