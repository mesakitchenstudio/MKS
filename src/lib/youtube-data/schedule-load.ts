import "server-only";
import { getDb } from "@/lib/db";
import { getAnalyticsConnectionPublic } from "@/lib/youtube-analytics/connection";
import { buildRecipeVideoIndex } from "@/lib/youtube-data/matching";
import { syncYoutubeScheduledViaOAuth } from "@/lib/youtube-data/scheduled-sync";
import {
  classifyScheduledVideoFormat,
  formatScheduleLastSyncedLabel,
  formatScheduledPublishParts,
  parseVideoTagsJson,
  scheduleFormatLabel,
  scheduledVideoStatusLabel,
  selectNextUpScheduledVideo,
  selectUpcomingScheduledVideos,
  youtubeStudioVideoUrl,
  type ScheduledVideoRow,
  type YoutubeScheduleDashboard,
} from "@/lib/youtube-data/schedule";

export async function loadYoutubeScheduleDashboard(input?: {
  /** When true, attempt an OAuth schedule refresh before reading the DB. */
  refresh?: boolean;
}): Promise<YoutubeScheduleDashboard> {
  const db = getDb();
  const analytics = await getAnalyticsConnectionPublic();
  const channel = await db.youTubeChannel.findFirst({ orderBy: { lastSyncedAt: "desc" } });

  let status: YoutubeScheduleDashboard["status"] = "ok";
  let errorMessage = "";

  if (input?.refresh && channel?.uploadsPlaylistId) {
    const syncResult = await syncYoutubeScheduledViaOAuth({
      channelId: channel.channelId,
      uploadsPlaylistId: channel.uploadsPlaylistId,
    });
    if (!syncResult.ok) {
      status = syncResult.code === "not_connected" ? "needs_oauth" : "error";
      errorMessage = syncResult.error;
    }
  } else if (!analytics.connected) {
    status = "needs_oauth";
    errorMessage =
      "Connect YouTube Analytics to load scheduled videos. Channel-owner authorization is required for unpublished schedule times.";
  }

  const now = new Date();
  const [rawVideos, recipeIndex] = await Promise.all([
    db.youTubeVideo.findMany({
      where: {
        scheduledPublishAt: { gt: now },
      },
      orderBy: { scheduledPublishAt: "asc" },
      include: {
        seriesItems: {
          take: 1,
          orderBy: { sortOrder: "asc" },
          include: {
            series: { select: { title: true } },
          },
        },
      },
    }),
    buildRecipeVideoIndex({ includeDrafts: true }),
  ]);

  const upcomingSource = selectUpcomingScheduledVideos(
    rawVideos.filter(
      (video): video is typeof video & { scheduledPublishAt: Date } =>
        video.scheduledPublishAt instanceof Date,
    ),
    now,
  );

  const rows: ScheduledVideoRow[] = upcomingSource.map((video) => {
    const tags = parseVideoTagsJson(video.tags);
    const format = classifyScheduledVideoFormat({
      title: video.title,
      description: video.description,
      tags,
      durationSeconds: video.durationSeconds,
    });
    const linked = recipeIndex.byVideoId.get(video.videoId) ?? null;
    const parts = formatScheduledPublishParts(video.scheduledPublishAt);
    const seriesTitle =
      video.seriesItems.find((item) => item.series?.title)?.series?.title?.trim() || null;

    return {
      videoId: video.videoId,
      youtubeTitle: video.title,
      displayTitle: linked?.recipeTitle || video.title,
      thumbnailUrl: video.thumbnailUrl,
      format,
      formatLabel: scheduleFormatLabel(format),
      scheduledPublishAt: video.scheduledPublishAt,
      scheduledDateLabel: parts.dateLabel,
      scheduledTimeLabel: parts.timeLabel,
      timezoneLabel: parts.timezoneLabel,
      statusLabel: scheduledVideoStatusLabel({
        scheduledPublishAt: video.scheduledPublishAt,
        privacyStatus: video.privacyStatus,
        uploadStatus: video.uploadStatus,
        now,
      }),
      privacyStatus: video.privacyStatus,
      uploadStatus: video.uploadStatus,
      recipe: linked
        ? { id: linked.recipeId, slug: linked.recipeSlug, title: linked.recipeTitle }
        : null,
      seriesTitle,
      studioUrl: youtubeStudioVideoUrl(video.videoId),
    };
  });

  const lastSyncedAt = channel?.lastSyncedAt ?? null;

  return {
    status,
    errorMessage,
    lastSyncedAt,
    lastSyncedLabel: formatScheduleLastSyncedLabel(lastSyncedAt),
    analyticsConnected: analytics.connected,
    nextUp: selectNextUpScheduledVideo(rows),
    upcoming: rows.slice(1),
  };
}
