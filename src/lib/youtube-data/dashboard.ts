import { getDb } from "@/lib/db";
import { parseYoutubeDescriptionChapters } from "@/lib/youtube-description";
import { buildRecipeVideoIndex, recipeHasSavedChapters } from "@/lib/youtube-data/matching";
import { getChannelTrendDeltas, getVideoViewsDelta7d } from "@/lib/youtube-data/sync";
import { videoRowStatus } from "@/lib/youtube-data/health";
import { formatGmtDisplay, formatYoutubeSnapshotDateTime } from "@/lib/datetime";
import {
  computeViewsGained,
  formatViewsGainedDisplay,
} from "@/lib/youtube-data/snapshots";

function formatCount(value: string) {
  try {
    return BigInt(value).toLocaleString("en-US");
  } catch {
    return value;
  }
}

export async function loadYoutubeAdminDashboard() {
  const db = getDb();
  const channel = await db.youTubeChannel.findFirst({ orderBy: { lastSyncedAt: "desc" } });
  const [{ byVideoId, recipesWithVideo, recipesWithoutVideo, recipes }, videos] = await Promise.all([
    buildRecipeVideoIndex(),
    db.youTubeVideo.findMany({ orderBy: { publishedAt: "desc" }, take: 100 }),
  ]);

  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  const trend = channel
    ? await getChannelTrendDeltas(channel.channelId, 7)
    : { views: null, subscribers: null };

  const rows = await Promise.all(
    videos.map(async (video) => {
      const link = byVideoId.get(video.videoId);
      const recipe = link ? recipeById.get(link.recipeId) : undefined;
      const descriptionChapters = parseYoutubeDescriptionChapters(video.description);
      const hasRecipeChapters = recipe ? recipeHasSavedChapters(recipe) : false;
      const views7d = await getVideoViewsDelta7d(video.videoId);

      return {
        videoId: video.videoId,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        publishedAt: video.publishedAt ? formatGmtDisplay(video.publishedAt) : "—",
        viewCount: formatCount(video.viewCount),
        likeCount: formatCount(video.likeCount),
        commentCount: formatCount(video.commentCount),
        views7d: views7d ?? "—",
        recipe: link
          ? { id: link.recipeId, slug: link.recipeSlug, title: link.recipeTitle }
          : null,
        status: videoRowStatus({
          privacyStatus: video.privacyStatus,
          embeddable: video.embeddable,
          linkedRecipeId: link?.recipeId,
          hasDescriptionChapters: descriptionChapters.length > 0,
          hasRecipeChapters,
        }),
      };
    }),
  );

  const linkedVideoIds = new Set(recipesWithVideo.map((row) => row.videoId));
  const videosWithoutRecipes = videos.filter((video) => !linkedVideoIds.has(video.videoId)).length;

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
        }
      : null,
    summary: {
      linkedVideos: recipesWithVideo.length,
      videosWithoutRecipes,
      recipesWithVideo: recipesWithVideo.length,
      recipesWithoutVideo: recipesWithoutVideo.length,
    },
    videos: rows,
  };
}

export async function loadYoutubeVideoDetail(videoId: string) {
  const db = getDb();
  const video = await db.youTubeVideo.findUnique({
    where: { videoId },
    include: {
      snapshots: { orderBy: { recordedAt: "desc" }, take: 30 },
    },
  });
  if (!video) return null;

  const { byVideoId } = await buildRecipeVideoIndex();
  const link = byVideoId.get(video.videoId);
  const descriptionChapters = parseYoutubeDescriptionChapters(video.description);

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
  };
}
