import type { Metadata } from "next";
import Link from "next/link";
import {
  deleteMediaAssetAction,
  saveMediaAssetAction,
  setMediaAssetActiveAction,
} from "@/app/admin/media-actions";
import {
  adminDangerButtonClass,
  adminFocusRing,
  adminInputClass,
  adminLinkClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminSelectClass,
  adminWorkspaceWide,
} from "@/lib/admin-ui";
import { requireAccess } from "@/lib/auth";
import { formatAdminDateTimeUtc } from "@/lib/datetime";
import {
  MEDIA_ASSET_KINDS,
  mediaAssetDisplayTitle,
  mediaAssetKindLabel,
  mediaAssetSourceLabel,
} from "@/lib/media-asset";
import { getMediaAssetById, listMediaAssetUsages } from "@/lib/media-asset-server";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Media asset",
};

export default async function AdminMediaAssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAccess("content");
  const { id } = await params;
  const query = await searchParams;
  const asset = await getMediaAssetById(id);
  if (!asset) notFound();
  const usages = await listMediaAssetUsages(asset);

  return (
    <div className={`min-w-0 ${adminWorkspaceWide}`}>
      <p className="mb-3">
        <Link href="/admin/media" className={`${adminLinkClass} ${adminFocusRing} text-sm`}>
          ← Media
        </Link>
      </p>
      <header className="mb-6">
        <h1 className="font-serif text-3xl text-ink">{mediaAssetDisplayTitle(asset)}</h1>
        <p className="mt-2 text-sm text-muted">
          {asset.isActive ? "Active" : "Inactive"} · {mediaAssetKindLabel(asset.kind)} ·{" "}
          {mediaAssetSourceLabel(asset.source)} · Updated{" "}
          {formatAdminDateTimeUtc(asset.updatedAt)}
        </p>
      </header>

      {query.saved === "1" ? (
        <p className="mb-4 text-sm font-semibold text-olive" role="status">
          Media asset saved.
        </p>
      ) : null}
      {query.error === "in_use" ? (
        <p className="mb-4 text-sm font-semibold text-terracotta" role="alert">
          This asset is still used. Detach it from recipes/series first, or deactivate instead.
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="grid gap-4">
          <figure className="overflow-hidden rounded-sm border border-line bg-cream/40">
            <div className="relative aspect-video bg-sand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset.url}
                alt={asset.altText || mediaAssetDisplayTitle(asset)}
                className="absolute inset-0 h-full w-full object-contain"
              />
            </div>
          </figure>
          <p className="break-all font-mono text-xs text-muted">{asset.url}</p>
          <p className="text-xs text-muted">
            ID <span className="font-mono">{asset.id}</span>
            {asset.mimeType ? ` · ${asset.mimeType}` : ""}
            {typeof asset.byteSize === "number" ? ` · ${asset.byteSize} bytes` : ""}
          </p>
        </div>

        <div className="grid gap-6">
          <form action={saveMediaAssetAction} className="grid gap-3 rounded-sm border border-line p-4">
            <input type="hidden" name="id" value={asset.id} />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Editorial metadata
            </h2>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-semibold text-muted">Title</span>
              <input name="title" defaultValue={asset.title} className={adminInputClass} />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-semibold text-muted">Alt text</span>
              <input name="altText" defaultValue={asset.altText} className={adminInputClass} />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-semibold text-muted">Credit</span>
              <input name="credit" defaultValue={asset.credit} className={adminInputClass} />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-semibold text-muted">Notes</span>
              <textarea
                name="notes"
                defaultValue={asset.notes}
                rows={3}
                className="w-full rounded-sm border border-line bg-paper px-3.5 py-2.5 text-sm text-ink outline-none focus:border-olive focus:ring-2 focus:ring-olive/15"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-semibold text-muted">Kind</span>
              <select name="kind" defaultValue={asset.kind} className={adminSelectClass}>
                {MEDIA_ASSET_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {mediaAssetKindLabel(kind)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={`${adminPrimaryButtonClass} ${adminFocusRing} justify-self-start`}>
              Save metadata
            </button>
          </form>

          <section className="rounded-sm border border-line p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Usage</h2>
            {usages.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Not currently used by recipes or series.</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {usages.map((usage) => (
                  <li key={`${usage.entityType}-${usage.entityId}-${usage.fieldKey}`}>
                    <Link
                      href={usage.href}
                      className={`${adminLinkClass} ${adminFocusRing} text-sm`}
                    >
                      {usage.entityType === "recipe" ? "Recipe" : "Series"}: {usage.label}
                    </Link>
                    <span className="ml-2 text-xs text-muted">{usage.fieldKey}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex flex-wrap gap-3">
            <form action={setMediaAssetActiveAction}>
              <input type="hidden" name="id" value={asset.id} />
              <input type="hidden" name="isActive" value={asset.isActive ? "0" : "1"} />
              <button type="submit" className={`${adminSecondaryButtonClass} ${adminFocusRing}`}>
                {asset.isActive ? "Deactivate" : "Activate"}
              </button>
            </form>
            <form action={deleteMediaAssetAction}>
              <input type="hidden" name="id" value={asset.id} />
              <button
                type="submit"
                className={`${adminDangerButtonClass} ${adminFocusRing}`}
                disabled={usages.length > 0}
                title={
                  usages.length > 0
                    ? "Detach from recipes/series before deleting"
                    : "Delete asset record (and owned bytes if unused)"
                }
              >
                Delete asset
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
