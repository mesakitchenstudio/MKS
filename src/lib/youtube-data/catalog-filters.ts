import type { YouTubeVideoFormat } from "@/lib/youtube-data/video-format";
import {
  parseYoutubeDashboardFilter,
  type YoutubeDashboardVideoFilter,
} from "@/lib/youtube-data/video-format";

export type CatalogVideoSortKey =
  | "performance"
  | "title"
  | "publishedAt"
  | "periodViews"
  | "subscribersGained"
  | "watchTime";

export type CatalogVideoSortDirection = "asc" | "desc";

export type CatalogVideoRow = {
  videoId: string;
  title: string;
  publishedAt: string;
  publishedAtSort: number;
  format: YouTubeVideoFormat;
  recipe: { id: string; slug: string; title: string } | null;
  possibleMatch: { id: string; slug: string; title: string } | null;
  relationship: string;
  contentHealth: string;
  hasMetadataIssue: boolean;
  periodViewsSort: number;
  subscribersGainedSort: number;
  watchTimeSort: number;
};

export function searchCatalogVideos<T extends { title: string }>(videos: T[], query: string): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return videos;
  return videos.filter((video) => video.title.toLowerCase().includes(normalized));
}

/** Default catalog ordering for All / Performance views. */
export function sortCatalogVideosByPerformance<T extends CatalogVideoRow>(videos: T[]): T[] {
  return [...videos].sort((a, b) => {
    const subs = b.subscribersGainedSort - a.subscribersGainedSort;
    if (subs !== 0) return subs;
    const views = b.periodViewsSort - a.periodViewsSort;
    if (views !== 0) return views;
    const watch = b.watchTimeSort - a.watchTimeSort;
    if (watch !== 0) return watch;
    return b.publishedAtSort - a.publishedAtSort;
  });
}

export function sortCatalogVideos<T extends CatalogVideoRow>(
  videos: T[],
  key: CatalogVideoSortKey,
  direction: CatalogVideoSortDirection,
): T[] {
  if (key === "performance") {
    return sortCatalogVideosByPerformance(videos);
  }

  const factor = direction === "asc" ? 1 : -1;
  return [...videos].sort((a, b) => {
    switch (key) {
      case "title":
        return factor * a.title.localeCompare(b.title);
      case "publishedAt":
        return factor * (a.publishedAtSort - b.publishedAtSort);
      case "periodViews":
        return factor * (a.periodViewsSort - b.periodViewsSort);
      case "subscribersGained":
        return factor * (a.subscribersGainedSort - b.subscribersGainedSort);
      case "watchTime":
        return factor * (a.watchTimeSort - b.watchTimeSort);
      default:
        return 0;
    }
  });
}

export function filterCatalogVideos<T extends CatalogVideoRow>(
  videos: T[],
  filter: YoutubeDashboardVideoFilter,
  options?: { catalogMedianPeriodViews?: number },
): T[] {
  const median = options?.catalogMedianPeriodViews ?? 0;

  switch (filter) {
    case "long":
      return videos.filter((video) => video.format === "LONG");
    case "shorts":
      return videos.filter((video) => video.format === "SHORT");
    case "needs":
      return videos.filter((video) => video.relationship === "Unlinked");
    case "linked":
      return videos.filter((video) => video.relationship === "Linked");
    case "opportunities":
      return videos.filter(
        (video) =>
          video.relationship === "Unlinked" &&
          video.periodViewsSort > 0 &&
          (median <= 0 || video.periodViewsSort >= median),
      );
    case "missing-chapters":
      return videos.filter((video) => video.contentHealth === "Missing chapters");
    case "metadata":
      return videos.filter((video) => video.hasMetadataIssue || video.contentHealth === "Metadata issue");
    case "all":
    default:
      return videos;
  }
}

export function parseCatalogSortKey(raw: unknown): CatalogVideoSortKey {
  const value = String(raw ?? "").trim();
  if (
    value === "performance" ||
    value === "title" ||
    value === "publishedAt" ||
    value === "periodViews" ||
    value === "subscribersGained" ||
    value === "watchTime"
  ) {
    return value;
  }
  return "performance";
}

export function parseCatalogSortDirection(raw: unknown): CatalogVideoSortDirection {
  return String(raw ?? "").trim() === "asc" ? "asc" : "desc";
}

export { parseYoutubeDashboardFilter };
