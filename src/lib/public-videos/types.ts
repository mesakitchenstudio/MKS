import type { YouTubeVideoFormat } from "@/lib/youtube-data/video-format";

/** Public-safe video fields only — no analytics, health, or admin status. */
export type PublicVideoCard = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  durationDisplay: string;
  durationSeconds: number;
  publishedAt: string | null;
  embeddable: boolean;
  format: YouTubeVideoFormat;
  recipeSlug?: string;
  recipeTitle?: string;
};

export type PublicVideoCatalogue = {
  featured: PublicVideoCard | null;
  videos: PublicVideoCard[];
  shorts: PublicVideoCard[];
  longCount: number;
  shortCount: number;
  /** True when enough Shorts exist to justify a Full/Shorts control. */
  showFormatFilter: boolean;
  ok: true;
};

export type PublicVideoCatalogueError = {
  ok: false;
  error: "load_failed";
};

export type PublicVideoCatalogueResult = PublicVideoCatalogue | PublicVideoCatalogueError;

export type PublicVideoWatch = PublicVideoCard & {
  youtubeWatchUrl: string;
};

/** Raw synced row used before public mapping (still no analytics). */
export type PublicVideoSourceRow = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  durationDisplay: string;
  durationSeconds: number;
  publishedAt: Date | null;
  privacyStatus: string;
  embeddable: boolean;
  description?: string;
  tags?: string;
  /** Optional future site hide flag — treated as hidden when true. */
  hiddenFromSite?: boolean;
  recipeSlug?: string;
  recipeTitle?: string;
};
