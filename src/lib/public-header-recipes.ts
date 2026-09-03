/** Shared desktop Recipes nav helpers (public header only). */

export const RECIPES_DROPDOWN_ID = "recipes-dropdown";

export const RECIPES_DISCLOSURE_LABEL = "Recipe categories";

/** Mesa focus ring used on public header nav controls (keyboard :focus-visible only). */
export const PUBLIC_HEADER_NAV_FOCUS =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

/** Catalogue or recipe-detail routes under /recipes. */
export function isRecipesSectionActive(pathname: string | null | undefined): boolean {
  const path = pathname || "";
  return path === "/recipes" || path.startsWith("/recipes/");
}

/**
 * `/recipes` (incl. query filters) → page.
 * `/recipes/[slug]` detail → location (section), not the catalogue page itself.
 */
export function recipesNavAriaCurrent(
  pathname: string | null | undefined,
): "page" | "location" | undefined {
  const path = pathname || "";
  if (path === "/recipes") return "page";
  if (path.startsWith("/recipes/")) return "location";
  return undefined;
}
