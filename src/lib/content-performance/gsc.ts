import {
  aggregateSearchConsoleKpis,
  dailySearchConsoleTrend,
} from "@/lib/search-console/aggregate";
import type { GooglePeriodMetrics, MetricAvailability } from "@/lib/content-performance/types";

export type GscPageMetricInput = {
  date: string;
  pageUrl: string;
  normalizedPath: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export function emptyGoogleMetrics(availability: MetricAvailability): GooglePeriodMetrics {
  return {
    clicks: availability === "zero" ? 0 : null,
    impressions: availability === "zero" ? 0 : null,
    ctr: availability === "zero" ? 0 : null,
    position: availability === "zero" ? null : null,
    availability,
    contributingPaths: [],
  };
}

/** Aggregate GSC rows with 7A CTR / impression-weighted position math. */
export function aggregateGoogleFromRows(
  rows: GscPageMetricInput[],
  contributingPaths: string[],
  connected: boolean,
): GooglePeriodMetrics {
  if (!connected && rows.length === 0) {
    return emptyGoogleMetrics("not_connected");
  }
  if (rows.length === 0) {
    return emptyGoogleMetrics(connected ? "zero" : "not_connected");
  }
  const kpis = aggregateSearchConsoleKpis(rows);
  return {
    clicks: kpis.clicks,
    impressions: kpis.impressions,
    ctr: kpis.ctr,
    position: kpis.position,
    availability: "available",
    contributingPaths: [...contributingPaths].sort((a, b) => a.localeCompare(b)),
  };
}

export function googleDailyTrend(rows: GscPageMetricInput[]) {
  return dailySearchConsoleTrend(rows);
}
