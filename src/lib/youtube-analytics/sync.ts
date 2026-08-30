import "server-only";
import { getDb } from "@/lib/db";
import {
  fetchChannelDayMetrics,
  fetchChannelTrafficByDimension,
  fetchTopVideoMetrics,
} from "@/lib/youtube-analytics/client";
import { markAnalyticsSyncResult } from "@/lib/youtube-analytics/connection";
import { analyticsErrorMessage, YouTubeAnalyticsError } from "@/lib/youtube-analytics/errors";
import {
  ANALYTICS_RANGE_DAYS,
  analyticsDateRange,
  analyticsVideoPeriodStoreDate,
  utcDayStart,
} from "@/lib/youtube-analytics/ranges";
import type { VideoAnalyticsLoadState } from "@/lib/youtube-analytics/status";

export async function syncYoutubeAnalytics(input?: {
  /** Pull this many trailing days for channel daily rows (default 90). */
  days?: 7 | 28 | 90;
}): Promise<
  | {
      ok: true;
      channelDays: number;
      videoDays: number;
      videoMetricsStatus: VideoAnalyticsLoadState;
    }
  | { ok: false; error: string }
> {
  const range = analyticsDateRange(input?.days ?? 90);

  try {
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

    let videoDays = 0;
    let videoMetricsStatus: VideoAnalyticsLoadState = "SUCCESS_NO_DATA";
    let videoMetricsError = "";

    try {
      for (const days of ANALYTICS_RANGE_DAYS) {
        const period = analyticsDateRange(days);
        const videoRows = await fetchTopVideoMetrics({
          startDate: period.startDate,
          endDate: period.endDate,
        });
        const storeDate = analyticsVideoPeriodStoreDate(days);

        for (const row of videoRows) {
          if (!row.video) continue;
          await db.youTubeAnalyticsVideoDay.upsert({
            where: { videoId_date: { videoId: row.video, date: storeDate } },
            create: {
              videoId: row.video,
              channelId,
              date: storeDate,
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

        if (videoRows.length > 0) {
          videoMetricsStatus = "SUCCESS_WITH_DATA";
        }
      }
    } catch (error) {
      if (error instanceof YouTubeAnalyticsError && error.code === "quota") throw error;
      videoMetricsStatus = "API_ERROR";
      videoMetricsError = analyticsErrorMessage(error);
      console.error("[youtube-analytics] top-videos sync failed:", videoMetricsError);
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

    await markAnalyticsSyncResult({
      ok: true,
      videoMetricsStatus,
      videoMetricsError,
    });
    return { ok: true, channelDays, videoDays, videoMetricsStatus };
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
