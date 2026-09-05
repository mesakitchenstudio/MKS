/**
 * Related-recipe shelf helpers for “More from the studio”.
 * Pure geometry helpers — safe to unit test without DOM.
 */

export const RELATED_RECIPE_SHELF_LIMIT = 9;

export function shelfCanScrollPrevious(scrollLeft: number, epsilon = 2): boolean {
  return scrollLeft > epsilon;
}

export function shelfCanScrollNext(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
  epsilon = 2,
): boolean {
  return scrollLeft + clientWidth < scrollWidth - epsilon;
}

/** Scroll distance for one card (width + gap), falling back to the visible viewport. */
export function shelfScrollStep(input: {
  itemWidth: number;
  gap: number;
  viewportWidth: number;
}): number {
  const itemStep = input.itemWidth + input.gap;
  if (itemStep > 0) return itemStep;
  return Math.max(0, input.viewportWidth);
}
