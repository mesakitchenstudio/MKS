/**
 * Phase 3C product decisions — Editorial Collections + Related overrides.
 *
 * Architecture (authoritative):
 * - Prisma `Series` / `SeriesItem` remain the editorial grouping model.
 * - No separate Collection model, homepage-collection taxonomy, or Series+Collection overlap.
 * - Public product label: “Collections”. Internal/admin model name: Series.
 * - Canonical public routes stay `/series` and `/series/[slug]` (sitemap + existing links).
 * - Do not introduce `/collections` aliases (avoids duplicate indexable URLs).
 * - Legacy `?collection=` on `/recipes` is dormant homepage curated-list compatibility only —
 *   not Series. Keep parse/filter for bookmarks; do not reinterpret as Series.
 * - Series items may include recipes and/or videos; public discovery presents recipes as primary.
 * - Related Recipes remain automatic by default; optional `Recipe.relatedRecipeIds` pins first,
 *   then the existing scorer fills remaining shelf slots.
 *
 * Admin UX (Phase 1 Collections alignment):
 * - User-facing Admin labels say “Collections”; routes/code remain `/admin/series`.
 * - CUSTOM = Mesa Collection; YOUTUBE = YouTube Collection (playlist-backed).
 */

export const PHASE3C_PUBLIC_COLLECTIONS_LABEL = "Collections";
export const PHASE3C_PUBLIC_COLLECTIONS_BLURB =
  "Curated sets of Mesa recipes for seasons, occasions and the table.";
export const PHASE3C_SERIES_ROUTE_PREFIX = "/series";

/** @deprecated Prefer PHASE3C_ADMIN_COLLECTIONS_LABEL — kept for older references. */
export const PHASE3C_ADMIN_SERIES_LABEL = "Collections";

/** User-facing Admin label for the Series area. */
export const PHASE3C_ADMIN_COLLECTIONS_LABEL = "Collections";

export const PHASE3C_MESA_COLLECTION_LABEL = "Mesa Collection";
export const PHASE3C_YOUTUBE_COLLECTION_LABEL = "YouTube Collection";
