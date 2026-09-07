/**
 * Derived Unified Content Performance types — no persisted Content model.
 * Source metrics keep their own semantics; never blend into a score.
 */

export type PerformanceEntityKind = "recipe" | "series" | "page";

export type PerformanceEntityRef =
  | { kind: "recipe"; recipeId: string }
  | { kind: "series"; seriesId: string }
  | { kind: "page"; path: string; routeKind: string };

export type MetricAvailability = "available" | "zero" | "unavailable" | "not_connected";

export type NullableMetric = {
  value: number | null;
  availability: MetricAvailability;
};

export type GooglePeriodMetrics = {
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
  availability: MetricAvailability;
  contributingPaths: string[];
};

export type WebsitePeriodMetrics = {
  pageViews: number | null;
  uniqueVisitors: number | null;
  availability: MetricAvailability;
  contributingPaths: string[];
};

export type FunnelPeriodMetrics = {
  recipeToVideoOpens: number | null;
  videoToRecipeClicks: number | null;
  availability: MetricAvailability;
};

export type MemberCurrentMetrics = {
  /** Current RecipeSave rows — not a period time series. */
  savesCurrent: number;
  /** Current RecipeReview rows — not a period time series. */
  reviewsCurrent: number;
  averageRating: number | null;
};

export type YoutubePeriodMetrics = {
  videoId: string;
  views: number | null;
  estimatedMinutesWatched: number | null;
  averageViewDuration: number | null;
  availability: MetricAvailability;
};

export type RecipePerformance = {
  recipeId: string;
  title: string;
  slug: string;
  status: string;
  publicPath: string;
  website: WebsitePeriodMetrics;
  google: GooglePeriodMetrics;
  funnel: FunnelPeriodMetrics;
  member: MemberCurrentMetrics;
  youtube: YoutubePeriodMetrics | null;
  hasLinkedVideo: boolean;
};

export type SeriesPerformance = {
  seriesId: string;
  title: string;
  slug: string;
  status: string;
  publicPath: string;
  website: WebsitePeriodMetrics;
  google: GooglePeriodMetrics;
};

export type PagePerformance = {
  path: string;
  label: string;
  routeKind: string;
  website: WebsitePeriodMetrics;
  google: GooglePeriodMetrics;
  unresolved: boolean;
};

export type SourceCoverage = {
  googleConnected: boolean;
  googleLastDataDate: string | null;
  youtubeConnected: boolean;
  youtubeLastSuccessfulSyncAt: string | null;
  websiteIncludesToday: boolean;
  googleEndsYesterday: boolean;
};

export type ContentPerformanceSort =
  | "website_views"
  | "google_clicks"
  | "google_impressions"
  | "google_ctr"
  | "google_position"
  | "youtube_views"
  | "title";

export type ContentPerformanceStatusFilter = "published" | "draft" | "all";
export type ContentPerformanceVideoFilter = "all" | "linked" | "none";
