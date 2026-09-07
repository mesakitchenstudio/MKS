import {
  analyticsDateRange,
  parseAnalyticsRangeDays,
  type AnalyticsRangeDays,
} from "@/lib/youtube-analytics/ranges";
import { funnelDateWindow } from "@/lib/youtube-funnel/aggregate";
import { searchConsoleAnalyticsDateRange } from "@/lib/search-console/aggregate";

export type ContentPerformanceRange = {
  days: AnalyticsRangeDays;
  /** Shared label range (yesterday-ended) for Google/YouTube period displays. */
  labelStartDate: string;
  labelEndDate: string;
  /** Website / Funnel window (includes today per first-party semantics). */
  websiteStart: Date;
  websiteEndExclusive: Date;
  /** GSC inclusive calendar dates (UTC midnight storage). */
  googleStartDate: string;
  googleEndDate: string;
};

export function parseContentPerformanceRangeDays(raw: unknown): AnalyticsRangeDays {
  return parseAnalyticsRangeDays(raw);
}

/**
 * Build aligned ranges for Unified Performance.
 * Website/Funnel: funnelDateWindow (includes today).
 * Google: Search Console calendar range ending yesterday.
 * YouTube video period rows use the same AnalyticsRangeDays key.
 */
export function contentPerformanceRange(
  days: AnalyticsRangeDays = 28,
  now: Date = new Date(),
): ContentPerformanceRange {
  const label = analyticsDateRange(days, now);
  const google = searchConsoleAnalyticsDateRange(days, now);
  const website = funnelDateWindow(days, now);
  return {
    days,
    labelStartDate: label.startDate,
    labelEndDate: label.endDate,
    websiteStart: website.start,
    websiteEndExclusive: website.endExclusive,
    googleStartDate: google.startDate,
    googleEndDate: google.endDate,
  };
}

export { ANALYTICS_RANGE_DAYS } from "@/lib/youtube-analytics/ranges";
export type { AnalyticsRangeDays };
