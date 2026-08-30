import { getDb } from "@/lib/db";
import { formatGmtDisplay } from "@/lib/datetime";
import { parseValues } from "@/lib/recipe-map";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import { buildRecipeVideoIndex, recipeMainVideoId } from "@/lib/youtube-data/matching";
import type { SyncedYoutubeVideo } from "@/lib/youtube-data/recipe-link";

export type YoutubeVideoSelectorRow = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  durationDisplay: string;
  privacyStatus: string;
  embeddable: boolean;
  linkedRecipe: { id: string; title: string; slug: string } | null;
};

export async function listSyncedVideosForSelector(input?: {
  query?: string;
  excludeRecipeId?: string;
}): Promise<YoutubeVideoSelectorRow[]> {
  const db = getDb();
  const query = String(input?.query ?? "").trim().toLowerCase();
  const { byVideoId } = await buildRecipeVideoIndex({ includeDrafts: true });

  const videos = await db.youTubeVideo.findMany({
    orderBy: { publishedAt: "desc" },
  });

  const rows = videos
    .map((video) => {
      const link = byVideoId.get(video.videoId);
      const linkedRecipe =
        link && link.recipeId !== input?.excludeRecipeId
          ? { id: link.recipeId, title: link.recipeTitle, slug: link.recipeSlug }
          : null;

      return {
        videoId: video.videoId,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        publishedAt: video.publishedAt ? formatGmtDisplay(video.publishedAt) : "—",
        durationDisplay: video.durationDisplay || "—",
        privacyStatus: video.privacyStatus || "—",
        embeddable: video.embeddable,
        linkedRecipe,
        _sortUnlinked: linkedRecipe ? 1 : 0,
      };
    })
    .filter((row) => {
      if (!query) return true;
      return (
        row.title.toLowerCase().includes(query) ||
        row.videoId.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => a._sortUnlinked - b._sortUnlinked || a.title.localeCompare(b.title));

  return rows.map(({ _sortUnlinked: _, ...row }) => row);
}

export async function loadSyncedVideoForLink(videoId: string): Promise<SyncedYoutubeVideo | null> {
  const db = getDb();
  const video = await db.youTubeVideo.findUnique({ where: { videoId } });
  if (!video) return null;

  let tags: string[] = [];
  try {
    tags = JSON.parse(video.tags || "[]") as string[];
  } catch {
    tags = [];
  }

  return {
    videoId: video.videoId,
    title: video.title,
    description: video.description,
    thumbnailUrl: video.thumbnailUrl,
    durationDisplay: video.durationDisplay,
    durationSeconds: video.durationSeconds,
    publishedAt: video.publishedAt,
    privacyStatus: video.privacyStatus,
    embeddable: video.embeddable,
    tags,
  };
}

export async function findRecipeIdLinkedToVideo(
  videoId: string,
  excludeRecipeId?: string,
): Promise<{ id: string; title: string } | null> {
  const { byVideoId } = await buildRecipeVideoIndex({ includeDrafts: true });
  const link = byVideoId.get(videoId);
  if (!link || link.recipeId === excludeRecipeId) return null;
  return { id: link.recipeId, title: link.recipeTitle };
}

export async function clearRecipeYoutubeLinkInDb(recipeId: string) {
  const db = getDb();
  const recipe = await db.recipe.findUnique({ where: { id: recipeId }, select: { values: true } });
  if (!recipe) return false;

  const values = parseValues(recipe.values);
  values.youtubeUrl = "";
  delete values.youtube;

  await db.recipe.update({
    where: { id: recipeId },
    data: { values: JSON.stringify(values) },
  });
  return true;
}

export async function recipeHasYoutubeLink(recipeId: string): Promise<boolean> {
  const db = getDb();
  const recipe = await db.recipe.findUnique({ where: { id: recipeId }, select: { values: true } });
  if (!recipe) return false;
  const values = parseValues(recipe.values);
  return Boolean(
    recipeMainVideoId({
      youtubeUrl: String(values.youtubeUrl ?? ""),
      youtube: parseRecipeYoutubeBlob(values.youtube),
    }),
  );
}
