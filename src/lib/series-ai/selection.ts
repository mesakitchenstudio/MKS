import { youtubeThumbnailUrl } from "@/lib/youtube";
import type { SeriesHeroImageSource } from "@/lib/series-ai/types";

export type SeriesAiContextItem = {
  itemId: string;
  sortOrder: number;
  featured: boolean;
  customTitle: string;
  customDescription: string;
  recipe: {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    status: string;
    typeName: string;
    categoryNames: string[];
    intro: string;
    whyItWorks: string;
    keyIngredients: string;
    image: string;
    tags: string[];
  } | null;
  video: {
    videoId: string;
    title: string;
    description: string;
    tags: string[];
    durationDisplay: string;
    durationSeconds: number;
    format: string;
    thumbnailUrl: string;
  } | null;
};

export type SeriesAiContext = {
  seriesId: string;
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  intro: string;
  seoTitle: string;
  seoDescription: string;
  heroImage: string;
  heroImageSource: string;
  syncMode: string;
  youtubePlaylistId: string;
  youtubePlaylistTitle: string;
  youtubePlaylistDescription: string;
  youtubePlaylistThumbnail: string;
  items: SeriesAiContextItem[];
};

export function selectSeriesHero(context: SeriesAiContext): {
  url: string;
  source: SeriesHeroImageSource;
  label: string;
} | null {
  if (context.heroImageSource === "manual" && context.heroImage.trim()) {
    return { url: context.heroImage.trim(), source: "manual", label: "Manual upload" };
  }

  const featured = context.items.find((item) => item.featured) || context.items[0] || null;
  if (featured?.recipe?.image) {
    return {
      url: featured.recipe.image,
      source: "auto_featured_recipe",
      label: `Featured recipe (${featured.recipe.title})`,
    };
  }
  if (featured?.video?.thumbnailUrl) {
    return {
      url: featured.video.videoId
        ? youtubeThumbnailUrl(featured.video.videoId, "max")
        : featured.video.thumbnailUrl,
      source: "auto_featured_video",
      label: `Featured video (${featured.video.title})`,
    };
  }

  for (const item of context.items) {
    if (item.recipe?.image && item.recipe.status === "published") {
      return {
        url: item.recipe.image,
        source: "auto_recipe",
        label: `Recipe (${item.recipe.title})`,
      };
    }
  }

  if (context.youtubePlaylistThumbnail.trim()) {
    return {
      url: context.youtubePlaylistThumbnail.trim(),
      source: "auto_playlist",
      label: "YouTube playlist thumbnail",
    };
  }

  for (const item of context.items) {
    if (item.video && item.video.format !== "SHORT" && item.video.videoId) {
      return {
        url: youtubeThumbnailUrl(item.video.videoId, "max"),
        source: "auto_video",
        label: `Video (${item.video.title})`,
      };
    }
  }

  for (const item of context.items) {
    if (item.video?.videoId) {
      return {
        url: youtubeThumbnailUrl(item.video.videoId, "max"),
        source: "auto_video",
        label: `Video (${item.video.title})`,
      };
    }
  }

  return null;
}

export function suggestFeaturedItemId(context: SeriesAiContext): string | null {
  const published = context.items.find(
    (item) => item.recipe?.status === "published" && item.video?.format !== "SHORT",
  );
  if (published) return published.itemId;
  const anyPublished = context.items.find((item) => item.recipe?.status === "published");
  if (anyPublished) return anyPublished.itemId;
  const longForm = context.items.find((item) => item.video?.format === "LONG");
  if (longForm) return longForm.itemId;
  return context.items[0]?.itemId ?? null;
}

export function seriesContextForPrompt(context: SeriesAiContext) {
  return {
    playlist: {
      title: context.youtubePlaylistTitle || context.title,
      description: context.youtubePlaylistDescription,
      itemCount: context.items.length,
    },
    currentEditorial: {
      title: context.title,
      shortTitle: context.shortTitle,
      description: context.description,
      intro: context.intro,
      seoTitle: context.seoTitle,
      seoDescription: context.seoDescription,
    },
    items: context.items.map((item) => ({
      itemId: item.itemId,
      position: item.sortOrder + 1,
      featured: item.featured,
      existingCustomTitle: item.customTitle,
      existingCustomDescription: item.customDescription,
      recipe: item.recipe
        ? {
            title: item.recipe.title,
            excerpt: item.recipe.excerpt,
            type: item.recipe.typeName,
            categories: item.recipe.categoryNames,
            intro: item.recipe.intro,
            whyItWorks: item.recipe.whyItWorks,
            keyIngredients: item.recipe.keyIngredients,
            tags: item.recipe.tags,
            status: item.recipe.status,
          }
        : null,
      video: item.video
        ? {
            title: item.video.title,
            description: truncate(item.video.description, 1200),
            tags: item.video.tags,
            duration: item.video.durationDisplay,
            format: item.video.format,
          }
        : null,
    })),
  };
}

function truncate(value: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}
