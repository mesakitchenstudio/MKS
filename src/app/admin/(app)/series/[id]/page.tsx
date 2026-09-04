import {
  AdminFlashStatus,
} from "@/lib/admin-transient-feedback";
import { notFound } from "next/navigation";
import { SeriesEditor } from "@/components/admin/SeriesEditor";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getAdminSeries, listSeriesPickerCandidates } from "@/lib/series-admin";
import { listImportableChannelPlaylists } from "@/lib/series-playlist";

export const dynamic = "force-dynamic";

export const SERIES_EDITOR_FLASH_PARAMS = [
  "saved",
  "error",
  "imported",
  "videos",
  "linked",
  "videoOnly",
  "skipped",
  "refreshed",
  "added",
  "removed",
  "restored",
  "reordered",
  "playlistLinked",
  "editorial",
  "editorialError",
  "editorialMessage",
] as const;

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
    editorial?: string;
    editorialError?: string;
    editorialMessage?: string;
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

  const importedMessage = query.imported
    ? `Playlist imported: ${query.videos || "0"} videos, ${query.linked || "0"} linked to Mesa recipes, ${query.videoOnly || "0"} video-only${
        query.skipped && Number(query.skipped) > 0 ? `, ${query.skipped} unavailable/skipped` : ""
      }.`
    : "";

  const refreshedMessage = query.refreshed
    ? `Refreshed from YouTube: ${query.added || "0"} new, ${query.removed || "0"} marked removed${
        query.restored && Number(query.restored) > 0 ? `, ${query.restored} restored` : ""
      }${query.reordered === "1" ? ", order updated to match playlist" : ", Mesa order preserved"}.`
    : "";

  return (
    <div className="space-y-4">
      <AdminFlashStatus
        active={Boolean(query.saved)}
        clearParams={SERIES_EDITOR_FLASH_PARAMS}
        className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive"
      >
        Series saved.
      </AdminFlashStatus>
      <AdminFlashStatus
        active={Boolean(importedMessage)}
        clearParams={SERIES_EDITOR_FLASH_PARAMS}
        className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive"
      >
        {importedMessage || "Playlist imported."}
      </AdminFlashStatus>
      <AdminFlashStatus
        active={Boolean(query.editorial)}
        clearParams={SERIES_EDITOR_FLASH_PARAMS}
        className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive"
      >
        Mesa editorial AI draft generated — review before publishing.
      </AdminFlashStatus>
      <AdminFlashStatus
        active={Boolean(query.editorialError)}
        clearParams={SERIES_EDITOR_FLASH_PARAMS}
        className="rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-2 text-sm text-terracotta"
      >
        {`Playlist imported successfully. AI editorial draft could not be generated${
          query.editorialMessage ? `: ${decodeURIComponent(query.editorialMessage)}` : "."
        } Use Generate Mesa editorial draft below to retry.`}
      </AdminFlashStatus>
      <AdminFlashStatus
        active={Boolean(refreshedMessage)}
        clearParams={SERIES_EDITOR_FLASH_PARAMS}
        className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive"
      >
        {refreshedMessage || "Refreshed."}
      </AdminFlashStatus>
      <AdminFlashStatus
        active={Boolean(query.playlistLinked)}
        clearParams={SERIES_EDITOR_FLASH_PARAMS}
        className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive"
      >
        Linked to YouTube playlist and membership synced.
      </AdminFlashStatus>
      <AdminFlashStatus
        active={Boolean(query.error)}
        clearParams={SERIES_EDITOR_FLASH_PARAMS}
        className="rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-2 text-sm text-terracotta"
      >
        {query.error ? decodeURIComponent(query.error) : "Error"}
      </AdminFlashStatus>
      <SeriesEditor
        key={[
          series.id,
          series.youtubePlaylistLastSyncedAt ?? "",
          series.aiMeta.generatedAt ?? "",
          series.aiMeta.verifiedAt ?? "",
          series.items.map((item) => item.id ?? "").join(","),
          query.saved ?? "",
          query.refreshed ?? "",
          query.editorial ?? "",
          query.playlistLinked ?? "",
        ].join(":")}
        series={series}
        candidates={candidates}
        recipeTypes={recipeTypes}
        linkablePlaylists={linkablePlaylists}
        saved={Boolean(query.saved)}
      />
    </div>
  );
}
