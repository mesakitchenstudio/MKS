import "server-only";
import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import { recipeMainVideoId } from "@/lib/youtube-data/matching";
import { classifyYouTubeVideoFormat } from "@/lib/youtube-data/video-format";
import { youtubeThumbnailUrl } from "@/lib/youtube";

export type AdminSeriesListRow = {
  id: string;
  slug: string;
  title: string;
  isPublished: boolean;
  sortOrder: number;
  itemCount: number;
  linkedRecipeCount: number;
  videoOnlyCount: number;
  syncMode: "YOUTUBE" | "CUSTOM";
  followYoutubeOrder: boolean;
  youtubePlaylistId: string;
  youtubePlaylistLastSyncedAt: string | null;
  updatedAt: string;
};

export type AdminSeriesItemStatus =
  | "ready"
  | "video_only"
  | "recipe_unpublished"
  | "video_unavailable"
  | "removed_from_playlist";

export type AdminSeriesItemDraft = {
  id?: string;
  recipeId: string;
  youtubeVideoId: string;
  customTitle: string;
  customDescription: string;
  featured: boolean;
  sortOrder: number;
  removedFromPlaylist: boolean;
  /** Display helpers for editor UI */
  label: string;
  thumbnail: string;
  meta: string;
  status: AdminSeriesItemStatus;
  recipeSlug: string;
  recipePublished: boolean;
  videoPrivacy: string;
  videoEmbeddable: boolean;
};

export type AdminSeriesDetail = {
  id: string;
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  intro: string;
  heroImage: string;
  seoTitle: string;
  seoDescription: string;
  syncMode: "YOUTUBE" | "CUSTOM";
  followYoutubeOrder: boolean;
  youtubePlaylistId: string;
  youtubePlaylistTitle: string;
  youtubePlaylistDescription: string;
  youtubePlaylistThumbnail: string;
  youtubePlaylistLastSyncedAt: string | null;
  isPublished: boolean;
  sortOrder: number;
  items: AdminSeriesItemDraft[];
};

export type SeriesPickerCandidate = {
  key: string;
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  youtubeVideoId: string;
  youtubeTitle: string;
  thumbnail: string;
  typeName: string;
  categorySlugs: string[];
  format: string;
  published: boolean;
  status: string;
};

function resolveItemStatus(input: {
  removedFromPlaylist: boolean;
  recipeStatus: string | null;
  hasRecipe: boolean;
  hasVideo: boolean;
  privacyStatus: string;
  embeddable: boolean;
}): AdminSeriesItemStatus {
  if (input.removedFromPlaylist) return "removed_from_playlist";
  if (input.hasVideo) {
    const privacy = (input.privacyStatus || "public").toLowerCase();
    if (privacy !== "public" || input.embeddable === false) return "video_unavailable";
  }
  if (input.hasRecipe && input.recipeStatus && input.recipeStatus !== "published") {
    return "recipe_unpublished";
  }
  if (input.hasRecipe) return "ready";
  if (input.hasVideo) return "video_only";
  return "video_unavailable";
}

export async function listAdminSeries(): Promise<AdminSeriesListRow[]> {
  const db = getDb();
  const rows = await db.series.findMany({
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    include: {
      items: {
        select: {
          recipeId: true,
          youtubeVideoId: true,
          removedFromPlaylist: true,
        },
      },
    },
  });
  return rows.map((row) => {
    const active = row.items.filter((item) => !item.removedFromPlaylist);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      isPublished: row.isPublished,
      sortOrder: row.sortOrder,
      itemCount: active.length,
      linkedRecipeCount: active.filter((item) => item.recipeId).length,
      videoOnlyCount: active.filter((item) => item.youtubeVideoId && !item.recipeId).length,
      syncMode: row.syncMode === "YOUTUBE" ? "YOUTUBE" : "CUSTOM",
      followYoutubeOrder: row.followYoutubeOrder,
      youtubePlaylistId: row.youtubePlaylistId,
      youtubePlaylistLastSyncedAt: row.youtubePlaylistLastSyncedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export async function getAdminSeries(id: string): Promise<AdminSeriesDetail | null> {
  const db = getDb();
  const row = await db.series.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          recipe: { select: { id: true, title: true, slug: true, values: true, status: true } },
          youtubeVideo: {
            select: {
              videoId: true,
              title: true,
              thumbnailUrl: true,
              privacyStatus: true,
              embeddable: true,
            },
          },
        },
      },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortTitle: row.shortTitle,
    description: row.description,
    intro: row.intro,
    heroImage: row.heroImage,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    syncMode: row.syncMode === "YOUTUBE" ? "YOUTUBE" : "CUSTOM",
    followYoutubeOrder: row.followYoutubeOrder,
    youtubePlaylistId: row.youtubePlaylistId,
    youtubePlaylistTitle: row.youtubePlaylistTitle,
    youtubePlaylistDescription: row.youtubePlaylistDescription,
    youtubePlaylistThumbnail: row.youtubePlaylistThumbnail,
    youtubePlaylistLastSyncedAt: row.youtubePlaylistLastSyncedAt?.toISOString() ?? null,
    isPublished: row.isPublished,
    sortOrder: row.sortOrder,
    items: row.items.map((item, index) => {
      const values = item.recipe ? parseValues(item.recipe.values) : {};
      const image = typeof values.image === "string" ? values.image : "";
      const thumb =
        image ||
        item.youtubeVideo?.thumbnailUrl ||
        (item.youtubeVideoId ? youtubeThumbnailUrl(item.youtubeVideoId) : "") ||
        "";
      const label =
        item.customTitle.trim() ||
        item.recipe?.title ||
        item.youtubeVideo?.title ||
        "Untitled item";
      const status = resolveItemStatus({
        removedFromPlaylist: item.removedFromPlaylist,
        recipeStatus: item.recipe?.status ?? null,
        hasRecipe: Boolean(item.recipeId),
        hasVideo: Boolean(item.youtubeVideoId),
        privacyStatus: item.youtubeVideo?.privacyStatus || "",
        embeddable: item.youtubeVideo?.embeddable !== false,
      });
      const bits = [
        item.recipe ? `Recipe: ${item.recipe.slug}` : "Recipe: none",
        item.youtubeVideoId ? `Video: ${item.youtubeVideoId}` : "Video: none",
        status === "ready"
          ? "Ready"
          : status === "video_only"
            ? "Create recipe"
            : status === "recipe_unpublished"
              ? "Recipe unpublished"
              : status === "removed_from_playlist"
                ? "No longer in YouTube playlist"
                : "Video unavailable",
      ];
      return {
        id: item.id,
        recipeId: item.recipeId || "",
        youtubeVideoId: item.youtubeVideoId || "",
        customTitle: item.customTitle,
        customDescription: item.customDescription,
        featured: item.featured,
        sortOrder: index,
        removedFromPlaylist: item.removedFromPlaylist,
        label,
        thumbnail: thumb,
        meta: bits.join(" · "),
        status,
        recipeSlug: item.recipe?.slug || "",
        recipePublished: item.recipe?.status === "published",
        videoPrivacy: item.youtubeVideo?.privacyStatus || "",
        videoEmbeddable: item.youtubeVideo?.embeddable !== false,
      };
    }),
  };
}

export async function listSeriesPickerCandidates(): Promise<SeriesPickerCandidate[]> {
  const db = getDb();
  const [recipes, videos] = await Promise.all([
    db.recipe.findMany({
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        values: true,
        type: { select: { name: true } },
        categories: { select: { category: { select: { slug: true } } } },
      },
      orderBy: { title: "asc" },
    }),
    db.youTubeVideo.findMany({
      select: {
        videoId: true,
        title: true,
        thumbnailUrl: true,
        durationSeconds: true,
        tags: true,
        description: true,
        privacyStatus: true,
        embeddable: true,
      },
    }),
  ]);

  const videoById = new Map(videos.map((v) => [v.videoId, v]));
  const out: SeriesPickerCandidate[] = [];

  for (const recipe of recipes) {
    const values = parseValues(recipe.values);
    const videoId = recipeMainVideoId({
      youtubeUrl: typeof values.youtubeUrl === "string" ? values.youtubeUrl : undefined,
      youtube: parseRecipeYoutubeBlob(values.youtube),
    });
    const video = videoId ? videoById.get(videoId) : undefined;
    const image = typeof values.image === "string" ? values.image : "";
    const format = video
      ? classifyYouTubeVideoFormat({
          title: video.title,
          description: video.description,
          tags: video.tags,
          durationSeconds: video.durationSeconds,
        })
      : "UNKNOWN";
    out.push({
      key: `recipe:${recipe.id}`,
      recipeId: recipe.id,
      recipeSlug: recipe.slug,
      recipeTitle: recipe.title,
      youtubeVideoId: video?.videoId || "",
      youtubeTitle: video?.title || "",
      thumbnail: image || video?.thumbnailUrl || (video ? youtubeThumbnailUrl(video.videoId) : ""),
      typeName: recipe.type.name,
      categorySlugs: recipe.categories.map((c) => c.category.slug),
      format,
      published: recipe.status === "published",
      status: recipe.status,
    });
  }

  const linkedVideoIds = new Set(out.map((c) => c.youtubeVideoId).filter(Boolean));
  for (const video of videos) {
    if (linkedVideoIds.has(video.videoId)) continue;
    if (video.embeddable === false) continue;
    const privacy = (video.privacyStatus || "public").toLowerCase();
    if (privacy && privacy !== "public") continue;
    const format = classifyYouTubeVideoFormat({
      title: video.title,
      description: video.description,
      tags: video.tags,
      durationSeconds: video.durationSeconds,
    });
    out.push({
      key: `video:${video.videoId}`,
      recipeId: "",
      recipeSlug: "",
      recipeTitle: "",
      youtubeVideoId: video.videoId,
      youtubeTitle: video.title,
      thumbnail: video.thumbnailUrl || youtubeThumbnailUrl(video.videoId),
      typeName: "",
      categorySlugs: [],
      format,
      published: true,
      status: "video-only",
    });
  }

  return out;
}
