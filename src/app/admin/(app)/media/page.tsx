import type { Metadata } from "next";
import Link from "next/link";
import { registerExternalMediaAssetAction } from "@/app/admin/media-actions";
import { MediaLibraryUpload } from "@/components/admin/MediaLibraryUpload";
import {
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
  MEDIA_ASSET_SOURCES,
  mediaAssetDisplayTitle,
  mediaAssetKindLabel,
  mediaAssetSourceLabel,
} from "@/lib/media-asset";
import { listMediaAssetsForAdmin } from "@/lib/media-asset-server";

export const metadata: Metadata = {
  title: "Media",
};

function hrefWith(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `/admin/media?${qs}` : "/admin/media";
}

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    active?: string;
    kind?: string;
    source?: string;
    saved?: string;
    deleted?: string;
    error?: string;
  }>;
}) {
  await requireAccess("content");
  const query = await searchParams;
  const active =
    query.active === "active" || query.active === "inactive" ? query.active : "all";
  const assets = await listMediaAssetsForAdmin({
    query: query.q,
    active,
    kind: query.kind,
    source: query.source,
  });

  return (
    <div className={`min-w-0 ${adminWorkspaceWide}`}>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink">Media</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Editorial catalogue of images — identity, alt text, credit, and reuse.
            Blob and local uploads still own the bytes; this library owns the assets.
          </p>
        </div>
        <p className="text-sm text-muted">{assets.length} shown</p>
      </header>

      {query.saved === "1" ? (
        <p className="mb-4 text-sm font-semibold text-olive" role="status">
          Media asset saved.
        </p>
      ) : null}
      {query.deleted === "1" ? (
        <p className="mb-4 text-sm font-semibold text-olive" role="status">
          Media asset deleted.
        </p>
      ) : null}
      {query.error === "missing" ? (
        <p className="mb-4 text-sm font-semibold text-terracotta" role="alert">
          That media asset could not be found.
        </p>
      ) : null}
      {query.error === "url" ? (
        <p className="mb-4 text-sm font-semibold text-terracotta" role="alert">
          Enter a valid image URL to register.
        </p>
      ) : null}

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-sm border border-line p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Upload</h2>
          <p className="mt-1 text-sm text-muted">
            Stores bytes, then registers a MediaAsset for library reuse.
          </p>
          <div className="mt-3">
            <MediaLibraryUpload />
          </div>
        </section>

        <section className="rounded-sm border border-line p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Register URL
          </h2>
          <p className="mt-1 text-sm text-muted">
            Add an existing public or site-relative image without re-uploading.
          </p>
          <form action={registerExternalMediaAssetAction} className="mt-3 grid gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-semibold text-muted">Image URL</span>
              <input name="url" required placeholder="https://… or /uploads/…" className={adminInputClass} />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-semibold text-muted">Title</span>
              <input name="title" className={adminInputClass} />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-semibold text-muted">Alt text</span>
              <input name="altText" className={adminInputClass} />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-semibold text-muted">Kind</span>
              <select name="kind" defaultValue="image" className={adminSelectClass}>
                {MEDIA_ASSET_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {mediaAssetKindLabel(kind)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={`${adminPrimaryButtonClass} ${adminFocusRing} justify-self-start`}>
              Register URL
            </button>
          </form>
        </section>
      </div>

      <form className="mb-6 flex flex-wrap items-end gap-3" method="get" action="/admin/media">
        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-semibold text-muted">Search</span>
          <input
            name="q"
            defaultValue={query.q || ""}
            placeholder="Title, alt, URL…"
            className={`${adminInputClass} min-w-[12rem]`}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-semibold text-muted">Status</span>
          <select name="active" defaultValue={active} className={adminSelectClass}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-semibold text-muted">Kind</span>
          <select name="kind" defaultValue={query.kind || ""} className={adminSelectClass}>
            <option value="">All kinds</option>
            {MEDIA_ASSET_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {mediaAssetKindLabel(kind)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-semibold text-muted">Source</span>
          <select name="source" defaultValue={query.source || ""} className={adminSelectClass}>
            <option value="">All sources</option>
            {MEDIA_ASSET_SOURCES.map((source) => (
              <option key={source} value={source}>
                {mediaAssetSourceLabel(source)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={`${adminSecondaryButtonClass} ${adminFocusRing}`}>
          Filter
        </button>
        <Link href="/admin/media" className={`${adminLinkClass} ${adminFocusRing} text-sm`}>
          Clear
        </Link>
      </form>

      {assets.length === 0 ? (
        <p className="text-sm text-muted">
          No media assets yet. Upload an image or register a URL to start the library.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <li key={asset.id} className="overflow-hidden rounded-sm border border-line bg-paper">
              <Link href={`/admin/media/${asset.id}`} className={`block ${adminFocusRing}`}>
                <div className="relative aspect-video bg-sand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.url}
                    alt={asset.altText || mediaAssetDisplayTitle(asset)}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
                <div className="grid gap-1 p-3">
                  <p className="truncate font-semibold text-ink">
                    {mediaAssetDisplayTitle(asset)}
                  </p>
                  <p className="text-xs text-muted">
                    {asset.isActive ? "Active" : "Inactive"} · {mediaAssetKindLabel(asset.kind)} ·{" "}
                    {mediaAssetSourceLabel(asset.source)}
                  </p>
                  <p className="text-xs text-muted">
                    Updated {formatAdminDateTimeUtc(asset.updatedAt)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {query.q || query.kind || query.source || active !== "all" ? (
        <p className="mt-4 text-xs text-muted">
          Showing filtered results.{" "}
          <Link href={hrefWith({})} className={adminLinkClass}>
            View all
          </Link>
        </p>
      ) : null}
    </div>
  );
}
