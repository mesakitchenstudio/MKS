import "server-only";
import { getDb } from "@/lib/db";
import { getAnalyticsConnectionPublic } from "@/lib/youtube-analytics/connection";
import { getReleaseCadence } from "@/lib/youtube-data/release-cadence";
import { formatScheduleLastSyncedLabel } from "@/lib/youtube-data/schedule";
import {
  buildMonthJumper,
  groupPlannerRowsByMonth,
  mergePlannerRows,
  projectCadenceSlots,
  selectPlannerAttention,
  selectPlannerUpNext,
  type PlannerStreamRow,
  type YoutubeReleasePlannerDashboard,
} from "@/lib/youtube-data/release-planner";
import { syncYoutubeScheduledViaOAuth } from "@/lib/youtube-data/scheduled-sync";
import { classifyYouTubeVideoFormat } from "@/lib/youtube-data/video-format";

export type { YoutubeReleasePlannerDashboard };

const RECENT_PUBLISHED_MS = 90 * 24 * 60 * 60 * 1000;
const PLANNER_HISTORY_FLOOR = new Date("2026-09-01T00:00:00.000Z");

export async function loadYoutubeReleasePlanner(input?: {
  refresh?: boolean;
  now?: Date;
}): Promise<YoutubeReleasePlannerDashboard> {
  const db = getDb();
  const now = input?.now ?? new Date();
  const analytics = await getAnalyticsConnectionPublic();
  const channel = await db.youTubeChannel.findFirst({ orderBy: { lastSyncedAt: "desc" } });

  let status: YoutubeReleasePlannerDashboard["status"] = "ok";
  let errorMessage = "";

  // Preserve existing OAuth schedule sync — same gate as loadYoutubeScheduleDashboard.
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

  const cadence = await getReleaseCadence();
  const publishedSince = new Date(
    Math.max(now.getTime() - RECENT_PUBLISHED_MS, PLANNER_HISTORY_FLOOR.getTime()),
  );

  const [videos, localReleases] = await Promise.all([
    db.youTubeVideo.findMany({
      where: {
        OR: [
          { scheduledPublishAt: { gt: now } },
          { publishedAt: { gte: publishedSince } },
        ],
      },
      orderBy: [{ scheduledPublishAt: "asc" }, { publishedAt: "desc" }],
      select: {
        videoId: true,
        title: true,
        description: true,
        tags: true,
        durationSeconds: true,
        thumbnailUrl: true,
        scheduledPublishAt: true,
        publishedAt: true,
      },
    }),
    db.youTubeRelease.findMany({
      orderBy: [{ releaseAt: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const openSlots = projectCadenceSlots({ cadence, from: now, weeksAhead: 12, now });

  const stream = mergePlannerRows({
    now,
    openSlots,
    localReleases: localReleases.map((row) => ({
      id: row.id,
      status: row.status,
      workingTitle: row.workingTitle,
      videoType: row.videoType,
      releaseAt: row.releaseAt,
      slotKey: row.slotKey,
      notes: row.notes,
      skipReason: row.skipReason,
      youtubeVideoId: row.youtubeVideoId,
    })),
    youtubeVideos: videos.map((video) => {
      const format = classifyYouTubeVideoFormat({
        title: video.title,
        description: video.description,
        tags: video.tags,
        durationSeconds: video.durationSeconds,
      });
      const videoType =
        format === "SHORT" ? "SHORT" : format === "LONG" ? "LONG" : "UNKNOWN";
      return {
        videoId: video.videoId,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        scheduledPublishAt: video.scheduledPublishAt,
        publishedAt: video.publishedAt,
        videoType,
      };
    }),
  });

  const backlog: PlannerStreamRow[] = localReleases
    .filter((row) => row.status === "BACKLOG")
    .map((row) => ({
      id: `local:${row.id}`,
      source: "local" as const,
      status: "BACKLOG" as const,
      workingTitle: row.workingTitle || "Untitled",
      videoType:
        row.videoType === "SHORT" || row.videoType === "SPECIAL" || row.videoType === "LONG"
          ? row.videoType
          : ("UNKNOWN" as const),
      releaseAt: row.releaseAt,
      slotKey: row.slotKey,
      dateKey: "",
      monthKey: "",
      label: "Backlog",
      timeLabel: "",
      skipReason: row.skipReason,
      notes: row.notes,
      youtubeVideoId: row.youtubeVideoId,
      youtubeTitle: null,
      thumbnailUrl: null,
      needsAttention: false,
    }));

  const lastSyncedAt = channel?.lastSyncedAt ?? null;

  return {
    status,
    errorMessage,
    lastSyncedAt,
    lastSyncedLabel: formatScheduleLastSyncedLabel(lastSyncedAt),
    analyticsConnected: analytics.connected,
    cadence,
    monthJumper: buildMonthJumper(now),
    upNext: selectPlannerUpNext(stream, now),
    attention: selectPlannerAttention(stream),
    backlog,
    months: groupPlannerRowsByMonth(stream),
    stream,
  };
}
