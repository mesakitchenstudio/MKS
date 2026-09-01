import type { FunnelRecipeRow, FunnelSummaryMetrics } from "@/lib/youtube-funnel/aggregate";
import type { AnalyticsRangeDays } from "@/lib/youtube-analytics/ranges";

export type FunnelNoVideoTrafficRow = {
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  pageviews: number;
  uniquePageviewVisitors: number;
};

export type YoutubeFunnelDashboard = {
  rangeDays: AnalyticsRangeDays;
  startDate: string;
  endDate: string;
  summary: FunnelSummaryMetrics;
  summaryDisplay: {
    linkedRecipePageviews: string;
    uniquePageviewVisitors: string;
    videoPlays: string;
    uniquePlayVisitors: string;
    playRate: string;
    chapterClicks: string;
    uniqueChapterVisitors: string;
    watchOnYoutubeClicks: string;
    uniqueWatchOnYoutubeVisitors: string;
    watchOnYoutubeCtr: string;
    subscribeCtaClicks: string;
    uniqueSubscribeVisitors: string;
    subscribeCtr: string;
    watchNextClicks: string;
    uniqueWatchNextVisitors: string;
    continuedViewingSessions: string;
    videoInteractionSessions: string;
    continuedViewingRate: string;
  };
  recipes: Array<
    FunnelRecipeRow & {
      playOutcomeLabel: string;
      watchOutcomeLabel: string;
      subscribeOutcomeLabel: string;
      continuedOutcomeLabel: string;
    }
  >;
  noVideoTraffic: FunnelNoVideoTrafficRow[];
  placements: Array<{
    placement: string;
    label: string;
    watchOnYoutubeClicks: string;
    subscribeCtaClicks: string;
  }>;
  hasFunnelEvents: boolean;
  /** Owner-only technical diagnostics; omitted for editors. */
  diagnostics?: {
    windowLabel: string;
    latestPageview: {
      path: string;
      receivedAt: string;
      visitorMasked: string;
    } | null;
    latestFunnelEvent: {
      name: string;
      recipeSlug: string;
      receivedAt: string;
      visitorMasked: string;
    } | null;
    trackingEndpoints: {
      guestPageview: string;
      funnelEvents: string;
    };
  };
  /** Editor-safe tracking status without endpoints or visitor identifiers. */
  editorTracking?: {
    trackingActive: boolean;
    lastEvent: { name: string; receivedAt: string } | null;
  };
};
