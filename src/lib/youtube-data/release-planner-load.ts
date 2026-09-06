import "server-only";
import { getDb } from "@/lib/db";
import { getAnalyticsConnectionPublic } from "@/lib/youtube-analytics/connection";
import { getReleaseCadence } from "@/lib/youtube-data/release-cadence";
import { formatScheduleLastSyncedLabel } from "@/lib/youtube-data/schedule";
import { ENABLE_LOCAL_RELEASE_PLANNING } from "@/lib/youtube-data/schedule-ui";
import {
  buildArchiveMonthJumper,
  buildMonthJumper,
  filterYoutubeArchiveRows,
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

  // Both modes: only calendar-eligible privacy states at the DB layer.
  // mergePlannerRows also re-classifies so publishedAt alone never becomes Published.
  const videoWhere = ENABLE_LOCAL_RELEASE_PLANNING
    ? {
        OR: [
          {
            AND: [{ privacyStatus: "private" }, { scheduledPublishAt: { gt: now } }],
          },
          {
            AND: [{ privacyStatus: "public" }, { publishedAt: { gte: publishedSince } }],
          },
        ],
      }
    : {
        OR: [
          { privacyStatus: "public" },
          {
            AND: [{ privacyStatus: "private" }, { scheduledPublishAt: { gt: now } }],
          },
        ],
      };

  const [videos, localReleases] = await Promise.all([
    db.youTubeVideo.findMany({
      where: videoWhere,
      orderBy: [{ scheduledPublishAt: "asc" }, { publishedAt: "desc" }],
      select: {
        videoId: true,
        title: true,
        description: true,
        tags: true,
        durationSeconds: true,
        durationDisplay: true,
        thumbnailUrl: true,
        scheduledPublishAt: true,
        publishedAt: true,
        privacyStatus: true,
        uploadStatus: true,
      },
    }),
    ENABLE_LOCAL_RELEASE_PLANNING
      ? db.youTubeRelease.findMany({
          orderBy: [{ releaseAt: "asc" }, { createdAt: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  const openSlots = ENABLE_LOCAL_RELEASE_PLANNING
    ? projectCadenceSlots({ cadence, from: now, weeksAhead: 12, now })
    : [];

  const merged = mergePlannerRows({
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
        privacyStatus: video.privacyStatus,
        uploadStatus: video.uploadStatus,
        videoType,
        durationSeconds: video.durationSeconds,
        durationDisplay: video.durationDisplay,
      };
    }),
  });

  const stream = ENABLE_LOCAL_RELEASE_PLANNING
    ? merged
    : filterYoutubeArchiveRows(merged);

  const backlog: PlannerStreamRow[] = ENABLE_LOCAL_RELEASE_PLANNING
    ? localReleases
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
        }))
    : [];

  const lastSyncedAt = channel?.lastSyncedAt ?? null;
  const occupiedMonthKeys = stream.map((row) => row.monthKey).filter(Boolean);

  return {
    status,
    errorMessage,
    lastSyncedAt,
    lastSyncedLabel: formatScheduleLastSyncedLabel(lastSyncedAt),
    analyticsConnected: analytics.connected,
    cadence,
    monthJumper: ENABLE_LOCAL_RELEASE_PLANNING
      ? buildMonthJumper(now)
      : buildArchiveMonthJumper(now, occupiedMonthKeys),
    upNext: selectPlannerUpNext(stream, now),
    attention: ENABLE_LOCAL_RELEASE_PLANNING ? selectPlannerAttention(merged) : [],
    backlog,
    months: groupPlannerRowsByMonth(stream),
    stream,
  };
}
