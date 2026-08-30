import Image from "next/image";
import Link from "next/link";
import { importYoutubePlaylistAction } from "@/app/admin/actions";
import { requireAccess } from "@/lib/auth";
import { adminFocusRing, adminLinkClass, adminPrimaryButtonClass } from "@/lib/admin-ui";
import { listImportableChannelPlaylists } from "@/lib/series-playlist";
import { YouTubeDataError } from "@/lib/youtube-data/errors";

export const dynamic = "force-dynamic";

const secondaryBtn =
  "inline-flex h-9 items-center justify-center rounded-sm border border-line bg-paper px-3 text-sm font-semibold text-muted hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export default async function AdminSeriesImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAccess("content");
  const params = await searchParams;

  let playlists: Awaited<ReturnType<typeof listImportableChannelPlaylists>> = [];
  let loadError = "";
  try {
    playlists = await listImportableChannelPlaylists();
  } catch (error) {
    loadError =
      error instanceof YouTubeDataError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not load YouTube playlists.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm">
            <Link href="/admin/series" className={adminLinkClass}>
              ← Series
            </Link>
          </p>
          <h1 className="mt-2 font-serif text-3xl text-ink">Import YouTube playlist</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Choose a public Mesa Kitchen Studio playlist. Mesa imports videos and order, attaches
            matching recipes, and leaves editorial SEO/hero fields for you to enrich.
          </p>
        </div>
        <Link href="/admin/series/new" className={`${secondaryBtn} ${adminFocusRing}`}>
          Create custom Series instead
        </Link>
      </div>

      {params.error ? (
        <p className="rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-2 text-sm text-terracotta" role="alert">
          {decodeURIComponent(params.error)}
        </p>
      ) : null}
      {loadError ? (
        <p className="rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-2 text-sm text-terracotta" role="alert">
          {loadError}
        </p>
      ) : null}

      <ul className="space-y-3">
        {playlists.length === 0 && !loadError ? (
          <li className="border border-line bg-paper px-4 py-8 text-sm text-muted">
            No public playlists found for the configured channel.
          </li>
        ) : null}
        {playlists.map((playlist) => (
          <li
            key={playlist.playlistId}
            className="flex flex-wrap items-start gap-4 border border-line bg-paper p-4"
          >
            <div className="relative h-20 w-36 shrink-0 overflow-hidden border border-line bg-sand">
              {playlist.thumbnailUrl ? (
                <Image
                  src={playlist.thumbnailUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="9rem"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="font-serif text-xl text-ink">{playlist.title || "Untitled playlist"}</h2>
              {playlist.description ? (
                <p className="line-clamp-2 text-sm text-muted">{playlist.description}</p>
              ) : null}
              <p className="text-xs text-muted">
                {playlist.videoCount} videos · ID{" "}
                <span className="font-mono">{playlist.playlistId}</span>
              </p>
              {playlist.alreadyImported ? (
                <p className="text-sm font-semibold text-olive">Already imported</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              {playlist.alreadyImported && playlist.existingSeriesId ? (
                <Link
                  href={`/admin/series/${playlist.existingSeriesId}`}
                  className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
                >
                  Edit Series
                </Link>
              ) : (
                <form action={importYoutubePlaylistAction}>
                  <input type="hidden" name="playlistId" value={playlist.playlistId} />
                  <button type="submit" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
                    Import
                  </button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
