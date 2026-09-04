import Link from "next/link";
import { SeriesIndexRowOverflow } from "@/components/admin/SeriesIndexRowOverflow";
import { requireAccess } from "@/lib/auth";
import { listAdminSeries } from "@/lib/series-admin";
import {
  adminFocusRing,
  adminLinkClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminTableHeadClass,
} from "@/lib/admin-ui";
import { youtubePlaylistUrl } from "@/lib/youtube";

export const dynamic = "force-dynamic";

function SeriesPublicationStatus({ published }: { published: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${published ? "bg-olive" : "bg-terracotta/75"}`}
        aria-hidden
      />
      {published ? "Published" : "Draft"}
    </span>
  );
}

function itemsSummary(row: {
  itemCount: number;
  linkedRecipeCount: number;
  videoOnlyCount: number;
}) {
  const parts = [
    `${row.itemCount} ${row.itemCount === 1 ? "item" : "items"}`,
    `${row.linkedRecipeCount} linked`,
  ];
  if (row.videoOnlyCount > 0) {
    parts.push(`${row.videoOnlyCount} video-only`);
  }
  return parts.join(" · ");
}

function SeriesRowActions({
  row,
  ytUrl,
}: {
  row: {
    id: string;
    title: string;
    slug: string;
    isPublished: boolean;
    youtubePlaylistId: string;
  };
  ytUrl: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Link
        href={`/admin/series/${row.id}`}
        className={`${adminLinkClass} min-h-11 inline-flex items-center sm:min-h-0`}
        aria-label={`Edit ${row.title}`}
      >
        Edit
      </Link>
      {row.isPublished ? (
        <Link
          href={`/series/${row.slug}`}
          className={`${adminLinkClass} min-h-11 inline-flex items-center sm:min-h-0`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${row.title}`}
        >
          View ↗
        </Link>
      ) : null}
      <SeriesIndexRowOverflow
        seriesId={row.id}
        seriesTitle={row.title}
        canRefresh={Boolean(row.youtubePlaylistId)}
        youtubePlaylistUrl={ytUrl}
      />
    </div>
  );
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
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl text-ink">Series</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Import YouTube playlists as Mesa Series, or build custom Mesa-only collections.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/series/import" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
            Import YouTube playlist
          </Link>
          <Link
            href="/admin/series/new"
            className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
          >
            Create custom Series
          </Link>
        </div>
      </div>

      {params.deleted ? (
        <p
          className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive"
          role="status"
        >
          Series deleted.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="border-y border-line/80 py-10 text-sm text-muted">
          No series yet. Import a YouTube playlist or create a custom Mesa Series.
        </p>
      ) : (
        <>
          {/*
            Table only at 2xl+: persistent ~240px sidebar leaves too little width
            for a five-column ledger until ~1536px viewport.
          */}
          <div className="hidden min-w-0 2xl:block">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[34%]" />
                <col className="w-[18%]" />
                <col className="w-[22%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead className={adminTableHeadClass}>
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Series
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Source
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Items
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 pr-5 text-right">
                    <span className="sr-only">Actions</span>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const ytUrl = row.youtubePlaylistId
                    ? youtubePlaylistUrl(row.youtubePlaylistId)
                    : null;
                  const source =
                    row.syncMode === "YOUTUBE" ? "YouTube playlist" : "Custom";
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-line/70 transition-colors duration-150 motion-reduce:transition-none hover:bg-cream/50"
                    >
                      <td className="min-w-0 px-4 py-3.5 align-middle">
                        <Link
                          href={`/admin/series/${row.id}`}
                          className={`${adminLinkClass} font-semibold text-ink`}
                        >
                          {row.title}
                        </Link>
                        <p className="mt-0.5 font-mono text-xs text-muted">{row.slug}</p>
                      </td>
                      <td className="px-4 py-3.5 align-middle text-muted">{source}</td>
                      <td className="px-4 py-3.5 align-middle text-muted">{itemsSummary(row)}</td>
                      <td className="px-4 py-3.5 align-middle">
                        <SeriesPublicationStatus published={row.isPublished} />
                      </td>
                      <td className="px-4 py-3.5 pr-5 align-middle text-right">
                        <SeriesRowActions row={row} ytUrl={ytUrl} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-line/70 border-y border-line/80 2xl:hidden">
            {rows.map((row) => {
              const ytUrl = row.youtubePlaylistId
                ? youtubePlaylistUrl(row.youtubePlaylistId)
                : null;
              const source = row.syncMode === "YOUTUBE" ? "YouTube playlist" : "Custom";
              return (
                <li key={row.id} className="min-w-0 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/admin/series/${row.id}`}
                      className={`${adminLinkClass} min-w-0 flex-1 font-semibold text-ink`}
                    >
                      {row.title}
                    </Link>
                    <SeriesPublicationStatus published={row.isPublished} />
                  </div>
                  <p className="mt-1 min-w-0 text-sm text-muted">
                    <span className="font-mono text-xs">{row.slug}</span>
                    {" · "}
                    {source}
                    {" · "}
                    {itemsSummary(row)}
                  </p>
                  <div className="mt-2">
                    <SeriesRowActions row={row} ytUrl={ytUrl} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
