/**
 * Suppress public engagement analytics while an Admin recipe preview is mounted.
 * Nesting-safe counter — do not use for public visitor pages.
 */

let suppressDepth = 0;

export function beginRecipeEngagementSuppression(): () => void {
  suppressDepth += 1;
  return () => {
    suppressDepth = Math.max(0, suppressDepth - 1);
  };
}

export function isRecipeEngagementSuppressed() {
  return suppressDepth > 0;
}
