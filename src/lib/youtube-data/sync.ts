import { getDb } from "@/lib/db";
import {
  fetchChannelById,
  fetchUploadsPlaylistVideoIds,
  fetchVideosByIds,
  getChannel as fetchRemoteChannel,
} from "@/lib/youtube-data/client";
import { resolveYoutubeChannelId } from "@/lib/youtube-data/config";
import { YouTubeDataError } from "@/lib/youtube-data/errors";
import {
  shouldCreateChannelSnapshot,
  shouldCreateVideoSnapshot,
} from "@/lib/youtube-data/snapshots";
import type { YouTubeSyncResult } from "@/lib/youtube-data/types";

function counterDelta(current: string, previous: string | undefined): string | null {
  if (!previous) return null;
  try {
    const diff = BigInt(current) - BigInt(previous);
    if (diff === BigInt(0)) return "0";
    return diff > BigInt(0) ? `+${diff.toString()}` : diff.toString();
  } catch {
    return null;
  }
}

export async function syncYoutubeChannel(input?: {
  forceSnapshot?: boolean;
}): Promise<YouTubeSyncResult> {
  const db = getDb();
  const forceSnapshot = Boolean(input?.forceSnapshot);
  let channelId = "";

  try {
    channelId = await resolveYoutubeChannelId();
    const remote = await fetchChannelById(channelId);
    if (!remote?.uploadsPlaylistId) {
      throw new YouTubeDataError("channel_unavailable", "YouTube channel uploads playlist was not found.");
    }

    await db.youTubeChannel.upsert({
      where: { channelId: remote.channelId },
      create: {
        channelId: remote.channelId,
        title: remote.title,
        description: remote.description,
        customUrl: remote.customUrl,
        publishedAt: remote.publishedAt ? new Date(remote.publishedAt) : null,
        thumbnailUrl: remote.thumbnailUrl,
        country: remote.country,
        uploadsPlaylistId: remote.uploadsPlaylistId,
        viewCount: remote.viewCount,
        subscriberCount: remote.subscriberCount,
        hiddenSubscriberCount: remote.hiddenSubscriberCount,
        videoCount: remote.videoCount,
        lastSyncAttemptAt: new Date(),
        lastSyncedAt: new Date(),
        lastSyncError: "",
        lastSyncStatus: "success",
      },
      update: {
        title: remote.title,
        description: remote.description,
        customUrl: remote.customUrl,
        publishedAt: remote.publishedAt ? new Date(remote.publishedAt) : null,
        thumbnailUrl: remote.thumbnailUrl,
        country: remote.country,
        uploadsPlaylistId: remote.uploadsPlaylistId,
        viewCount: remote.viewCount,
        subscriberCount: remote.subscriberCount,
        hiddenSubscriberCount: remote.hiddenSubscriberCount,
        videoCount: remote.videoCount,
        lastSyncAttemptAt: new Date(),
        lastSyncedAt: new Date(),
        lastSyncError: "",
        lastSyncStatus: "success",
      },
    });

    const videoIds = await fetchUploadsPlaylistVideoIds(remote.uploadsPlaylistId);
    const remoteVideos = await fetchVideosByIds(videoIds);
    const now = new Date();

    for (const video of remoteVideos) {
      await db.youTubeVideo.upsert({
        where: { videoId: video.videoId },
        create: {
          videoId: video.videoId,
          channelId: remote.channelId,
          title: video.title,
          description: video.description,
          publishedAt: video.publishedAt ? new Date(video.publishedAt) : null,
          thumbnailUrl: video.thumbnailUrl,
          durationSeconds: video.durationSeconds,
          durationDisplay: video.durationDisplay,
          tags: JSON.stringify(video.tags),
          categoryId: video.categoryId,
          definition: video.definition,
          caption: video.caption,
          privacyStatus: video.privacyStatus,
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
          thumbnailUrl: video.thumbnailUrl,
          durationSeconds: video.durationSeconds,
          durationDisplay: video.durationDisplay,
          tags: JSON.stringify(video.tags),
          categoryId: video.categoryId,
          definition: video.definition,
          caption: video.caption,
          privacyStatus: video.privacyStatus,
          embeddable: video.embeddable,
          madeForKids: video.madeForKids,
          viewCount: video.viewCount,
          likeCount: video.likeCount,
          commentCount: video.commentCount,
          lastSyncedAt: now,
        },
      });
    }

    let snapshotCreated = false;

    const latestChannelSnapshot = await db.youTubeChannelSnapshot.findFirst({
      where: { channelId: remote.channelId },
      orderBy: { recordedAt: "desc" },
    });

    if (
      shouldCreateChannelSnapshot(
        latestChannelSnapshot,
        {
          viewCount: remote.viewCount,
          subscriberCount: remote.subscriberCount,
          videoCount: remote.videoCount,
        },
        forceSnapshot,
      )
    ) {
      await db.youTubeChannelSnapshot.create({
        data: {
          channelId: remote.channelId,
          viewCount: remote.viewCount,
          subscriberCount: remote.subscriberCount,
          videoCount: remote.videoCount,
        },
      });
      snapshotCreated = true;
    }

    for (const video of remoteVideos) {
      const latestVideoSnapshot = await db.youTubeVideoSnapshot.findFirst({
        where: { videoId: video.videoId },
        orderBy: { recordedAt: "desc" },
      });

      if (
        shouldCreateVideoSnapshot(latestVideoSnapshot, {
          viewCount: video.viewCount,
          likeCount: video.likeCount,
          commentCount: video.commentCount,
        })
      ) {
        await db.youTubeVideoSnapshot.create({
          data: {
            videoId: video.videoId,
            viewCount: video.viewCount,
            likeCount: video.likeCount,
            commentCount: video.commentCount,
          },
        });
        snapshotCreated = true;
      }
    }

    return {
      ok: true,
      channelId: remote.channelId,
      videosSynced: remoteVideos.length,
      snapshotCreated,
    };
  } catch (error) {
    const message =
      error instanceof YouTubeDataError
        ? error.message
        : error instanceof Error
          ? error.message
          : "YouTube sync failed.";
    const code = error instanceof YouTubeDataError ? error.code : "api_error";

    if (channelId) {
      await db.youTubeChannel.updateMany({
        where: { channelId },
        data: {
          lastSyncAttemptAt: new Date(),
          lastSyncError: message,
          lastSyncStatus: "error",
        },
      });
    }

    return {
      ok: false,
      channelId: channelId || undefined,
      videosSynced: 0,
      snapshotCreated: false,
      error: message,
      errorCode: code,
    };
  }
}

export async function getChannelTrendDeltas(channelId: string, days = 7) {
  const db = getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const snapshots = await db.youTubeChannelSnapshot.findMany({
    where: { channelId, recordedAt: { gte: since } },
    orderBy: { recordedAt: "asc" },
  });
  if (snapshots.length < 2) {
    return { views: null as string | null, subscribers: null as string | null };
  }
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  return {
    views: counterDelta(last.viewCount, first.viewCount),
    subscribers: counterDelta(last.subscriberCount, first.subscriberCount),
  };
}

export async function getVideoViewsDelta7d(videoId: string): Promise<string | null> {
  const db = getDb();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const snapshots = await db.youTubeVideoSnapshot.findMany({
    where: { videoId, recordedAt: { gte: since } },
    orderBy: { recordedAt: "asc" },
  });
  if (snapshots.length < 2) return null;
  return counterDelta(snapshots[snapshots.length - 1].viewCount, snapshots[0].viewCount);
}

export async function getLatestRemoteChannel() {
  return fetchRemoteChannel();
}
