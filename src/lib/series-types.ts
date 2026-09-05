import { site } from "@/data/site";

export type PublicSeriesCard = {
  id: string;
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  heroImage: string;
  itemCount: number;
  recipeCount: number;
  videoCount: number;
  /** Up to two visible items for homepage collection previews (featured-first). */
  previewItems: PublicSeriesPreviewItem[];
};

/** Compact Series item surface for homepage Featured Series previews. */
export type PublicSeriesPreviewItem = {
  id: string;
  position: number;
  title: string;
  thumbnail: string;
  recipeSlug: string | null;
  youtubeVideoId: string | null;
};

export type PublicSeriesItem = {
  id: string;
  position: number;
  title: string;
  description: string;
  featured: boolean;
  thumbnail: string;
  recipeId: string | null;
  recipeSlug: string | null;
  recipeTitle: string | null;
  youtubeVideoId: string | null;
  youtubeTitle: string | null;
  durationDisplay: string;
  watchUrl: string | null;
  typeName: string;
  categorySlugs: string[];
};

/** Featured-first, then catalog order; max 2 for homepage collection previews. */
export function pickSeriesPreviewItems(
  items: Array<
    Pick<
      PublicSeriesItem,
      "id" | "position" | "title" | "thumbnail" | "recipeSlug" | "youtubeVideoId" | "featured"
    >
  >,
  max = 2,
): PublicSeriesPreviewItem[] {
  const featured = items.filter((item) => item.featured);
  const rest = items.filter((item) => !item.featured);
  return [...featured, ...rest].slice(0, max).map((item) => ({
    id: item.id,
    position: item.position,
    title: item.title,
    thumbnail: item.thumbnail,
    recipeSlug: item.recipeSlug,
    youtubeVideoId: item.youtubeVideoId,
  }));
}

export type PublicSeriesDetail = {
  id: string;
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  intro: string;
  heroImage: string;
  seoTitle: string;
  seoDescription: string;
  youtubePlaylistId: string | null;
  youtubePlaylistUrl: string | null;
  itemCount: number;
  items: PublicSeriesItem[];
  featured: PublicSeriesItem | null;
};

export type RecipeSeriesLink = {
  slug: string;
  title: string;
  shortTitle: string;
  /** Series-item display title for the current recipe when it differs from the page H1. */
  itemTitle?: string | null;
  nextItem: {
    recipeSlug: string | null;
    title: string;
    youtubeVideoId: string | null;
  } | null;
};

export function seriesItemListJsonLd(series: PublicSeriesDetail) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: series.title,
    description: series.description || undefined,
    url: `${site.url}/series/${series.slug}`,
    numberOfItems: series.items.length,
    itemListElement: series.items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.title,
      url: item.recipeSlug
        ? `${site.url}/recipes/${item.recipeSlug}`
        : item.watchUrl || undefined,
    })),
  };
}
