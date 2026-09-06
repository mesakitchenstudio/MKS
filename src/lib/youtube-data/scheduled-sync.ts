import "server-only";
import { getDb } from "@/lib/db";
import { YouTubeAnalyticsError } from "@/lib/youtube-analytics/errors";
import { getAnalyticsAccessToken } from "@/lib/youtube-analytics/connection";
import {
  fetchUploadsPlaylistVideoIdsOAuth,
  fetchVideosByIdsOAuth,
} from "@/lib/youtube-data/oauth-videos";
import type { YouTubeApiVideo } from "@/lib/youtube-data/types";

export type ScheduledSyncResult =
  | { ok: true; videosSynced: number; scheduledCount: number }
  | { ok: false; error: string; code: "not_connected" | "api_error" | "skipped" };

function scheduledPublishDate(video: YouTubeApiVideo): Date | null {
  if (!video.scheduledPublishAt) return null;
  const date = new Date(video.scheduledPublishAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Upsert channel-owned videos via OAuth so private scheduled publishAt is stored. */
export async function syncYoutubeScheduledViaOAuth(input: {
  channelId: string;
  uploadsPlaylistId: string;
}): Promise<ScheduledSyncResult> {
  let accessToken: string;
  try {
    const token = await getAnalyticsAccessToken();
    accessToken = token.accessToken;
  } catch (error) {
    if (error instanceof YouTubeAnalyticsError && error.code === "not_connected") {
      return {
        ok: false,
        code: "not_connected",
        error:
          "Connect YouTube Analytics to load scheduled videos. Channel-owner authorization is required for unpublished schedule times.",
      };
    }
    return {
      ok: false,
      code: "api_error",
      error:
        error instanceof Error
          ? error.message
          : "Could not authorize YouTube schedule sync.",
    };
  }

  try {
    const videoIds = await fetchUploadsPlaylistVideoIdsOAuth(
      accessToken,
      input.uploadsPlaylistId,
    );
    const remoteVideos = await fetchVideosByIdsOAuth(accessToken, videoIds);
    const db = getDb();
    const now = new Date();
    let scheduledCount = 0;

    for (const video of remoteVideos) {
      const scheduledPublishAt = scheduledPublishDate(video);
      if (scheduledPublishAt && scheduledPublishAt.getTime() > now.getTime()) {
        scheduledCount += 1;
      }

      await db.youTubeVideo.upsert({
        where: { videoId: video.videoId },
        create: {
          videoId: video.videoId,
          channelId: input.channelId,
          title: video.title,
          description: video.description,
          publishedAt: video.publishedAt ? new Date(video.publishedAt) : null,
          scheduledPublishAt,
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
          scheduledPublishAt,
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

    return { ok: true, videosSynced: remoteVideos.length, scheduledCount };
  } catch (error) {
    return {
      ok: false,
      code: "api_error",
      error:
        error instanceof Error
          ? error.message
          : "Could not load YouTube scheduled videos.",
    };
  }
}
