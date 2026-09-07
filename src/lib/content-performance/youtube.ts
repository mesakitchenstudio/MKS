import type { AggregatedAnalyticsMetrics } from "@/lib/youtube-analytics/aggregate";
import type { MetricAvailability, YoutubePeriodMetrics } from "@/lib/content-performance/types";

export function emptyYoutubeMetrics(
  videoId: string,
  availability: MetricAvailability,
): YoutubePeriodMetrics {
  return {
    videoId,
    views: availability === "zero" ? 0 : null,
    estimatedMinutesWatched: availability === "zero" ? 0 : null,
    averageViewDuration: null,
    availability,
  };
}

export function youtubeMetricsFromAggregate(
  videoId: string,
  metrics: AggregatedAnalyticsMetrics | undefined,
  connected: boolean,
): YoutubePeriodMetrics {
  if (!connected) {
    return emptyYoutubeMetrics(videoId, "not_connected");
  }
  if (!metrics || (metrics.dayCount === 0 && metrics.views === 0)) {
    return emptyYoutubeMetrics(videoId, "unavailable");
  }
  return {
    videoId,
    views: metrics.views,
    estimatedMinutesWatched: metrics.estimatedMinutesWatched,
    averageViewDuration: metrics.averageViewDuration,
    availability: "available",
  };
}
