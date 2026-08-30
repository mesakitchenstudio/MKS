import Link from "next/link";
import { refreshSeriesFromYoutubeAction } from "@/app/admin/actions";
import { requireAccess } from "@/lib/auth";
import { listAdminSeries } from "@/lib/series-admin";
import { adminFocusRing, adminLinkClass, adminPrimaryButtonClass, adminTableHeadClass } from "@/lib/admin-ui";
import { youtubePlaylistUrl } from "@/lib/youtube";

export const dynamic = "force-dynamic";

const secondaryBtn =
  "inline-flex h-9 items-center justify-center rounded-sm border border-line bg-paper px-3 text-sm font-semibold text-muted hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

function formatSyncedAt(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}

export default async function AdminSeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  await requireAccess("content");
  const params = await searchParams;
  const rows = await listAdminSeries();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-ink">Series</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Import YouTube playlists as Mesa Series, or build custom Mesa-only collections.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/series/import" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
            Import YouTube playlist
          </Link>
          <Link href="/admin/series/new" className={`${secondaryBtn} ${adminFocusRing}`}>
            Create custom Series
          </Link>
        </div>
      </div>

      {params.deleted ? (
        <p className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive" role="status">
          Series deleted.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-sm border border-line">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className={adminTableHeadClass}>
              <th className="px-4 py-3 font-medium">Series</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Items</th>
              <th className="px-4 py-3 font-medium">Linked</th>
              <th className="px-4 py-3 font-medium">Video-only</th>
              <th className="px-4 py-3 font-medium">Published</th>
              <th className="px-4 py-3 font-medium">Last refreshed</th>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-muted">
                  No series yet. Import a YouTube playlist or create a custom Mesa Series.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const ytUrl = row.youtubePlaylistId
                  ? youtubePlaylistUrl(row.youtubePlaylistId)
                  : null;
                return (
                  <tr key={row.id} className="border-t border-line/70">
                    <td className="px-4 py-3">
                      <Link href={`/admin/series/${row.id}`} className={adminLinkClass}>
                        {row.title}
                      </Link>
                      <p className="text-xs text-muted">{row.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      {row.syncMode === "YOUTUBE" ? "YouTube playlist" : "Custom"}
                    </td>
                    <td className="px-4 py-3">{row.itemCount}</td>
                    <td className="px-4 py-3">{row.linkedRecipeCount}</td>
                    <td className="px-4 py-3">{row.videoOnlyCount}</td>
                    <td className="px-4 py-3">{row.isPublished ? "Published" : "Draft"}</td>
                    <td className="px-4 py-3">{formatSyncedAt(row.youtubePlaylistLastSyncedAt)}</td>
                    <td className="px-4 py-3">
                      {row.syncMode === "YOUTUBE"
                        ? row.followYoutubeOrder
                          ? "Follow YT"
                          : "Custom"
                        : "Custom"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/admin/series/${row.id}`} className={adminLinkClass}>
                          Edit
                        </Link>
                        {row.isPublished ? (
                          <Link
                            href={`/series/${row.slug}`}
                            className={adminLinkClass}
                            target="_blank"
                          >
                            View
                          </Link>
                        ) : null}
                        {row.youtubePlaylistId ? (
                          <form action={refreshSeriesFromYoutubeAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <button type="submit" className={adminLinkClass}>
                              Refresh
                            </button>
                          </form>
                        ) : null}
                        {ytUrl ? (
                          <a
                            href={ytUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={adminLinkClass}
                          >
                            YouTube
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
