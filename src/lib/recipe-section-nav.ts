/**
 * Public recipe-detail section nav scrollspy helpers.
 *
 * Active section = last nav target whose top has crossed the reading line
 * directly under the sticky site header + RecipeSectionNav (or under the nav
 * alone when the header is compacted away).
 */

export const RECIPE_SECTION_NAV_LINKS = [
  { id: "recipe-cooking", label: "Recipe" },
  { id: "recipe-learn", label: "Learn" },
  { id: "watch-method", label: "Video" },
  { id: "recipe-comments", label: "Reviews" },
] as const;

export type RecipeSectionNavLinkId = (typeof RECIPE_SECTION_NAV_LINKS)[number]["id"];

export type RecipeSectionTop = {
  id: string;
  /** getBoundingClientRect().top relative to the viewport */
  top: number;
};

/**
 * Pick the active section for a given trigger Y (viewport coordinates).
 * Before any section top has crossed the line, keep the first section (Recipe).
 * After the last section, that last id remains active.
 */
export function resolveActiveRecipeSectionId(
  sections: RecipeSectionTop[],
  triggerY: number,
  epsilon = 1,
): string | null {
  if (!sections.length) return null;
  let active = sections[0].id;
  for (const section of sections) {
    if (section.top <= triggerY + epsilon) {
      active = section.id;
    }
  }
  return active;
}

/** Reading-line offset from the viewport top, under sticky chrome. */
export function measureRecipeSectionTriggerY(input: {
  headerHeight: number;
  navHeight: number;
  pinned: boolean;
}): number {
  const navHeight = Math.max(0, input.navHeight);
  if (input.pinned) return navHeight;
  return Math.max(0, input.headerHeight) + navHeight;
}

/**
 * IntersectionObserver rootMargin that collapses the root to a thin horizontal
 * band starting `offsetPx` from the top of the viewport (scanline under sticky chrome).
 * Active selection still uses geometry — this only decides when to re-evaluate.
 */
export function recipeSectionScanlineRootMargin(
  offsetPx: number,
  viewportHeight: number,
  bandPx = 4,
): string {
  const offset = Math.max(0, Math.round(offsetPx));
  const band = Math.max(1, Math.round(bandPx));
  const bottom = Math.max(0, Math.round(viewportHeight - offset - band));
  return `-${offset}px 0px -${bottom}px 0px`;
}
