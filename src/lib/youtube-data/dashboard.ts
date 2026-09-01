import { getDb } from "@/lib/db";
import { parseYoutubeDescriptionChapters } from "@/lib/youtube-description";
import { formatChannelSnapshotTrendShort, formatGmtDisplay, formatYoutubeSnapshotDateTime } from "@/lib/datetime";
import {
  buildAttentionQueue,
  catalogMedianPeriodViews,
  listRemainingUnlinkedVideos,
  topAttentionItems,
  type AttentionQueueItem,
} from "@/lib/youtube-data/attention";
import { buildAttentionReviewGroups } from "@/lib/youtube-data/attention-review";
import {
  computeRecipeCoverage,
  computeVideoCoverage,
  computeVideoLinkScopeBreakdown,
  parseChannelVideoCount,
} from "@/lib/youtube-data/coverage";
import {
  buildRecipeVideoIndex,
  recipeHasSavedChapters,
  suggestRecipeMatchForVideo,
} from "@/lib/youtube-data/matching";
import {
  verifiedRecipeHasYoutubeMetadataDrift,
  videoContentHealthStatus,
  videoRelationshipStatus,
  videoRowStatus,
} from "@/lib/youtube-data/health";
import { getChannelTrendDeltas, getVideoViewsDelta7d } from "@/lib/youtube-data/sync";
import {
  computeViewsGained,
  formatViewsGainedDisplay,
} from "@/lib/youtube-data/snapshots";
import {
  classifyYouTubeVideoFormat,
  youtubeVideoFormatLabel,
  type YouTubeVideoFormat,
} from "@/lib/youtube-data/video-format";
import { getAnalyticsConnectionPublic } from "@/lib/youtube-analytics/connection";
import {
  displayMetrics,
  displayVideoAnalyticsMetrics,
  emptyAggregatedMetrics,
  loadChannelAnalyticsAggregate,
  loadVideoAnalyticsAggregate,
  loadVideoAnalyticsAggregatesForIds,
  type AggregatedAnalyticsMetrics,
} from "@/lib/youtube-analytics/aggregate";
import {
  DEFAULT_ANALYTICS_RANGE_DAYS,
  parseAnalyticsRangeDays,
  type AnalyticsRangeDays,
} from "@/lib/youtube-analytics/ranges";
import {
  parseVideoAnalyticsLoadState,
  type VideoAnalyticsLoadState,
  VIDEO_ANALYTICS_API_ERROR_NOTICE,
} from "@/lib/youtube-analytics/status";
import { buildYoutubeContentHealth } from "@/lib/youtube-data/health";

function formatCount(value: string) {
  try {
    return BigInt(value).toLocaleString("en-US");
  } catch {
    return value;
  }
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function loadYoutubeAdminDashboard(input?: {
  analyticsRangeDays?: AnalyticsRangeDays | string | number;
}) {
  const analyticsRangeDays = parseAnalyticsRangeDays(
    input?.analyticsRangeDays ?? DEFAULT_ANALYTICS_RANGE_DAYS,
  );
  const db = getDb();
  const channel = await db.youTubeChannel.findFirst({ orderBy: { lastSyncedAt: "desc" } });

  const [recipeIndex, publishedIndex, allVideos, analyticsConnection, healthIssues] =
    await Promise.all([
      buildRecipeVideoIndex({ includeDrafts: true }),
      buildRecipeVideoIndex({ includeDrafts: false }),
      db.youTubeVideo.findMany({ orderBy: { publishedAt: "desc" } }),
      getAnalyticsConnectionPublic(),
      buildYoutubeContentHealth(),
    ]);

  const { byVideoId, recipes } = recipeIndex;
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const publishedCandidates = publishedIndex.recipesWithoutVideo;

  const publicVideos = allVideos.filter((video) => video.privacyStatus === "public");

  const trend = channel
    ? await getChannelTrendDeltas(channel.channelId, 7)
    : {
        views: null as string | null,
        subscribers: null as string | null,
        fromRecordedAt: null as Date | null,
        toRecordedAt: null as Date | null,
      };

  const channelAnalytics = analyticsConnection.connected
    ? await loadChannelAnalyticsAggregate(
        analyticsConnection.channelId || channel?.channelId || "",
        analyticsRangeDays,
      )
    : emptyAggregatedMetrics();

  const videoMetricsState: VideoAnalyticsLoadState = !analyticsConnection.connected
    ? "SUCCESS_NO_DATA"
    : !analyticsConnection.scopesSufficient
      ? "API_ERROR"
      : parseVideoAnalyticsLoadState(analyticsConnection.videoMetricsStatus) ||
        (analyticsConnection.videoMetricsError ? "API_ERROR" : "SUCCESS_NO_DATA");

  const videoAnalyticsMap =
    analyticsConnection.connected && videoMetricsState !== "API_ERROR"
      ? await loadVideoAnalyticsAggregatesForIds(
          publicVideos.map((video) => video.videoId),
          analyticsRangeDays,
        )
      : new Map<string, AggregatedAnalyticsMetrics>();

  const linkedRecipeMeta =
    [...new Set([...byVideoId.values()].map((link) => link.recipeId))].length > 0
      ? await db.recipe.findMany({
          where: { id: { in: [...new Set([...byVideoId.values()].map((link) => link.recipeId))] } },
          select: { id: true, values: true, aiMeta: true },
        })
      : [];
  const metaById = new Map(linkedRecipeMeta.map((row) => [row.id, row]));

  const formatCounts = { long: 0, shorts: 0, unknown: 0 };
  const attentionVideoInputs: Parameters<typeof buildAttentionQueue>[0]["videos"] = [];

  const rows = await Promise.all(
    publicVideos.map(async (video) => {
      const link = byVideoId.get(video.videoId);
      const recipe = link ? recipeById.get(link.recipeId) : undefined;
      const descriptionChapters = parseYoutubeDescriptionChapters(video.description);
      const hasRecipeChapters = recipe ? recipeHasSavedChapters(recipe) : false;
      const views7d = await getVideoViewsDelta7d(video.videoId);
      const tags = parseTags(video.tags);
      const format: YouTubeVideoFormat = classifyYouTubeVideoFormat({
        title: video.title,
        description: video.description,
        tags,
        durationSeconds: video.durationSeconds,
      });

      const rawAnalytics = videoAnalyticsMap.get(video.videoId) || emptyAggregatedMetrics();
      const analytics = displayVideoAnalyticsMetrics(rawAnalytics, videoMetricsState);

      const possibleMatch = !link ? suggestRecipeMatchForVideo(video.title, publishedCandidates) : null;

      const stored = link ? metaById.get(link.recipeId) : undefined;
      const hasMetadataIssue =
        Boolean(link && stored) &&
        verifiedRecipeHasYoutubeMetadataDrift({
          aiMetaRaw: stored?.aiMeta,
          recipeValuesRaw: stored?.values,
          video: {
            title: video.title,
            thumbnailUrl: video.thumbnailUrl,
            durationDisplay: video.durationDisplay,
            description: video.description,
          },
        });

      const relationship = videoRelationshipStatus({
        linkedRecipeId: link?.recipeId,
        possibleMatchRecipeId: possibleMatch?.id,
      });

      const contentHealth = videoContentHealthStatus({
        privacyStatus: video.privacyStatus,
        embeddable: video.embeddable,
        linkedRecipeId: link?.recipeId,
        hasDescriptionChapters: descriptionChapters.length > 0,
        hasRecipeChapters,
        format,
        hasMetadataIssue,
      });

      attentionVideoInputs.push({
        videoId: video.videoId,
        title: video.title,
        privacyStatus: video.privacyStatus,
        embeddable: video.embeddable,
        format,
        publishedAt: video.publishedAt,
        linkedRecipeId: link?.recipeId,
        linkedRecipeTitle: link?.recipeTitle,
        possibleMatch,
        hasDescriptionChapters: descriptionChapters.length > 0,
        hasRecipeChapters,
        hasMetadataIssue,
        analytics: rawAnalytics,
      });

      return {
        videoId: video.videoId,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        publishedAt: video.publishedAt ? formatGmtDisplay(video.publishedAt) : "—",
        publishedAtSort: video.publishedAt?.getTime() ?? 0,
        viewCount: formatCount(video.viewCount),
        likeCount: formatCount(video.likeCount),
        commentCount: formatCount(video.commentCount),
        views7d: views7d ?? "—",
        format,
        formatLabel: youtubeVideoFormatLabel(format),
        recipe: link
          ? { id: link.recipeId, slug: link.recipeSlug, title: link.recipeTitle }
          : null,
        possibleMatch,
        relationship,
        contentHealth,
        hasMetadataIssue,
        status: videoRowStatus({
          privacyStatus: video.privacyStatus,
          embeddable: video.embeddable,
          linkedRecipeId: link?.recipeId,
          hasDescriptionChapters: descriptionChapters.length > 0,
          hasRecipeChapters,
          format,
        }),
        analytics: {
          periodViews: analytics.views,
          watchTime: analytics.watchTime,
          averageViewDuration: analytics.averageViewDuration,
          averageViewPercentage: analytics.averageViewPercentage,
          subscribersGained: analytics.subscribersGained,
          hasData: analytics.hasData,
          state: analytics.state,
        },
        periodViewsSort: rawAnalytics.views,
        subscribersGainedSort: rawAnalytics.subscribersGained,
        watchTimeSort: rawAnalytics.estimatedMinutesWatched,
      };
    }),
  );

  for (const row of rows) {
    if (row.format === "LONG") formatCounts.long += 1;
    else if (row.format === "SHORT") formatCounts.shorts += 1;
    else formatCounts.unknown += 1;
  }

  const linkedPublicCount = publicVideos.filter((video) => byVideoId.has(video.videoId)).length;
  const linkedPublicVideoIds = publicVideos
    .filter((video) => byVideoId.has(video.videoId))
    .map((video) => video.videoId);
  const linkRecipeIdByVideoId = new Map(
    linkedPublicVideoIds.map((videoId) => [videoId, byVideoId.get(videoId)!.recipeId]),
  );
  const recipeStatusById = new Map(recipes.map((recipe) => [recipe.id, recipe.status]));
  const linkScope = computeVideoLinkScopeBreakdown({
    linkedPublicVideoIds,
    recipeStatusById,
    linkRecipeIdByVideoId,
  });
  const syncedPublicVideoCount = publicVideos.length;
  const channelVideoCount = channel ? parseChannelVideoCount(channel.videoCount) : null;

  const videoCoverage = computeVideoCoverage({
    linkedPublicVideoCount: linkedPublicCount,
    syncedPublicVideoCount,
    channelVideoCount,
    linkScope,
  });

  const recipeCoverage = computeRecipeCoverage({
    publishedWithVideoCount: publishedIndex.recipesWithVideo.length,
    publishedRecipeCount:
      publishedIndex.recipesWithVideo.length + publishedIndex.recipesWithoutVideo.length,
  });

  const medianViews = catalogMedianPeriodViews(
    attentionVideoInputs.map((video) => video.analytics.views),
  );

  const attentionQueueInput = {
    videos: attentionVideoInputs,
    healthIssues,
    catalogMedianPeriodViews: medianViews,
    analyticsConnected: analyticsConnection.connected,
    analyticsRangeDays,
  };

  const attentionQueue = buildAttentionQueue(attentionQueueInput);

  const attentionTop = topAttentionItems(attentionQueue, 3);
  const attentionReview = buildAttentionReviewGroups({
    items: attentionQueue,
    recipesWithoutVideo: publishedIndex.recipesWithoutVideo.map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
    })),
    remainingUnlinkedVideos: listRemainingUnlinkedVideos(attentionQueueInput),
  });
  const subscriberTrendDisplay = formatChannelSnapshotTrendShort({
    delta: trend.subscribers,
    fromRecordedAt: trend.fromRecordedAt,
    toRecordedAt: trend.toRecordedAt,
  });
  const channelAnalyticsDisplay = displayMetrics(channelAnalytics);

  return {
    channel: channel
      ? {
          channelId: channel.channelId,
          title: channel.title,
          thumbnailUrl: channel.thumbnailUrl,
          subscriberCount: formatCount(channel.subscriberCount),
          viewCount: formatCount(channel.viewCount),
          videoCount: formatCount(channel.videoCount),
          hiddenSubscriberCount: channel.hiddenSubscriberCount,
          lastSyncedAt: channel.lastSyncedAt ? formatGmtDisplay(channel.lastSyncedAt) : "Never",
          lastSyncStatus: channel.lastSyncStatus,
          lastSyncError: channel.lastSyncError,
          trendViews7d: trend.views,
          trendSubscribers7d: trend.subscribers,
          trendSubscribersShort: subscriberTrendDisplay.short,
          trendSubscribersTitle: subscriberTrendDisplay.title,
          trendFromDate: trend.fromRecordedAt
            ? `${formatYoutubeSnapshotDateTime(trend.fromRecordedAt).date} ${formatYoutubeSnapshotDateTime(trend.fromRecordedAt).time}`.trim()
            : null,
          trendToDate: trend.toRecordedAt
            ? `${formatYoutubeSnapshotDateTime(trend.toRecordedAt).date} ${formatYoutubeSnapshotDateTime(trend.toRecordedAt).time}`.trim()
            : null,
        }
      : null,
    summary: {
      linkedVideos: linkedPublicCount,
      videosWithoutRecipes: syncedPublicVideoCount - linkedPublicCount,
      recipesWithVideo: recipeCoverage.withVideoCount,
      recipesWithoutVideo: publishedIndex.recipesWithoutVideo.length,
      longVideos: formatCounts.long,
      shorts: formatCounts.shorts,
      unknownFormat: formatCounts.unknown,
      catalogMedianPeriodViews: medianViews,
    },
    coverage: {
      video: videoCoverage,
      recipe: recipeCoverage,
    },
    attention: {
      top: attentionTop,
      all: attentionQueue,
      total: attentionQueue.length,
      review: attentionReview,
    },
    videos: rows,
    analytics: {
      connection: analyticsConnection,
      rangeDays: analyticsRangeDays,
      channel: channelAnalyticsDisplay,
      videoMetricsStatus: videoMetricsState,
      videoMetricsNotice:
        videoMetricsState === "API_ERROR"
          ? analyticsConnection.scopesSufficient
            ? VIDEO_ANALYTICS_API_ERROR_NOTICE
            : "YouTube Analytics needs to be re-authorized for readonly access. Disconnect and connect again."
          : "",
    },
  };
}

export async function loadYoutubeVideoDetail(
  videoId: string,
  input?: { analyticsRangeDays?: AnalyticsRangeDays | string | number },
) {
  const analyticsRangeDays = parseAnalyticsRangeDays(
    input?.analyticsRangeDays ?? DEFAULT_ANALYTICS_RANGE_DAYS,
  );
  const db = getDb();
  const video = await db.youTubeVideo.findUnique({
    where: { videoId },
    include: {
      snapshots: { orderBy: { recordedAt: "desc" }, take: 30 },
    },
  });
  if (!video) return null;

  const { byVideoId } = await buildRecipeVideoIndex({ includeDrafts: true });
  const link = byVideoId.get(video.videoId);
  const descriptionChapters = parseYoutubeDescriptionChapters(video.description);
  const analyticsConnection = await getAnalyticsConnectionPublic();

  const history = video.snapshots
    .slice()
    .reverse()
    .map((snapshot, index, list) => {
      const prev = index > 0 ? list[index - 1] : null;
      const recordedAt = formatYoutubeSnapshotDateTime(snapshot.recordedAt);
      const viewsGained = formatViewsGainedDisplay(
        computeViewsGained(snapshot.viewCount, prev?.viewCount),
      );
      return {
        recordedAt,
        viewCount: formatCount(snapshot.viewCount),
        likeCount: formatCount(snapshot.likeCount),
        commentCount: formatCount(snapshot.commentCount),
        viewsGained,
      };
    })
    .reverse();

  const videoMetricsState: VideoAnalyticsLoadState = !analyticsConnection.connected
    ? "SUCCESS_NO_DATA"
    : !analyticsConnection.scopesSufficient
      ? "API_ERROR"
      : parseVideoAnalyticsLoadState(analyticsConnection.videoMetricsStatus) ||
        (analyticsConnection.videoMetricsError ? "API_ERROR" : "SUCCESS_NO_DATA");

  const analyticsMetrics =
    analyticsConnection.connected && videoMetricsState !== "API_ERROR"
      ? displayVideoAnalyticsMetrics(
          await loadVideoAnalyticsAggregate(video.videoId, analyticsRangeDays),
          videoMetricsState,
        )
      : displayVideoAnalyticsMetrics(emptyAggregatedMetrics(), videoMetricsState);

  return {
    videoId: video.videoId,
    title: video.title,
    description: video.description,
    thumbnailUrl: video.thumbnailUrl,
    publishedAt: video.publishedAt ? formatGmtDisplay(video.publishedAt) : "—",
    durationDisplay: video.durationDisplay,
    viewCount: formatCount(video.viewCount),
    likeCount: formatCount(video.likeCount),
    commentCount: formatCount(video.commentCount),
    privacyStatus: video.privacyStatus,
    embeddable: video.embeddable,
    tags: JSON.parse(video.tags || "[]") as string[],
    descriptionChapters,
    recipe: link
      ? { id: link.recipeId, slug: link.recipeSlug, title: link.recipeTitle }
      : null,
    history,
    analytics: {
      connection: analyticsConnection,
      rangeDays: analyticsRangeDays,
      metrics: analyticsMetrics,
      videoMetricsStatus: videoMetricsState,
      videoMetricsNotice:
        videoMetricsState === "API_ERROR"
          ? analyticsConnection.scopesSufficient
            ? VIDEO_ANALYTICS_API_ERROR_NOTICE
            : "YouTube Analytics needs to be re-authorized for readonly access. Disconnect and connect again."
          : "",
    },
  };
}

export type { AttentionQueueItem };
export type { AttentionReviewGroup } from "@/lib/youtube-data/attention-review";
