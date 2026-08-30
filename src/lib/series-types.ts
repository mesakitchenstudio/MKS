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
