import type { FunnelRecipeRow, FunnelSummaryMetrics } from "@/lib/youtube-funnel/aggregate";
import type { AnalyticsRangeDays } from "@/lib/youtube-analytics/ranges";

export type YoutubeFunnelDashboard = {
  rangeDays: AnalyticsRangeDays;
  startDate: string;
  endDate: string;
  trackingNote: string;
  summary: FunnelSummaryMetrics;
  summaryDisplay: {
    linkedRecipePageviews: string;
    uniquePageviewVisitors: string;
    videoPlays: string;
    uniquePlayVisitors: string;
    playRate: string;
    chapterClicks: string;
    watchOnYoutubeClicks: string;
    uniqueWatchOnYoutubeVisitors: string;
    watchOnYoutubeCtr: string;
    subscribeCtaClicks: string;
    uniqueSubscribeVisitors: string;
    subscribeCtr: string;
    continuedViewingSessions: string;
    videoInteractionSessions: string;
    continuedViewingRate: string;
  };
  recipes: Array<
    FunnelRecipeRow & {
      playRateLabel: string;
      watchCtrLabel: string;
      subscribeCtrLabel: string;
    }
  >;
  placements: Array<{
    placement: string;
    label: string;
    watchOnYoutubeClicks: string;
    subscribeCtaClicks: string;
  }>;
  hasFunnelEvents: boolean;
  /** Owner-only temporary diagnostics; omitted for other roles. */
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
};
