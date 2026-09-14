/** Public Collection count labels (index cards + detail meta). */

export function formatCollectionContentCount(input: {
  recipeCount: number;
  videoCount: number;
  itemCount: number;
}): string {
  const recipes = Math.max(0, Math.floor(input.recipeCount));
  const videos = Math.max(0, Math.floor(input.videoCount));
  const items = Math.max(0, Math.floor(input.itemCount));

  if (items <= 0) return "";

  if (recipes > 0 && videos === 0) {
    return `${recipes} ${recipes === 1 ? "recipe" : "recipes"}`;
  }
  if (videos > 0 && recipes === 0) {
    return `${videos} ${videos === 1 ? "video" : "videos"}`;
  }
  return `${items} ${items === 1 ? "item" : "items"}`;
}

/** Uppercase olive meta line for Collection detail (optional duration suffix). */
export function formatCollectionMetaLine(
  countLabel: string,
  totalMinutes: number | null,
): string {
  const base = countLabel.trim().toUpperCase();
  if (!base) return "";
  if (totalMinutes == null || totalMinutes <= 0) return base;
  return `${base} · ${totalMinutes} MIN TOTAL`;
}
