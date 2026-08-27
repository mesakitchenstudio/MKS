export const RECIPE_IMAGE_FALLBACK = "/recipe-image-fallback.svg";

export function normalizeRecipeImageSrc(src?: string | null) {
  const trimmed = src?.trim();
  return trimmed || null;
}
