import "server-only";
import { getDb } from "@/lib/db";
import { slugify } from "@/lib/fields";
import { buildRecipeVideoIndex } from "@/lib/youtube-data/matching";
import {
  fetchChannelPlaylists,
  fetchPlaylistById,
  fetchPlaylistVideoRefs,
  fetchVideosByIds,
  type YouTubeApiPlaylist,
} from "@/lib/youtube-data/client";
import { resolveYoutubeChannelId } from "@/lib/youtube-data/config";
import { YouTubeDataError } from "@/lib/youtube-data/errors";
import { coalesceScheduledPublishAt } from "@/lib/youtube-data/schedule";

export type PlaylistImportCandidate = YouTubeApiPlaylist & {
  alreadyImported: boolean;
  existingSeriesId: string | null;
  existingSeriesSlug: string | null;
  existingSeriesTitle: string | null;
};

export type PlaylistImportResult = {
  seriesId: string;
  seriesSlug: string;
  playlistId: string;
  videoCount: number;
  linkedRecipeCount: number;
  videoOnlyCount: number;
  skippedUnavailable: number;
};

export type PlaylistRefreshResult = {
  seriesId: string;
  added: number;
  removedMarked: number;
  restored: number;
  reordered: boolean;
  linkedRecipeCount: number;
  videoOnlyCount: number;
  playlistTitle: string;
};

async function uniqueSeriesSlug(base: string): Promise<string> {
  const db = getDb();
  const slug = slugify(base) || "series";
  let attempt = 0;
  while (attempt < 50) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
    const existing = await db.series.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
    attempt += 1;
  }
  return `${slug}-${Date.now()}`;
}

/** Upsert playlist videos into local YouTubeVideo rows (Data API only — never touches recipes). */
async function ensureLocalYoutubeVideos(videoIds: string[], channelId: string): Promise<Set<string>> {
  const db = getDb();
  const unique = [...new Set(videoIds.filter(Boolean))];
  if (!unique.length) return new Set();

  const remote = await fetchVideosByIds(unique);
  const now = new Date();
  for (const video of remote) {
    await db.youTubeVideo.upsert({
      where: { videoId: video.videoId },
      create: {
        videoId: video.videoId,
        channelId: video.channelId || channelId,
        title: video.title,
        description: video.description,
        publishedAt: video.publishedAt ? new Date(video.publishedAt) : null,
        scheduledPublishAt: coalesceScheduledPublishAt(video.scheduledPublishAt),
        thumbnailUrl: video.thumbnailUrl,
        durationSeconds: video.durationSeconds,
        durationDisplay: video.durationDisplay,
        tags: JSON.stringify(video.tags),
        categoryId: video.categoryId,
        definition: video.definition,
        caption: video.caption,
        privacyStatus: video.privacyStatus,
        uploadStatus: video.uploadStatus,
        embeddable: video.embeddable,
        madeForKids: video.madeForKids,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        commentCount: video.commentCount,
        lastSyncedAt: now,
      },
      update: {
        title: video.title,
        description: video.description,
        publishedAt: video.publishedAt ? new Date(video.publishedAt) : null,
        scheduledPublishAt: coalesceScheduledPublishAt(video.scheduledPublishAt),
        thumbnailUrl: video.thumbnailUrl,
        durationSeconds: video.durationSeconds,
        durationDisplay: video.durationDisplay,
        tags: JSON.stringify(video.tags),
        categoryId: video.categoryId,
        definition: video.definition,
        caption: video.caption,
        privacyStatus: video.privacyStatus,
        uploadStatus: video.uploadStatus,
        embeddable: video.embeddable,
        madeForKids: video.madeForKids,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        commentCount: video.commentCount,
        lastSyncedAt: now,
      },
    });
  }
  return new Set(remote.map((v) => v.videoId));
}

export async function listImportableChannelPlaylists(): Promise<PlaylistImportCandidate[]> {
  const channelId = await resolveYoutubeChannelId();
  const [playlists, imported] = await Promise.all([
    fetchChannelPlaylists(channelId),
    getDb().series.findMany({
      where: { youtubePlaylistId: { not: "" } },
      select: { id: true, slug: true, title: true, youtubePlaylistId: true },
    }),
  ]);
  const byPlaylist = new Map(imported.map((row) => [row.youtubePlaylistId, row]));
  return playlists.map((playlist) => {
    const existing = byPlaylist.get(playlist.playlistId) || null;
    return {
      ...playlist,
      alreadyImported: Boolean(existing),
      existingSeriesId: existing?.id ?? null,
      existingSeriesSlug: existing?.slug ?? null,
      existingSeriesTitle: existing?.title ?? null,
    };
  });
}

async function resolveRecipeLinksForVideos(videoIds: string[]) {
  const { byVideoId } = await buildRecipeVideoIndex({ includeDrafts: true });
  const map = new Map<string, { recipeId: string; published: boolean }>();
  for (const videoId of videoIds) {
    const link = byVideoId.get(videoId);
    if (!link) continue;
    map.set(videoId, { recipeId: link.recipeId, published: false });
  }
  if (!map.size) return map;

  const db = getDb();
  const recipes = await db.recipe.findMany({
    where: { id: { in: [...map.values()].map((v) => v.recipeId) } },
    select: { id: true, status: true },
  });
  const statusById = new Map(recipes.map((r) => [r.id, r.status]));
  for (const [videoId, value] of map) {
    map.set(videoId, {
      recipeId: value.recipeId,
      published: statusById.get(value.recipeId) === "published",
    });
  }
  return map;
}

/**
 * Import a channel playlist as a Mesa Series (YOUTUBE sync mode).
 * Does not overwrite existing series for the same playlist ID.
 */
export async function importYoutubePlaylistAsSeries(playlistId: string): Promise<PlaylistImportResult> {
  const id = playlistId.trim();
  if (!id) throw new YouTubeDataError("api_error", "Playlist ID is required.");

  const db = getDb();
  const existing = await db.series.findFirst({
    where: { youtubePlaylistId: id },
    select: { id: true, slug: true },
  });
  if (existing) {
    throw new YouTubeDataError(
      "api_error",
      `Playlist already imported as Series (${existing.slug}).`,
    );
  }

  const channelId = await resolveYoutubeChannelId();
  const playlist = await fetchPlaylistById(id);
  if (!playlist) throw new YouTubeDataError("api_error", "YouTube playlist was not found.");
  if (playlist.channelId && playlist.channelId !== channelId) {
    throw new YouTubeDataError("api_error", "Playlist does not belong to the Mesa Kitchen Studio channel.");
  }

  const refs = await fetchPlaylistVideoRefs(id);
  const videoIds = refs.map((r) => r.videoId);
  const syncedSet = await ensureLocalYoutubeVideos(videoIds, channelId);
  const recipeLinks = await resolveRecipeLinksForVideos(videoIds);

  let linkedRecipeCount = 0;
  let videoOnlyCount = 0;
  let skippedUnavailable = 0;
  const itemCreates: Array<{
    youtubeVideoId: string | null;
    recipeId: string | null;
    sortOrder: number;
    featured: boolean;
  }> = [];

  for (const ref of refs) {
    if (!syncedSet.has(ref.videoId)) {
      skippedUnavailable += 1;
      continue;
    }
    const link = recipeLinks.get(ref.videoId);
    const recipeId = link?.recipeId ?? null;
    if (recipeId) linkedRecipeCount += 1;
    else videoOnlyCount += 1;
    itemCreates.push({
      youtubeVideoId: ref.videoId,
      recipeId,
      sortOrder: itemCreates.length,
      featured: itemCreates.length === 0,
    });
  }

  const slug = await uniqueSeriesSlug(playlist.title || "playlist");
  const now = new Date();
  const created = await db.series.create({
    data: {
      title: playlist.title || "Untitled playlist",
      slug,
      description: playlist.description.slice(0, 2000),
      syncMode: "YOUTUBE",
      followYoutubeOrder: true,
      youtubePlaylistId: playlist.playlistId,
      youtubePlaylistTitle: playlist.title,
      youtubePlaylistDescription: playlist.description.slice(0, 5000),
      youtubePlaylistThumbnail: playlist.thumbnailUrl,
      youtubePlaylistLastSyncedAt: now,
      isPublished: false,
      items: { create: itemCreates },
    },
  });

  return {
    seriesId: created.id,
    seriesSlug: created.slug,
    playlistId: playlist.playlistId,
    videoCount: itemCreates.length,
    linkedRecipeCount,
    videoOnlyCount,
    skippedUnavailable,
  };
}

/**
 * Attach a YouTube playlist to an existing custom Series (one-time link + membership import).
 * Preserves existing Mesa editorial fields; adds missing playlist videos.
 */
export async function linkCustomSeriesToYoutubePlaylist(
  seriesId: string,
  playlistId: string,
): Promise<PlaylistRefreshResult> {
  const db = getDb();
  const series = await db.series.findUnique({ where: { id: seriesId } });
  if (!series) throw new YouTubeDataError("api_error", "Series not found.");
  if (series.youtubePlaylistId) {
    throw new YouTubeDataError("api_error", "This Series is already linked to a YouTube playlist.");
  }

  const id = playlistId.trim();
  const dup = await db.series.findFirst({
    where: { youtubePlaylistId: id },
    select: { id: true, slug: true },
  });
  if (dup) {
    throw new YouTubeDataError("api_error", `Playlist already imported as Series (${dup.slug}).`);
  }

  const channelId = await resolveYoutubeChannelId();
  const playlist = await fetchPlaylistById(id);
  if (!playlist) throw new YouTubeDataError("api_error", "YouTube playlist was not found.");
  if (playlist.channelId && playlist.channelId !== channelId) {
    throw new YouTubeDataError("api_error", "Playlist does not belong to the Mesa Kitchen Studio channel.");
  }

  await db.series.update({
    where: { id: seriesId },
    data: {
      syncMode: "YOUTUBE",
      followYoutubeOrder: true,
      youtubePlaylistId: playlist.playlistId,
      youtubePlaylistTitle: playlist.title,
      youtubePlaylistDescription: playlist.description.slice(0, 5000),
      youtubePlaylistThumbnail: playlist.thumbnailUrl,
      youtubePlaylistLastSyncedAt: new Date(),
    },
  });

  return refreshSeriesFromYoutubePlaylist(seriesId);
}

/**
 * Refresh playlist membership/order/metadata snapshots.
 * NEVER overwrites Mesa editorial fields (title, intro, SEO, hero, published, custom item copy).
 */
export async function refreshSeriesFromYoutubePlaylist(seriesId: string): Promise<PlaylistRefreshResult> {
  const db = getDb();
  const series = await db.series.findUnique({
    where: { id: seriesId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!series) throw new YouTubeDataError("api_error", "Series not found.");
  if (!series.youtubePlaylistId) {
    throw new YouTubeDataError("api_error", "This Series is not linked to a YouTube playlist.");
  }

  const channelId = await resolveYoutubeChannelId();
  const playlist = await fetchPlaylistById(series.youtubePlaylistId);
  if (!playlist) throw new YouTubeDataError("api_error", "YouTube playlist was not found.");

  const refs = await fetchPlaylistVideoRefs(series.youtubePlaylistId);
  const playlistVideoIds = refs.map((r) => r.videoId);
  const playlistSet = new Set(playlistVideoIds);
  const syncedSet = await ensureLocalYoutubeVideos(playlistVideoIds, channelId);
  const recipeLinks = await resolveRecipeLinksForVideos(playlistVideoIds);

  const existingByVideo = new Map(
    series.items
      .filter((item) => item.youtubeVideoId)
      .map((item) => [item.youtubeVideoId as string, item]),
  );

  let added = 0;
  let removedMarked = 0;
  let restored = 0;
  const followOrder = series.followYoutubeOrder;

  await db.$transaction(async (tx) => {
    // Snapshot playlist metadata only — never Mesa title/intro/SEO/hero/published.
    await tx.series.update({
      where: { id: seriesId },
      data: {
        youtubePlaylistTitle: playlist.title,
        youtubePlaylistDescription: playlist.description.slice(0, 5000),
        youtubePlaylistThumbnail: playlist.thumbnailUrl,
        youtubePlaylistLastSyncedAt: new Date(),
        syncMode: "YOUTUBE",
      },
    });

    for (const item of series.items) {
      if (!item.youtubeVideoId) continue;
      if (!playlistSet.has(item.youtubeVideoId) && !item.removedFromPlaylist) {
        await tx.seriesItem.update({
          where: { id: item.id },
          data: { removedFromPlaylist: true },
        });
        removedMarked += 1;
      }
    }

    for (const ref of refs) {
      if (!syncedSet.has(ref.videoId)) continue;
      const existing = existingByVideo.get(ref.videoId);
      if (existing) {
        const patch: { removedFromPlaylist?: boolean; recipeId?: string } = {};
        if (existing.removedFromPlaylist) {
          patch.removedFromPlaylist = false;
          restored += 1;
        }
        if (!existing.recipeId) {
          const link = recipeLinks.get(ref.videoId);
          if (link?.recipeId) patch.recipeId = link.recipeId;
        }
        if (Object.keys(patch).length) {
          await tx.seriesItem.update({ where: { id: existing.id }, data: patch });
        }
        continue;
      }
      const link = recipeLinks.get(ref.videoId);
      await tx.seriesItem.create({
        data: {
          seriesId,
          youtubeVideoId: ref.videoId,
          recipeId: link?.recipeId ?? null,
          sortOrder: series.items.length + added,
          featured: false,
          removedFromPlaylist: false,
        },
      });
      added += 1;
    }

    if (followOrder) {
      const fresh = await tx.seriesItem.findMany({
        where: { seriesId, removedFromPlaylist: false },
      });
      const byVideo = new Map(fresh.filter((i) => i.youtubeVideoId).map((i) => [i.youtubeVideoId!, i]));
      let order = 0;
      for (const ref of refs) {
        const item = byVideo.get(ref.videoId);
        if (!item) continue;
        await tx.seriesItem.update({
          where: { id: item.id },
          data: { sortOrder: order },
        });
        order += 1;
      }
      const removed = await tx.seriesItem.findMany({
        where: { seriesId, removedFromPlaylist: true },
        orderBy: { sortOrder: "asc" },
      });
      for (const item of removed) {
        await tx.seriesItem.update({
          where: { id: item.id },
          data: { sortOrder: order },
        });
        order += 1;
      }
    }
  });

  const items = await db.seriesItem.findMany({
    where: { seriesId, removedFromPlaylist: false },
    select: { recipeId: true, youtubeVideoId: true },
  });

  return {
    seriesId,
    added,
    removedMarked,
    restored,
    reordered: followOrder,
    linkedRecipeCount: items.filter((i) => i.recipeId).length,
    videoOnlyCount: items.filter((i) => i.youtubeVideoId && !i.recipeId).length,
    playlistTitle: playlist.title,
  };
}

export async function attachRecipeToSeriesItemsByVideoId(input: {
  videoId: string;
  recipeId: string;
}) {
  const videoId = input.videoId.trim();
  const recipeId = input.recipeId.trim();
  if (!videoId || !recipeId) return { updated: 0 };
  const db = getDb();
  const result = await db.seriesItem.updateMany({
    where: {
      youtubeVideoId: videoId,
      recipeId: null,
    },
    data: { recipeId },
  });
  return { updated: result.count };
}

export async function deleteSeriesItemPermanently(seriesItemId: string) {
  const db = getDb();
  await db.seriesItem.delete({ where: { id: seriesItemId } });
}

/** Keep a playlist-removed item in the Mesa Series (clear removed flag). */
export async function keepRemovedSeriesItemInSeries(seriesItemId: string) {
  const db = getDb();
  await db.seriesItem.update({
    where: { id: seriesItemId },
    data: { removedFromPlaylist: false },
  });
}
