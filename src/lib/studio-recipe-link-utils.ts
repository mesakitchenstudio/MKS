export const STUDIO_PUBLIC_LINK_LIMIT = 3;

function uniqueSlugs(slugs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const slug of slugs) {
    const key = slug.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Prefer database links; fall back to static lesson slugs when unset. */
export function pickLessonRelatedRecipeSlugs(dbSlugs: string[], staticSlugs: string[]): string[] {
  const source = dbSlugs.length > 0 ? dbSlugs : staticSlugs;
  return uniqueSlugs(source).slice(0, STUDIO_PUBLIC_LINK_LIMIT);
}
