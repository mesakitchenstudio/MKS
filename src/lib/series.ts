import "server-only";
import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import { resolveRecipeCardTitle } from "@/lib/recipe-dish-identity";
import { readEditorialDishName } from "@/lib/recipe-editor-dish-name";
import { youtubePlaylistUrl, youtubeThumbnailUrl, youtubeWatchUrl } from "@/lib/youtube";
import { recipeMainVideoId } from "@/lib/youtube-data/matching";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import {
  isSyncedVideoCatalogueEligible,
  resolvePublicVideoDiscoveryHref,
} from "@/lib/public-videos/watch-route";
import { site } from "@/data/site";
import { isSeriesMembershipPubliclyRenderable } from "@/lib/series-public-visibility";
import {
  selectRelatedSeries,
  type RelatedSeriesScoringCandidate,
} from "@/lib/series-related";
import { selectCategoryCollections, type CategoryCollectionScoringCandidate } from "@/lib/series-category-related";
import { selectRecipeCollectionMemberships } from "@/lib/series-recipe-membership";
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

function recipeTotalMinutesFromValues(valuesJson: string): number | null {
  const values = parseValues(valuesJson);
  const prep = Number(values.prepMinutes) || 0;
  const bake = Number(values.bakeMinutes) || 0;
  const cook = Number(values.cookMinutes) || 0;
  const rest = Number(values.restMinutes) || 0;
  const heat = bake > 0 && cook > 0 && bake !== cook ? bake + cook : Math.max(bake, cook);
  const minutes = prep + heat + rest;
  return minutes > 0 ? minutes : null;
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
    categories: { category: { slug: string; name: string } }[];
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
  // Public privacy for display/fallback; catalogue eligibility for Mesa watch routing.
  const videoPublic =
    video &&
    (!video.privacyStatus || video.privacyStatus.toLowerCase() === "public")
      ? video
      : null;
  const catalogueEligible = videoPublic
    ? isSyncedVideoCatalogueEligible({
        videoId: videoPublic.videoId,
        title: videoPublic.title,
        thumbnailUrl: videoPublic.thumbnailUrl,
        privacyStatus: videoPublic.privacyStatus,
      })
    : false;
  const discovery = videoPublic
    ? resolvePublicVideoDiscoveryHref({
        videoId: videoPublic.videoId,
        catalogueEligible,
        youtubeWatchUrl: youtubeWatchUrl(videoPublic.videoId),
      })
    : null;

  if (!recipeOk && !videoPublic) return null;

  const recipeImage = recipeOk ? recipeImageFromValues(recipeOk.values) : "";
  const title = itemDisplayTitle({
    customTitle: row.customTitle,
    recipeTitle: recipeOk?.title,
    youtubeTitle: videoPublic?.title,
  });
  const description =
    row.customDescription.trim() || recipeOk?.excerpt?.trim() || "";
  const totalTimeMinutes = recipeOk ? recipeTotalMinutesFromValues(recipeOk.values) : null;

  return {
    id: row.id,
    position: row.sortOrder,
    title,
    description,
    featured: row.featured,
    thumbnail: resolveItemThumbnail({
      recipeImage,
      youtubeThumbnail: videoPublic?.thumbnailUrl,
      youtubeVideoId: videoPublic?.videoId,
    }),
    recipeId: recipeOk?.id ?? null,
    recipeSlug: recipeOk?.slug ?? null,
    recipeTitle: recipeOk?.title ?? null,
    youtubeVideoId: videoPublic?.videoId ?? null,
    youtubeTitle: videoPublic?.title ?? null,
    durationDisplay: videoPublic?.durationDisplay || "",
    watchUrl: discovery?.href ?? null,
    watchExternal: discovery?.external ?? false,
    typeName: recipeOk?.type.name || "",
    categorySlugs: recipeOk?.categories.map((c) => c.category.slug) || [],
    primaryCategoryLabel: recipeOk?.categories[0]?.category.name?.trim() || "",
    totalTimeMinutes,
  };
}

const itemInclude = {
  recipe: {
    include: {
      type: { select: { name: true } },
      categories: { select: { category: { select: { slug: true, name: true } } } },
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

  return rows
    .map((row) => {
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
    })
    .filter((card) => card.itemCount > 0);
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
  return mapSeriesDetailRow(row);
}

/**
 * Admin Collection Preview — load by canonical Series.id for any publish state.
 * Public item filtering still omits unpublished recipes (same as live pages).
 */
export async function getSeriesDetailByIdForAdminPreview(
  seriesId: string,
): Promise<(PublicSeriesDetail & { isPublished: boolean }) | null> {
  const id = seriesId.trim();
  if (!id) return null;
  const db = getDb();
  const row = await db.series.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: itemInclude,
      },
    },
  });
  if (!row) return null;
  return {
    ...mapSeriesDetailRow(row),
    isPublished: row.isPublished,
  };
}

function scoringCandidateFromRow(row: {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  syncMode: string;
  isPublished: boolean;
  items: Array<{
    removedFromPlaylist: boolean;
    recipeId: string | null;
    youtubeVideoId: string | null;
    recipe: {
      id: string;
      status: string;
      type: { name: string } | null;
      categories: { category: { slug: string } }[];
    } | null;
    youtubeVideo: { privacyStatus: string } | null;
  }>;
}): RelatedSeriesScoringCandidate & {
  description: string;
  heroImage: string;
  recipeCount: number;
  videoCount: number;
  shortTitle: string;
} {
  const publishedRecipeIds: string[] = [];
  const categorySlugs: string[] = [];
  const typeNames: string[] = [];
  let visibleItemCount = 0;
  let recipeCount = 0;
  let videoCount = 0;

  for (const item of row.items) {
    const recipePublished = item.recipe?.status === "published";
    const renderable = isSeriesMembershipPubliclyRenderable({
      removedFromPlaylist: item.removedFromPlaylist,
      recipeId: item.recipeId,
      recipePublished,
      youtubeVideoId: item.youtubeVideoId,
      videoPrivacy: item.youtubeVideo?.privacyStatus ?? "",
    });
    if (!renderable) continue;
    visibleItemCount += 1;
    if (recipePublished && item.recipe) {
      publishedRecipeIds.push(item.recipe.id);
      recipeCount += 1;
      if (item.recipe.type?.name) typeNames.push(item.recipe.type.name);
      for (const link of item.recipe.categories) {
        categorySlugs.push(link.category.slug);
      }
    }
    if (item.youtubeVideoId) videoCount += 1;
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    sortOrder: row.sortOrder,
    syncMode: row.syncMode,
    publishedRecipeIds,
    categorySlugs,
    typeNames,
    visibleItemCount,
    isPublished: row.isPublished,
    description: "",
    heroImage: "",
    recipeCount,
    videoCount,
    shortTitle: "",
  };
}

/**
 * Slim Related Collections loader — scores candidates without full public detail payloads.
 */
export async function listRelatedPublishedSeriesCards(
  seriesId: string,
): Promise<PublicSeriesCard[]> {
  const id = seriesId.trim();
  if (!id) return [];
  const db = getDb();

  const relatedInclude = {
    items: {
      where: { removedFromPlaylist: false },
      select: {
        removedFromPlaylist: true,
        recipeId: true,
        youtubeVideoId: true,
        recipe: {
          select: {
            id: true,
            status: true,
            type: { select: { name: true } },
            categories: { select: { category: { select: { slug: true } } } },
          },
        },
        youtubeVideo: { select: { privacyStatus: true, thumbnailUrl: true } },
      },
    },
  } as const;

  const currentRow = await db.series.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      sortOrder: true,
      syncMode: true,
      isPublished: true,
      ...relatedInclude,
    },
  });
  if (!currentRow) return [];

  const current = scoringCandidateFromRow(currentRow);

  const candidates = await db.series.findMany({
    where: { isPublished: true, id: { not: id } },
    select: {
      id: true,
      slug: true,
      title: true,
      shortTitle: true,
      description: true,
      heroImage: true,
      sortOrder: true,
      syncMode: true,
      isPublished: true,
      ...relatedInclude,
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });

  const scoringInputs: RelatedSeriesScoringCandidate[] = candidates.map((row) => {
    const scored = scoringCandidateFromRow(row);
    return {
      id: scored.id,
      slug: scored.slug,
      title: scored.title,
      sortOrder: scored.sortOrder,
      syncMode: scored.syncMode,
      publishedRecipeIds: scored.publishedRecipeIds,
      categorySlugs: scored.categorySlugs,
      typeNames: scored.typeNames,
      visibleItemCount: scored.visibleItemCount,
      isPublished: scored.isPublished,
    };
  });

  const winners = selectRelatedSeries(current, scoringInputs, 3);
  if (winners.length === 0) return [];

  const byId = new Map(candidates.map((row) => [row.id, row]));
  return winners.map((winner) => {
    const row = byId.get(winner.id)!;
    const scored = scoringCandidateFromRow(row);
    const heroFromVideo = row.items.find(
      (item) =>
        item.youtubeVideo?.thumbnailUrl &&
        isSeriesMembershipPubliclyRenderable({
          removedFromPlaylist: item.removedFromPlaylist,
          recipeId: item.recipeId,
          recipePublished: item.recipe?.status === "published",
          youtubeVideoId: item.youtubeVideoId,
          videoPrivacy: item.youtubeVideo?.privacyStatus ?? "",
        }),
    )?.youtubeVideo?.thumbnailUrl;
    const heroImage =
      row.heroImage.trim() || heroFromVideo || `${site.url}/icon.png`;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      shortTitle: row.shortTitle,
      description: row.description,
      heroImage,
      itemCount: scored.visibleItemCount,
      recipeCount: scored.recipeCount,
      videoCount: scored.videoCount,
      previewItems: [],
    };
  });
}

function mapSeriesDetailRow(row: {
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
  items: Parameters<typeof mapSeriesItem>[0][];
}): PublicSeriesDetail {
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

/**
 * Static prebuild slugs for published Collections with ≥1 public item.
 * Empty published Collections stay reachable at runtime (`dynamicParams = true`) as noindex.
 */
export async function listSeriesSlugsForStaticParams(): Promise<string[]> {
  const cards = await listPublishedSeries();
  return cards.map((card) => card.slug);
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

/**
 * Slim Recipe → Collection membership for hero + continued viewing.
 * Does not load full Series trees for every membership — only winners (cap 3)
 * get a narrow next-item scan.
 */
export async function getSeriesLinksForRecipe(recipeId: string): Promise<RecipeSeriesLink[]> {
  const id = recipeId.trim();
  if (!id) return [];
  const db = getDb();

  const memberships = await db.seriesItem.findMany({
    where: {
      recipeId: id,
      removedFromPlaylist: false,
      series: { isPublished: true },
    },
    select: {
      customTitle: true,
      series: {
        select: {
          id: true,
          slug: true,
          title: true,
          shortTitle: true,
          sortOrder: true,
          syncMode: true,
        },
      },
    },
  });
  if (!memberships.length) return [];

  const bySeriesId = new Map<
    string,
    {
      id: string;
      slug: string;
      title: string;
      shortTitle: string;
      sortOrder: number;
      syncMode: string;
      itemTitle: string | null;
    }
  >();
  for (const row of memberships) {
    if (bySeriesId.has(row.series.id)) continue;
    bySeriesId.set(row.series.id, {
      id: row.series.id,
      slug: row.series.slug,
      title: row.series.title,
      shortTitle: row.series.shortTitle,
      sortOrder: row.series.sortOrder,
      syncMode: row.series.syncMode,
      itemTitle: row.customTitle.trim() || null,
    });
  }

  const seriesIds = [...bySeriesId.keys()];
  const visibilityRows = await db.seriesItem.findMany({
    where: { seriesId: { in: seriesIds }, removedFromPlaylist: false },
    select: {
      seriesId: true,
      recipeId: true,
      youtubeVideoId: true,
      recipe: { select: { status: true } },
      youtubeVideo: { select: { privacyStatus: true } },
    },
  });

  const visibleBySeries = new Map<string, number>();
  for (const row of visibilityRows) {
    const ok = isSeriesMembershipPubliclyRenderable({
      removedFromPlaylist: false,
      recipeId: row.recipeId,
      recipePublished: row.recipe?.status === "published",
      youtubeVideoId: row.youtubeVideoId,
      videoPrivacy: row.youtubeVideo?.privacyStatus ?? "",
    });
    if (!ok) continue;
    visibleBySeries.set(row.seriesId, (visibleBySeries.get(row.seriesId) ?? 0) + 1);
  }

  const eligible = [...bySeriesId.values()].filter(
    (series) => (visibleBySeries.get(series.id) ?? 0) > 0,
  );
  const winners = selectRecipeCollectionMemberships(eligible);
  if (!winners.length) return [];

  const winnerIds = winners.map((row) => row.id);
  const nextScanRows = await db.seriesItem.findMany({
    where: { seriesId: { in: winnerIds }, removedFromPlaylist: false },
    orderBy: [{ seriesId: "asc" }, { sortOrder: "asc" }],
    select: {
      seriesId: true,
      sortOrder: true,
      customTitle: true,
      recipeId: true,
      youtubeVideoId: true,
      recipe: { select: { id: true, slug: true, title: true, status: true } },
      youtubeVideo: { select: { videoId: true, title: true, privacyStatus: true } },
    },
  });

  const itemsBySeries = new Map<string, typeof nextScanRows>();
  for (const row of nextScanRows) {
    const list = itemsBySeries.get(row.seriesId) ?? [];
    list.push(row);
    itemsBySeries.set(row.seriesId, list);
  }

  return winners.map((series) => {
    const ordered = itemsBySeries.get(series.id) ?? [];
    const index = ordered.findIndex((item) => item.recipeId === id);
    let nextItem: RecipeSeriesLink["nextItem"] = null;
    if (index >= 0) {
      for (let i = index + 1; i < ordered.length; i += 1) {
        const candidate = ordered[i];
        const recipeOk =
          candidate.recipe && candidate.recipe.status === "published" ? candidate.recipe : null;
        const privacy = (candidate.youtubeVideo?.privacyStatus || "").trim().toLowerCase();
        const videoOk =
          candidate.youtubeVideo &&
          (!privacy || privacy === "public")
            ? candidate.youtubeVideo
            : null;
        if (!recipeOk && !videoOk) continue;
        nextItem = {
          recipeSlug: recipeOk?.slug ?? null,
          title:
            candidate.customTitle.trim() ||
            recipeOk?.title ||
            videoOk?.title ||
            "Next",
          youtubeVideoId: videoOk?.videoId ?? null,
        };
        break;
      }
    }
    return {
      id: series.id,
      slug: series.slug,
      title: series.title,
      shortTitle: series.shortTitle,
      itemTitle: series.itemTitle,
      nextItem,
    };
  });
}

/**
 * Category page Collection shelf — slim membership → score → ≤3 CollectionCard payloads.
 */
export async function listPublishedSeriesCardsForCategory(
  categorySlug: string,
): Promise<PublicSeriesCard[]> {
  const slug = categorySlug.trim();
  if (!slug) return [];
  const db = getDb();

  const category = await db.category.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
  if (!category) return [];

  const categoryRecipes = await db.recipeCategory.findMany({
    where: { categoryId: category.id, recipe: { status: "published" } },
    select: { recipeId: true },
  });
  const categoryRecipeIds = [...new Set(categoryRecipes.map((row) => row.recipeId))];
  if (!categoryRecipeIds.length) return [];

  const memberships = await db.seriesItem.findMany({
    where: {
      recipeId: { in: categoryRecipeIds },
      removedFromPlaylist: false,
      series: { isPublished: true },
    },
    select: { seriesId: true },
  });
  const candidateIds = [...new Set(memberships.map((row) => row.seriesId))];
  if (!candidateIds.length) return [];

  const seriesRows = await db.series.findMany({
    where: { id: { in: candidateIds }, isPublished: true },
    select: {
      id: true,
      slug: true,
      title: true,
      shortTitle: true,
      description: true,
      heroImage: true,
      sortOrder: true,
      syncMode: true,
      items: {
        where: { removedFromPlaylist: false },
        select: {
          recipeId: true,
          youtubeVideoId: true,
          recipe: {
            select: {
              id: true,
              status: true,
              categories: { select: { categoryId: true } },
            },
          },
          youtubeVideo: { select: { privacyStatus: true, thumbnailUrl: true } },
        },
      },
    },
  });

  const scoringInputs: CategoryCollectionScoringCandidate[] = [];
  const countsById = new Map<string, { visibleItemCount: number; recipeCount: number; videoCount: number; heroFromVideo: string }>();
  for (const row of seriesRows) {
    let collectionPublicRecipeCount = 0;
    let sharedCount = 0;
    let visibleItemCount = 0;
    let recipeCount = 0;
    let videoCount = 0;
    let heroFromVideo = "";
    for (const item of row.items) {
      const recipePublished = item.recipe?.status === "published";
      const ok = isSeriesMembershipPubliclyRenderable({
        removedFromPlaylist: false,
        recipeId: item.recipeId,
        recipePublished,
        youtubeVideoId: item.youtubeVideoId,
        videoPrivacy: item.youtubeVideo?.privacyStatus ?? "",
      });
      if (!ok) continue;
      visibleItemCount += 1;
      if (item.recipeId && recipePublished) {
        recipeCount += 1;
        collectionPublicRecipeCount += 1;
        if (item.recipe?.categories.some((c) => c.categoryId === category.id)) {
          sharedCount += 1;
        }
      }
      if (item.youtubeVideoId) {
        videoCount += 1;
        if (!heroFromVideo && item.youtubeVideo?.thumbnailUrl) {
          heroFromVideo = item.youtubeVideo.thumbnailUrl;
        }
      }
    }
    if (visibleItemCount <= 0) continue;
    scoringInputs.push({
      id: row.id,
      slug: row.slug,
      title: row.title,
      sortOrder: row.sortOrder,
      syncMode: row.syncMode,
      sharedCount,
      collectionPublicRecipeCount,
    });
    countsById.set(row.id, { visibleItemCount, recipeCount, videoCount, heroFromVideo });
  }

  const winners = selectCategoryCollections(scoringInputs, {
    name: category.name,
    slug: category.slug,
  });
  if (!winners.length) return [];

  const byId = new Map(seriesRows.map((row) => [row.id, row]));
  return winners.map((winner) => {
    const row = byId.get(winner.id)!;
    const counts = countsById.get(winner.id)!;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      shortTitle: row.shortTitle,
      description: row.description,
      heroImage: row.heroImage.trim() || counts.heroFromVideo || `${site.url}/icon.png`,
      itemCount: counts.visibleItemCount,
      recipeCount: counts.recipeCount,
      videoCount: counts.videoCount,
      previewItems: [],
    };
  });
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
