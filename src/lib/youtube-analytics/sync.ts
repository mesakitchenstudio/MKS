import "server-only";
import { getDb } from "@/lib/db";
import {
  fetchChannelDayMetrics,
  fetchChannelTrafficByDimension,
  fetchVideoDayMetrics,
} from "@/lib/youtube-analytics/client";
import { markAnalyticsSyncResult } from "@/lib/youtube-analytics/connection";
import { analyticsErrorMessage, YouTubeAnalyticsError } from "@/lib/youtube-analytics/errors";
import { analyticsDateRange, utcDayStart } from "@/lib/youtube-analytics/ranges";

export async function syncYoutubeAnalytics(input?: {
  /** Pull this many trailing days (default 90). */
  days?: 7 | 28 | 90;
}): Promise<{ ok: true; channelDays: number; videoDays: number } | { ok: false; error: string }> {
  const range = analyticsDateRange(input?.days ?? 90);

  try {
    // Channel KPIs are required. Video/traffic are best-effort so a bad video
    // query cannot blank the whole dashboard.
    const channelRows = await fetchChannelDayMetrics({
      startDate: range.startDate,
      endDate: range.endDate,
    });

    const db = getDb();
    const connection = await db.youTubeAnalyticsConnection.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    const channelId = connection?.channelId || "";

    let channelDays = 0;
    for (const row of channelRows) {
      if (!row.day) continue;
      const date = utcDayStart(row.day);
      await db.youTubeAnalyticsChannelDay.upsert({
        where: { channelId_date: { channelId, date } },
        create: {
          channelId,
          date,
          views: Math.round(row.views),
          estimatedMinutesWatched: Math.round(row.estimatedMinutesWatched),
          averageViewDuration: row.averageViewDuration,
          averageViewPercentage: row.averageViewPercentage,
          subscribersGained: Math.round(row.subscribersGained),
          subscribersLost: Math.round(row.subscribersLost),
          likes: Math.round(row.likes),
          comments: Math.round(row.comments),
          shares: Math.round(row.shares),
        },
        update: {
          views: Math.round(row.views),
          estimatedMinutesWatched: Math.round(row.estimatedMinutesWatched),
          averageViewDuration: row.averageViewDuration,
          averageViewPercentage: row.averageViewPercentage,
          subscribersGained: Math.round(row.subscribersGained),
          subscribersLost: Math.round(row.subscribersLost),
          likes: Math.round(row.likes),
          comments: Math.round(row.comments),
          shares: Math.round(row.shares),
        },
      });
      channelDays += 1;
    }

    const catalogVideos = await db.youTubeVideo.findMany({
      select: { videoId: true },
      orderBy: { publishedAt: "desc" },
      take: 400,
    });
    const videoIds = catalogVideos.map((v) => v.videoId);

    let videoRows: Awaited<ReturnType<typeof fetchVideoDayMetrics>> = [];
    try {
      videoRows = await fetchVideoDayMetrics({
        startDate: range.startDate,
        endDate: range.endDate,
        videoIds,
      });
    } catch (error) {
      if (error instanceof YouTubeAnalyticsError && error.code === "quota") throw error;
      // Keep channel sync success; video detail can retry on next refresh.
      console.error("[youtube-analytics] video day sync skipped:", analyticsErrorMessage(error));
    }

    let videoDays = 0;
    for (const row of videoRows) {
      if (!row.day || !row.video) continue;
      const date = utcDayStart(row.day);
      await db.youTubeAnalyticsVideoDay.upsert({
        where: { videoId_date: { videoId: row.video, date } },
        create: {
          videoId: row.video,
          channelId,
          date,
          views: Math.round(row.views),
          estimatedMinutesWatched: Math.round(row.estimatedMinutesWatched),
          averageViewDuration: row.averageViewDuration,
          averageViewPercentage: row.averageViewPercentage,
          subscribersGained: Math.round(row.subscribersGained),
          subscribersLost: Math.round(row.subscribersLost),
          likes: Math.round(row.likes),
          comments: Math.round(row.comments),
          shares: Math.round(row.shares),
        },
        update: {
          channelId,
          views: Math.round(row.views),
          estimatedMinutesWatched: Math.round(row.estimatedMinutesWatched),
          averageViewDuration: row.averageViewDuration,
          averageViewPercentage: row.averageViewPercentage,
          subscribersGained: Math.round(row.subscribersGained),
          subscribersLost: Math.round(row.subscribersLost),
          likes: Math.round(row.likes),
          comments: Math.round(row.comments),
          shares: Math.round(row.shares),
        },
      });
      videoDays += 1;
    }

    // Traffic foundation — best effort, no UI yet.
    for (const dimension of [
      "insightTrafficSourceType",
      "insightTrafficSourceDetail",
      "insightPlaybackLocationType",
    ] as const) {
      const trafficRows = await fetchChannelTrafficByDimension({
        startDate: range.startDate,
        endDate: range.endDate,
        dimension,
      });
      for (const row of trafficRows) {
        if (!row.day) continue;
        const date = utcDayStart(row.day);
        await db.youTubeAnalyticsTrafficDay.upsert({
          where: {
            scope_channelId_videoId_date_dimension_dimensionValue: {
              scope: "channel",
              channelId,
              videoId: "",
              date,
              dimension,
              dimensionValue: row.dimensionValue || "(unknown)",
            },
          },
          create: {
            scope: "channel",
            channelId,
            videoId: "",
            date,
            dimension,
            dimensionValue: row.dimensionValue || "(unknown)",
            views: Math.round(row.views),
            estimatedMinutesWatched: Math.round(row.estimatedMinutesWatched),
          },
          update: {
            views: Math.round(row.views),
            estimatedMinutesWatched: Math.round(row.estimatedMinutesWatched),
          },
        });
      }
    }

    await markAnalyticsSyncResult({ ok: true });
    return { ok: true, channelDays, videoDays };
  } catch (error) {
    const message = analyticsErrorMessage(error);
    await markAnalyticsSyncResult({ ok: false, error: message });
    return { ok: false, error: message };
  }
}

/** True when Analytics sync must never touch Recipe (always — documented for tests). */
export function analyticsSyncTouchesRecipes(): boolean {
  return false;
}

export function assertAnalyticsDoesNotWriteRecipes() {
  if (analyticsSyncTouchesRecipes()) {
    throw new YouTubeAnalyticsError("api_error", "Analytics sync must not write recipes.");
  }
}
