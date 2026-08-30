import { notFound } from "next/navigation";
import { SeriesEditor } from "@/components/admin/SeriesEditor";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getAdminSeries, listSeriesPickerCandidates } from "@/lib/series-admin";
import { listImportableChannelPlaylists } from "@/lib/series-playlist";

export const dynamic = "force-dynamic";

export default async function AdminSeriesEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    saved?: string;
    error?: string;
    imported?: string;
    videos?: string;
    linked?: string;
    videoOnly?: string;
    skipped?: string;
    refreshed?: string;
    added?: string;
    removed?: string;
    restored?: string;
    reordered?: string;
    playlistLinked?: string;
  }>;
}) {
  await requireAccess("content");
  const { id } = await params;
  const query = await searchParams;
  const [series, candidates, recipeTypes] = await Promise.all([
    getAdminSeries(id),
    listSeriesPickerCandidates(),
    getDb().recipeType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!series) notFound();

  let linkablePlaylists: { playlistId: string; title: string; videoCount: number }[] = [];
  if (series.syncMode !== "YOUTUBE" && !series.youtubePlaylistId) {
    try {
      const playlists = await listImportableChannelPlaylists();
      linkablePlaylists = playlists
        .filter((p) => !p.alreadyImported)
        .map((p) => ({
          playlistId: p.playlistId,
          title: p.title,
          videoCount: p.videoCount,
        }));
    } catch {
      linkablePlaylists = [];
    }
  }

  return (
    <div className="space-y-4">
      {query.saved ? (
        <p className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive" role="status">
          Series saved.
        </p>
      ) : null}
      {query.imported ? (
        <p className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive" role="status">
          Playlist imported: {query.videos || "0"} videos, {query.linked || "0"} linked to Mesa
          recipes, {query.videoOnly || "0"} video-only
          {query.skipped && Number(query.skipped) > 0
            ? `, ${query.skipped} unavailable/skipped`
            : ""}
          . Enrich Mesa editorial fields below, then publish.
        </p>
      ) : null}
      {query.refreshed ? (
        <p className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive" role="status">
          Refreshed from YouTube: {query.added || "0"} new, {query.removed || "0"} marked removed
          {query.restored && Number(query.restored) > 0 ? `, ${query.restored} restored` : ""}
          {query.reordered === "1" ? ", order updated to match playlist" : ", Mesa order preserved"}.
        </p>
      ) : null}
      {query.playlistLinked ? (
        <p className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive" role="status">
          Linked to YouTube playlist and membership synced.
        </p>
      ) : null}
      {query.error ? (
        <p className="rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-2 text-sm text-terracotta" role="alert">
          {decodeURIComponent(query.error)}
        </p>
      ) : null}
      <SeriesEditor
        series={series}
        candidates={candidates}
        recipeTypes={recipeTypes}
        linkablePlaylists={linkablePlaylists}
      />
    </div>
  );
}
