/** Desktop header search is canonical; floating search is mobile-only. */
export function shouldShowFloatingRecipeSearch(input: {
  isRecipeDetail: boolean;
  isDesktop: boolean;
}): boolean {
  if (input.isDesktop || input.isRecipeDetail) return false;
  return true;
}
