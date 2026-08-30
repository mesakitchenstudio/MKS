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
  updatedAt: string;
};

export type AdminSeriesItemDraft = {
  id?: string;
  recipeId: string;
  youtubeVideoId: string;
  customTitle: string;
  customDescription: string;
  featured: boolean;
  sortOrder: number;
  /** Display helpers for editor UI */
  label: string;
  thumbnail: string;
  meta: string;
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
  youtubePlaylistId: string;
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

export async function listAdminSeries(): Promise<AdminSeriesListRow[]> {
  const db = getDb();
  const rows = await db.series.findMany({
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    include: { _count: { select: { items: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    isPublished: row.isPublished,
    sortOrder: row.sortOrder,
    itemCount: row._count.items,
    updatedAt: row.updatedAt.toISOString(),
  }));
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
          youtubeVideo: { select: { videoId: true, title: true, thumbnailUrl: true } },
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
    youtubePlaylistId: row.youtubePlaylistId,
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
      const bits = [
        item.recipe ? `Recipe: ${item.recipe.slug}` : null,
        item.youtubeVideoId ? `Video: ${item.youtubeVideoId}` : null,
        item.recipe?.status === "published" ? "Published" : item.recipe ? "Draft" : null,
      ].filter(Boolean);
      return {
        id: item.id,
        recipeId: item.recipeId || "",
        youtubeVideoId: item.youtubeVideoId || "",
        customTitle: item.customTitle,
        customDescription: item.customDescription,
        featured: item.featured,
        sortOrder: index,
        label,
        thumbnail: thumb,
        meta: bits.join(" · "),
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

  // Videos without a published/draft linked recipe still selectable as video-only
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
