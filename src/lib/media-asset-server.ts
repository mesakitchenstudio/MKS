import "server-only";

import { deleteOwnedAdminImage } from "@/lib/admin-upload-store";
import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import {
  filterMediaAssets,
  normalizeMediaAssetUrl,
  sortMediaAssetsForLibrary,
  titleFromUploadFilename,
  type MediaAssetCreateInput,
  type MediaAssetFilter,
  type MediaAssetKind,
  type MediaAssetRecord,
  type MediaAssetSource,
  type MediaAssetUpdateInput,
  type MediaAssetUsage,
  RECIPE_HERO_MEDIA_ASSET_ID_KEY,
} from "@/lib/media-asset";
import { isOwnedAdminUploadUrl } from "@/lib/admin-upload";

function toRecord(row: {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  url: string;
  title: string;
  altText: string;
  credit: string;
  notes: string;
  mimeType: string;
  byteSize: number | null;
  source: string;
  kind: string;
  isActive: boolean;
  createdByAdminId: string | null;
}): MediaAssetRecord {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    url: row.url,
    title: row.title,
    altText: row.altText,
    credit: row.credit,
    notes: row.notes,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    source: row.source,
    kind: row.kind,
    isActive: row.isActive,
    createdByAdminId: row.createdByAdminId,
  };
}

export async function getMediaAssetById(id: string): Promise<MediaAssetRecord | null> {
  const row = await getDb().mediaAsset.findUnique({ where: { id } });
  return row ? toRecord(row) : null;
}

export async function findMediaAssetByUrl(url: string): Promise<MediaAssetRecord | null> {
  const normalized = normalizeMediaAssetUrl(url);
  if (!normalized) return null;
  const row = await getDb().mediaAsset.findFirst({
    where: { url: normalized },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  return row ? toRecord(row) : null;
}

export async function createMediaAsset(input: MediaAssetCreateInput): Promise<MediaAssetRecord> {
  const url = normalizeMediaAssetUrl(input.url);
  if (!url) throw new Error("Media asset URL is required.");

  const row = await getDb().mediaAsset.create({
    data: {
      url,
      title: String(input.title ?? "").trim().slice(0, 200),
      altText: String(input.altText ?? "").trim().slice(0, 500),
      credit: String(input.credit ?? "").trim().slice(0, 300),
      notes: String(input.notes ?? "").trim().slice(0, 2000),
      mimeType: String(input.mimeType ?? "").trim().slice(0, 80),
      byteSize: typeof input.byteSize === "number" && Number.isFinite(input.byteSize) ? input.byteSize : null,
      source: String(input.source ?? "upload").trim() || "upload",
      kind: String(input.kind ?? "image").trim() || "image",
      isActive: input.isActive !== false,
      createdByAdminId: input.createdByAdminId ?? null,
    },
  });
  return toRecord(row);
}

/**
 * After storage returns a URL, register editorial identity.
 * Dedupes by exact URL when an active/inactive row already exists — updates metadata lightly.
 */
export async function registerMediaAssetFromUpload(input: {
  url: string;
  filenameHint?: string;
  mimeType?: string;
  byteSize?: number | null;
  kind?: MediaAssetKind | string;
  source?: MediaAssetSource | string;
  createdByAdminId?: string | null;
  title?: string;
  altText?: string;
}): Promise<MediaAssetRecord> {
  const url = normalizeMediaAssetUrl(input.url);
  if (!url) throw new Error("Media asset URL is required.");

  const existing = await findMediaAssetByUrl(url);
  if (existing) {
    const title =
      String(input.title ?? "").trim() ||
      existing.title ||
      titleFromUploadFilename(input.filenameHint || "");
    return updateMediaAsset(existing.id, {
      title,
      mimeType: input.mimeType || existing.mimeType,
      byteSize: input.byteSize ?? existing.byteSize,
      kind: input.kind || existing.kind,
      isActive: true,
    });
  }

  return createMediaAsset({
    url,
    title: String(input.title ?? "").trim() || titleFromUploadFilename(input.filenameHint || ""),
    altText: input.altText,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    source: input.source ?? "upload",
    kind: input.kind ?? "recipe_hero",
    createdByAdminId: input.createdByAdminId,
  });
}

export async function registerExternalMediaAsset(input: {
  url: string;
  title?: string;
  altText?: string;
  credit?: string;
  notes?: string;
  kind?: MediaAssetKind | string;
  createdByAdminId?: string | null;
}): Promise<MediaAssetRecord> {
  const url = normalizeMediaAssetUrl(input.url);
  if (!url) throw new Error("Enter an image URL.");
  if (!(url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/"))) {
    throw new Error("Use an http(s) URL or a site-relative /uploads path.");
  }

  const existing = await findMediaAssetByUrl(url);
  if (existing) {
    return updateMediaAsset(existing.id, {
      title: input.title ?? existing.title,
      altText: input.altText ?? existing.altText,
      credit: input.credit ?? existing.credit,
      notes: input.notes ?? existing.notes,
      kind: input.kind ?? existing.kind,
      isActive: true,
    });
  }

  return createMediaAsset({
    url,
    title: input.title,
    altText: input.altText,
    credit: input.credit,
    notes: input.notes,
    source: "external_url",
    kind: input.kind ?? "image",
    createdByAdminId: input.createdByAdminId,
  });
}

export async function updateMediaAsset(
  id: string,
  input: MediaAssetUpdateInput,
): Promise<MediaAssetRecord> {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = String(input.title).trim().slice(0, 200);
  if (input.altText !== undefined) data.altText = String(input.altText).trim().slice(0, 500);
  if (input.credit !== undefined) data.credit = String(input.credit).trim().slice(0, 300);
  if (input.notes !== undefined) data.notes = String(input.notes).trim().slice(0, 2000);
  if (input.kind !== undefined) data.kind = String(input.kind).trim() || "image";
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);
  if (input.url !== undefined) {
    const url = normalizeMediaAssetUrl(input.url);
    if (!url) throw new Error("Media asset URL is required.");
    data.url = url;
  }
  if (input.mimeType !== undefined) data.mimeType = String(input.mimeType).trim().slice(0, 80);
  if (input.byteSize !== undefined) {
    data.byteSize =
      typeof input.byteSize === "number" && Number.isFinite(input.byteSize) ? input.byteSize : null;
  }

  const row = await getDb().mediaAsset.update({ where: { id }, data });
  return toRecord(row);
}

export async function setMediaAssetActive(id: string, isActive: boolean): Promise<MediaAssetRecord> {
  return updateMediaAsset(id, { isActive });
}

/**
 * Delete MediaAsset row. Optionally delete owned storage bytes when unused.
 * Does not mutate Recipe / Series content.
 */
export async function deleteMediaAsset(
  id: string,
  options?: { deleteOwnedBytesIfUnused?: boolean },
): Promise<{ deleted: true; bytesDeleted: boolean; blockedReason?: undefined } | {
  deleted: false;
  bytesDeleted: false;
  blockedReason: string;
}> {
  const asset = await getMediaAssetById(id);
  if (!asset) {
    return { deleted: false, bytesDeleted: false, blockedReason: "Asset not found." };
  }

  const usages = await listMediaAssetUsages(asset);
  if (usages.length > 0) {
    return {
      deleted: false,
      bytesDeleted: false,
      blockedReason: "This asset is still used by recipes or series. Detach it first, or deactivate instead.",
    };
  }

  await getDb().mediaAsset.delete({ where: { id } });

  let bytesDeleted = false;
  if (options?.deleteOwnedBytesIfUnused !== false && isOwnedAdminUploadUrl(asset.url)) {
    // Only delete bytes when no other MediaAsset shares the same URL.
    const siblings = await getDb().mediaAsset.count({ where: { url: asset.url } });
    if (siblings === 0) {
      await deleteOwnedAdminImage(asset.url);
      bytesDeleted = true;
    }
  }

  return { deleted: true, bytesDeleted };
}

export async function listMediaAssetsForAdmin(
  filter?: MediaAssetFilter,
): Promise<MediaAssetRecord[]> {
  const rows = await getDb().mediaAsset.findMany({
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  const mapped = rows.map(toRecord);
  return sortMediaAssetsForLibrary(filterMediaAssets(mapped, filter));
}

export async function listActiveMediaAssetsForPicker(query?: string): Promise<MediaAssetRecord[]> {
  return listMediaAssetsForAdmin({ query, active: "active" });
}

/** Derived usage graph — no MediaAssetUsage table in 6B. */
export async function listMediaAssetUsages(
  asset: Pick<MediaAssetRecord, "id" | "url">,
): Promise<MediaAssetUsage[]> {
  const db = getDb();
  const url = normalizeMediaAssetUrl(asset.url);
  const [recipes, series] = await Promise.all([
    db.recipe.findMany({
      select: { id: true, title: true, slug: true, values: true },
    }),
    db.series.findMany({
      select: { id: true, title: true, slug: true, heroImage: true },
    }),
  ]);

  const usages: MediaAssetUsage[] = [];

  for (const recipe of recipes) {
    const values = parseValues(recipe.values) as Record<string, unknown>;
    const linkedId = String(values[RECIPE_HERO_MEDIA_ASSET_ID_KEY] ?? "").trim();
    const image = normalizeMediaAssetUrl(String(values.image ?? ""));
    const matchById = linkedId === asset.id;
    const matchByUrl = Boolean(url) && image === url;
    if (matchById || matchByUrl) {
      usages.push({
        entityType: "recipe",
        entityId: recipe.id,
        label: recipe.title || recipe.slug || recipe.id,
        fieldKey: "image",
        href: `/admin/recipes/${recipe.id}`,
      });
    }
  }

  for (const row of series) {
    const hero = normalizeMediaAssetUrl(row.heroImage || "");
    if (url && hero === url) {
      usages.push({
        entityType: "series",
        entityId: row.id,
        label: row.title || row.slug || row.id,
        fieldKey: "heroImage",
        href: `/admin/series/${row.id}`,
      });
    }
  }

  return usages.sort((a, b) => a.label.localeCompare(b.label) || a.entityId.localeCompare(b.entityId));
}

export async function importOwnedRecipeImagesAsMediaAssets(options?: {
  createdByAdminId?: string | null;
}): Promise<{ created: number; skipped: number }> {
  const recipes = await getDb().recipe.findMany({
    select: { values: true },
  });
  let created = 0;
  let skipped = 0;
  for (const recipe of recipes) {
    const values = parseValues(recipe.values) as Record<string, unknown>;
    const url = normalizeMediaAssetUrl(String(values.image ?? ""));
    if (!url || !isOwnedAdminUploadUrl(url)) {
      skipped += 1;
      continue;
    }
    const existing = await findMediaAssetByUrl(url);
    if (existing) {
      skipped += 1;
      continue;
    }
    await createMediaAsset({
      url,
      title: titleFromUploadFilename(url.split("/").pop() || "recipe-hero"),
      altText: String(values.imageAlt ?? ""),
      source: "imported",
      kind: "recipe_hero",
      createdByAdminId: options?.createdByAdminId ?? null,
    });
    created += 1;
  }
  return { created, skipped };
}
