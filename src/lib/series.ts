import "server-only";
import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import { resolveRecipeCardTitle } from "@/lib/recipe-dish-identity";
import { readEditorialDishName } from "@/lib/recipe-editor-dish-name";
import { youtubePlaylistUrl, youtubeThumbnailUrl, youtubeWatchUrl } from "@/lib/youtube";
import { recipeMainVideoId } from "@/lib/youtube-data/matching";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import { site } from "@/data/site";
import {
  pickSeriesPreviewItems,
  type PublicSeriesCard,
  type PublicSeriesDetail,
  type PublicSeriesItem,
  type RecipeSeriesLink,
} from "@/lib/series-types";

export type {
  PublicSeriesCard,
  PublicSeriesDetail,
  PublicSeriesItem,
  PublicSeriesPreviewItem,
  RecipeSeriesLink,
} from "@/lib/series-types";
export { seriesItemListJsonLd } from "@/lib/series-types";
export { pickSeriesPreviewItems } from "@/lib/series-types";

function recipeImageFromValues(valuesJson: string): string {
  const values = parseValues(valuesJson);
  const image = typeof values.image === "string" ? values.image.trim() : "";
  return image || "";
}

function itemDisplayTitle(input: {
  customTitle: string;
  recipeTitle?: string | null;
  youtubeTitle?: string | null;
}): string {
  return (
    input.customTitle.trim() ||
    input.recipeTitle?.trim() ||
    input.youtubeTitle?.trim() ||
    "Series item"
  );
}

function resolveItemThumbnail(input: {
  recipeImage?: string;
  youtubeThumbnail?: string;
  youtubeVideoId?: string | null;
}): string {
  if (input.recipeImage) return input.recipeImage;
  if (input.youtubeThumbnail) return input.youtubeThumbnail;
  if (input.youtubeVideoId) return youtubeThumbnailUrl(input.youtubeVideoId, "max");
  return `${site.url}/icon.png`;
}

function mapSeriesItem(row: {
  id: string;
  sortOrder: number;
  customTitle: string;
  customDescription: string;
  featured: boolean;
  removedFromPlaylist?: boolean;
  recipe: {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    status: string;
    values: string;
    type: { name: string };
    categories: { category: { slug: string } }[];
  } | null;
  youtubeVideo: {
    videoId: string;
    title: string;
    thumbnailUrl: string;
    durationDisplay: string;
    privacyStatus: string;
    embeddable: boolean;
  } | null;
}): PublicSeriesItem | null {
  if (row.removedFromPlaylist) return null;
  const recipeOk = row.recipe && row.recipe.status === "published" ? row.recipe : null;
  const video = row.youtubeVideo;
  const videoOk =
    video &&
    video.embeddable !== false &&
    (!video.privacyStatus || video.privacyStatus.toLowerCase() === "public")
      ? video
      : null;

  if (!recipeOk && !videoOk) return null;

  const recipeImage = recipeOk ? recipeImageFromValues(recipeOk.values) : "";
  const title = itemDisplayTitle({
    customTitle: row.customTitle,
    recipeTitle: recipeOk?.title,
    youtubeTitle: videoOk?.title,
  });
  const description =
    row.customDescription.trim() || recipeOk?.excerpt?.trim() || "";

  return {
    id: row.id,
    position: row.sortOrder,
    title,
    description,
    featured: row.featured,
    thumbnail: resolveItemThumbnail({
      recipeImage,
      youtubeThumbnail: videoOk?.thumbnailUrl,
      youtubeVideoId: videoOk?.videoId,
    }),
    recipeId: recipeOk?.id ?? null,
    recipeSlug: recipeOk?.slug ?? null,
    recipeTitle: recipeOk?.title ?? null,
    youtubeVideoId: videoOk?.videoId ?? null,
    youtubeTitle: videoOk?.title ?? null,
    durationDisplay: videoOk?.durationDisplay || "",
    watchUrl: videoOk ? youtubeWatchUrl(videoOk.videoId) : null,
    typeName: recipeOk?.type.name || "",
    categorySlugs: recipeOk?.categories.map((c) => c.category.slug) || [],
  };
}

const itemInclude = {
  recipe: {
    include: {
      type: { select: { name: true } },
      categories: { select: { category: { select: { slug: true } } } },
    },
  },
  youtubeVideo: true,
} as const;

function seriesHeroImage(series: {
  heroImage: string;
  items: PublicSeriesItem[];
}): string {
  if (series.heroImage.trim()) return series.heroImage.trim();
  const featured = series.items.find((i) => i.featured) || series.items[0];
  return featured?.thumbnail || `${site.url}/icon.png`;
}

export async function listPublishedSeries(): Promise<PublicSeriesCard[]> {
  const db = getDb();
  const rows = await db.series.findMany({
    where: { isPublished: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: itemInclude,
      },
    },
  });

  return rows.map((row) => {
    const items = row.items
      .map((item) => mapSeriesItem(item))
      .filter((item): item is PublicSeriesItem => Boolean(item));
    const heroImage = seriesHeroImage({ heroImage: row.heroImage, items });
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      shortTitle: row.shortTitle,
      description: row.description,
      heroImage,
      itemCount: items.length,
      recipeCount: items.filter((i) => i.recipeSlug).length,
      videoCount: items.filter((i) => i.youtubeVideoId).length,
      previewItems: pickSeriesPreviewItems(items, 2),
    };
  });
}

export async function getPublishedSeriesBySlug(slug: string): Promise<PublicSeriesDetail | null> {
  const db = getDb();
  const row = await db.series.findFirst({
    where: { slug, isPublished: true },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: itemInclude,
      },
    },
  });
  if (!row) return null;

  const items = row.items
    .map((item, index) => {
      const mapped = mapSeriesItem(item);
      if (!mapped) return null;
      return { ...mapped, position: index + 1 };
    })
    .filter((item): item is PublicSeriesItem => Boolean(item));

  const featured = items.find((i) => i.featured) || items[0] || null;
  const heroImage = seriesHeroImage({ heroImage: row.heroImage, items });

  const playlistId = row.youtubePlaylistId?.trim() || "";
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortTitle: row.shortTitle,
    description: row.description,
    intro: row.intro,
    heroImage,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    youtubePlaylistId: playlistId || null,
    youtubePlaylistUrl: playlistId ? youtubePlaylistUrl(playlistId) : null,
    itemCount: items.length,
    items,
    featured,
  };
}

export async function listSeriesSlugsForStaticParams(): Promise<string[]> {
  const db = getDb();
  const rows = await db.series.findMany({
    where: { isPublished: true },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}

/** Series that include this published recipe (for recipe-page badges + next-in-series). */
export async function getSeriesLinksForRecipeSlug(recipeSlug: string): Promise<RecipeSeriesLink[]> {
  const db = getDb();
  const recipe = await db.recipe.findFirst({
    where: { slug: recipeSlug, status: "published" },
    select: { id: true },
  });
  if (!recipe) return [];
  return getSeriesLinksForRecipe(recipe.id);
}

/** Series that include this published recipe (for recipe-page badges + next-in-series). */
export async function getSeriesLinksForRecipe(recipeId: string): Promise<RecipeSeriesLink[]> {
  const db = getDb();
  const rows = await db.seriesItem.findMany({
    where: {
      recipeId,
      removedFromPlaylist: false,
      series: { isPublished: true },
    },
    include: {
      series: {
        include: {
          items: {
            where: { removedFromPlaylist: false },
            orderBy: { sortOrder: "asc" },
            include: {
              recipe: { select: { id: true, slug: true, title: true, status: true } },
              youtubeVideo: { select: { videoId: true, title: true } },
            },
          },
        },
      },
    },
  });

  const links: RecipeSeriesLink[] = [];
  for (const row of rows) {
    const ordered = row.series.items;
    const index = ordered.findIndex((item) => item.recipeId === recipeId);
    let nextItem: RecipeSeriesLink["nextItem"] = null;
    if (index >= 0) {
      for (let i = index + 1; i < ordered.length; i += 1) {
        const candidate = ordered[i];
        const recipeOk =
          candidate.recipe && candidate.recipe.status === "published" ? candidate.recipe : null;
        if (!recipeOk && !candidate.youtubeVideo) continue;
        nextItem = {
          recipeSlug: recipeOk?.slug ?? null,
          title:
            candidate.customTitle.trim() ||
            recipeOk?.title ||
            candidate.youtubeVideo?.title ||
            "Next",
          youtubeVideoId: candidate.youtubeVideo?.videoId ?? null,
        };
        break;
      }
    }
    const current = index >= 0 ? ordered[index] : null;
    const itemTitle = current?.customTitle.trim() || null;
    links.push({
      slug: row.series.slug,
      title: row.series.title,
      shortTitle: row.series.shortTitle,
      itemTitle,
      nextItem,
    });
  }
  return links;
}

/** Published recipe slugs that share a Series with this recipe (excluding self). */
export async function getSeriesPeerRecipeSlugs(recipeSlug: string): Promise<string[]> {
  const db = getDb();
  const recipe = await db.recipe.findFirst({
    where: { slug: recipeSlug, status: "published" },
    select: { id: true },
  });
  if (!recipe) return [];

  const memberships = await db.seriesItem.findMany({
    where: { recipeId: recipe.id, removedFromPlaylist: false, series: { isPublished: true } },
    select: { seriesId: true },
  });
  const seriesIds = [...new Set(memberships.map((row) => row.seriesId))];
  if (!seriesIds.length) return [];

  const peers = await db.seriesItem.findMany({
    where: {
      seriesId: { in: seriesIds },
      removedFromPlaylist: false,
      NOT: { recipeId: recipe.id },
      recipe: { status: "published" },
    },
    select: { recipe: { select: { slug: true } } },
  });

  return [
    ...new Set(
      peers.map((row) => row.recipe?.slug).filter((slug): slug is string => Boolean(slug)),
    ),
  ];
}

/**
 * Prefer the next Series item with a usable YouTube video (and optional recipe page).
 */
export async function getSeriesWatchNextForRecipe(input: {
  recipeId?: string;
  recipeSlug?: string;
  currentVideoId: string;
}): Promise<{
  videoId: string;
  title: string;
  thumbnailUrl: string;
  durationDisplay: string;
  watchUrl: string;
  recipeSlug?: string;
  recipeTitle?: string;
  seriesSlug: string;
  seriesTitle: string;
} | null> {
  let recipeId = input.recipeId || "";
  if (!recipeId && input.recipeSlug) {
    const db = getDb();
    const row = await db.recipe.findFirst({
      where: { slug: input.recipeSlug, status: "published" },
      select: { id: true },
    });
    recipeId = row?.id || "";
  }
  if (!recipeId) return null;
  const links = await getSeriesLinksForRecipe(recipeId);
  for (const link of links) {
    if (!link.nextItem) continue;
    const next = link.nextItem;
    if (next.youtubeVideoId && next.youtubeVideoId !== input.currentVideoId) {
      const db = getDb();
      const video = await db.youTubeVideo.findUnique({
        where: { videoId: next.youtubeVideoId },
        select: {
          videoId: true,
          title: true,
          thumbnailUrl: true,
          durationDisplay: true,
          embeddable: true,
          privacyStatus: true,
        },
      });
      if (
        video &&
        video.embeddable !== false &&
        (!video.privacyStatus || video.privacyStatus.toLowerCase() === "public")
      ) {
        let recipeTitle: string | undefined;
        if (next.recipeSlug) {
          const linked = await db.recipe.findFirst({
            where: { slug: next.recipeSlug, status: "published" },
            select: { title: true, values: true },
          });
          if (linked) {
            recipeTitle = resolveRecipeCardTitle({
              title: linked.title,
              dishName: readEditorialDishName(parseValues(linked.values)),
            });
          } else {
            recipeTitle = next.title;
          }
        }
        return {
          videoId: video.videoId,
          title: next.title || video.title,
          thumbnailUrl: video.thumbnailUrl || youtubeThumbnailUrl(video.videoId),
          durationDisplay: video.durationDisplay,
          watchUrl: youtubeWatchUrl(video.videoId) || `https://www.youtube.com/watch?v=${video.videoId}`,
          recipeSlug: next.recipeSlug || undefined,
          recipeTitle,
          seriesSlug: link.slug,
          seriesTitle: link.title,
        };
      }
    }
    // Next item is recipe-only: try resolve its linked video
    if (next.recipeSlug) {
      const db = getDb();
      const recipe = await db.recipe.findFirst({
        where: { slug: next.recipeSlug, status: "published" },
        select: { title: true, values: true },
      });
      if (!recipe) continue;
      const values = parseValues(recipe.values);
      const videoId = recipeMainVideoId({
        youtubeUrl: typeof values.youtubeUrl === "string" ? values.youtubeUrl : undefined,
        youtube: parseRecipeYoutubeBlob(values.youtube),
      });
      if (!videoId || videoId === input.currentVideoId) continue;
      const video = await db.youTubeVideo.findUnique({
        where: { videoId },
        select: {
          videoId: true,
          title: true,
          thumbnailUrl: true,
          durationDisplay: true,
          embeddable: true,
          privacyStatus: true,
        },
      });
      if (
        video &&
        video.embeddable !== false &&
        (!video.privacyStatus || video.privacyStatus.toLowerCase() === "public")
      ) {
        return {
          videoId: video.videoId,
          title: next.title || recipe.title,
          thumbnailUrl: video.thumbnailUrl || youtubeThumbnailUrl(video.videoId),
          durationDisplay: video.durationDisplay,
          watchUrl: youtubeWatchUrl(video.videoId) || `https://www.youtube.com/watch?v=${video.videoId}`,
          recipeSlug: next.recipeSlug,
          recipeTitle: resolveRecipeCardTitle({
            title: recipe.title,
            dishName: readEditorialDishName(values),
          }),
          seriesSlug: link.slug,
          seriesTitle: link.title,
        };
      }
    }
  }
  return null;
}
