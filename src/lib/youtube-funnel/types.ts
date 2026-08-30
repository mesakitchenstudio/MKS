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
    videoPlays: string;
    playRate: string;
    chapterClicks: string;
    watchOnYoutubeClicks: string;
    watchOnYoutubeCtr: string;
    subscribeCtaClicks: string;
    subscribeCtr: string;
    continuedViewingSessions: string;
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
};
