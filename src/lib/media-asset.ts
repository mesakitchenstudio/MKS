/**
 * MediaAsset — editorial catalogue over storage URLs.
 * Publishing Readiness / Content Health continue to evaluate Recipe.values.image URLs.
 * This module never stores bytes and never redefines hero readiness rules.
 */

export const MEDIA_ASSET_SOURCES = [
  "upload",
  "external_url",
  "youtube_thumbnail",
  "imported",
] as const;

export type MediaAssetSource = (typeof MEDIA_ASSET_SOURCES)[number];

export const MEDIA_ASSET_KINDS = ["image", "recipe_hero", "series_hero", "general"] as const;

export type MediaAssetKind = (typeof MEDIA_ASSET_KINDS)[number];

/** Optional Recipe.values key linking a hero URL to a MediaAsset.id */
export const RECIPE_HERO_MEDIA_ASSET_ID_KEY = "heroMediaAssetId";

export type MediaAssetRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  title: string;
  altText: string;
  credit: string;
  notes: string;
  mimeType: string;
  byteSize: number | null;
  source: MediaAssetSource | string;
  kind: MediaAssetKind | string;
  isActive: boolean;
  createdByAdminId: string | null;
};

export type MediaAssetUsage = {
  entityType: "recipe" | "series";
  entityId: string;
  label: string;
  fieldKey: string;
  href: string;
};

export type MediaAssetFilter = {
  query?: string;
  active?: "all" | "active" | "inactive";
  kind?: string;
  source?: string;
};

export type MediaAssetCreateInput = {
  url: string;
  title?: string;
  altText?: string;
  credit?: string;
  notes?: string;
  mimeType?: string;
  byteSize?: number | null;
  source?: MediaAssetSource | string;
  kind?: MediaAssetKind | string;
  isActive?: boolean;
  createdByAdminId?: string | null;
};

export type MediaAssetUpdateInput = {
  title?: string;
  altText?: string;
  credit?: string;
  notes?: string;
  kind?: MediaAssetKind | string;
  isActive?: boolean;
  /** Rare: re-point URL when replacing file; prefer new asset for distinct files. */
  url?: string;
  mimeType?: string;
  byteSize?: number | null;
};

export function normalizeMediaAssetUrl(url: string): string {
  return String(url ?? "").trim();
}

export function isValidMediaAssetSource(value: string): value is MediaAssetSource {
  return (MEDIA_ASSET_SOURCES as readonly string[]).includes(value);
}

export function isValidMediaAssetKind(value: string): value is MediaAssetKind {
  return (MEDIA_ASSET_KINDS as readonly string[]).includes(value);
}

export function mediaAssetDisplayTitle(asset: Pick<MediaAssetRecord, "title" | "url" | "id">): string {
  const title = String(asset.title ?? "").trim();
  if (title) return title;
  const url = normalizeMediaAssetUrl(asset.url);
  if (!url) return asset.id;
  try {
    const path = url.startsWith("/") ? url : new URL(url).pathname;
    const base = path.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(base) || asset.id;
  } catch {
    return asset.id;
  }
}

export function mediaAssetSourceLabel(source: string): string {
  switch (source) {
    case "upload":
      return "Upload";
    case "external_url":
      return "External URL";
    case "youtube_thumbnail":
      return "YouTube thumbnail";
    case "imported":
      return "Imported";
    default:
      return source || "Unknown";
  }
}

export function mediaAssetKindLabel(kind: string): string {
  switch (kind) {
    case "recipe_hero":
      return "Recipe hero";
    case "series_hero":
      return "Series hero";
    case "general":
      return "General";
    case "image":
      return "Image";
    default:
      return kind || "Image";
  }
}

/** Apply a library asset onto recipe values without inventing readiness rules. */
export function applyMediaAssetToRecipeValues(
  values: Record<string, unknown>,
  asset: Pick<MediaAssetRecord, "id" | "url" | "altText">,
  options?: { fillEmptyAltOnly?: boolean },
): Record<string, unknown> {
  const fillEmptyAltOnly = options?.fillEmptyAltOnly !== false;
  const next: Record<string, unknown> = {
    ...values,
    image: normalizeMediaAssetUrl(asset.url),
    [RECIPE_HERO_MEDIA_ASSET_ID_KEY]: asset.id,
  };
  const existingAlt = String(values.imageAlt ?? "").trim();
  const assetAlt = String(asset.altText ?? "").trim();
  if (assetAlt && (!fillEmptyAltOnly || !existingAlt)) {
    next.imageAlt = assetAlt;
  }
  return next;
}

/** Clear library linkage when the hero URL is typed/pasted manually. */
export function clearRecipeHeroMediaAssetId(
  values: Record<string, unknown>,
): Record<string, unknown> {
  if (!(RECIPE_HERO_MEDIA_ASSET_ID_KEY in values)) return values;
  const next = { ...values };
  delete next[RECIPE_HERO_MEDIA_ASSET_ID_KEY];
  return next;
}

export function getRecipeHeroMediaAssetId(values: Record<string, unknown>): string | null {
  const id = String(values[RECIPE_HERO_MEDIA_ASSET_ID_KEY] ?? "").trim();
  return id || null;
}

export function filterMediaAssets(
  rows: MediaAssetRecord[],
  filter?: MediaAssetFilter,
): MediaAssetRecord[] {
  const query = String(filter?.query ?? "")
    .trim()
    .toLowerCase();
  const active = filter?.active ?? "all";
  const kind = String(filter?.kind ?? "").trim();
  const source = String(filter?.source ?? "").trim();

  return rows.filter((row) => {
    if (active === "active" && !row.isActive) return false;
    if (active === "inactive" && row.isActive) return false;
    if (kind && row.kind !== kind) return false;
    if (source && row.source !== source) return false;
    if (!query) return true;
    const hay = [
      row.title,
      row.altText,
      row.credit,
      row.notes,
      row.url,
      row.id,
      mediaAssetDisplayTitle(row),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(query);
  });
}

export function sortMediaAssetsForLibrary(rows: MediaAssetRecord[]): MediaAssetRecord[] {
  return [...rows].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const byUpdated = b.updatedAt.localeCompare(a.updatedAt);
    if (byUpdated) return byUpdated;
    return a.id.localeCompare(b.id);
  });
}

export function titleFromUploadFilename(filename: string): string {
  const base = String(filename || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base.slice(0, 120);
}
