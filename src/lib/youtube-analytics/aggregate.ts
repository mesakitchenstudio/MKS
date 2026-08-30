import { getDb } from "@/lib/db";
import {
  analyticsDateRange,
  analyticsVideoPeriodStoreDate,
  parseAnalyticsRangeDays,
  type AnalyticsRangeDays,
  utcDayStart,
} from "@/lib/youtube-analytics/ranges";
import type { VideoAnalyticsLoadState } from "@/lib/youtube-analytics/status";

export type AggregatedAnalyticsMetrics = {
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
  subscribersLost: number;
  likes: number;
  comments: number;
  shares: number;
  /** Net subscriber change for the period. */
  subscriberGrowth: number;
  dayCount: number;
};

export function emptyAggregatedMetrics(): AggregatedAnalyticsMetrics {
  return {
    views: 0,
    estimatedMinutesWatched: 0,
    averageViewDuration: 0,
    averageViewPercentage: 0,
    subscribersGained: 0,
    subscribersLost: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    subscriberGrowth: 0,
    dayCount: 0,
  };
}

type DayMetricLike = {
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
  subscribersLost: number;
  likes: number;
  comments: number;
  shares: number;
};

/** Aggregate daily rows. Averages are watch-time weighted when possible. */
export function aggregateDayMetrics(rows: DayMetricLike[]): AggregatedAnalyticsMetrics {
  if (!rows.length) return emptyAggregatedMetrics();

  let views = 0;
  let estimatedMinutesWatched = 0;
  let subscribersGained = 0;
  let subscribersLost = 0;
  let likes = 0;
  let comments = 0;
  let shares = 0;
  let durationWeighted = 0;
  let percentageWeighted = 0;
  let weight = 0;

  for (const row of rows) {
    views += row.views;
    estimatedMinutesWatched += row.estimatedMinutesWatched;
    subscribersGained += row.subscribersGained;
    subscribersLost += row.subscribersLost;
    likes += row.likes;
    comments += row.comments;
    shares += row.shares;
    const w = row.views > 0 ? row.views : row.estimatedMinutesWatched > 0 ? 1 : 0;
    if (w > 0) {
      durationWeighted += row.averageViewDuration * w;
      percentageWeighted += row.averageViewPercentage * w;
      weight += w;
    }
  }

  return {
    views,
    estimatedMinutesWatched,
    averageViewDuration: weight > 0 ? durationWeighted / weight : 0,
    averageViewPercentage: weight > 0 ? percentageWeighted / weight : 0,
    subscribersGained,
    subscribersLost,
    likes,
    comments,
    shares,
    subscriberGrowth: subscribersGained - subscribersLost,
    dayCount: rows.length,
  };
}

export function formatWatchTimeHours(estimatedMinutesWatched: number): string {
  const hours = estimatedMinutesWatched / 60;
  if (hours <= 0) return "0h";
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours).toLocaleString("en-US")}h`;
}

export function formatAverageViewDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export function formatAverageViewPercentage(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${value.toFixed(1)}%`;
}

export function formatSignedCount(value: number): string {
  if (value > 0) return `+${value.toLocaleString("en-US")}`;
  if (value < 0) return value.toLocaleString("en-US");
  return "0";
}

export async function loadChannelAnalyticsAggregate(
  channelId: string,
  days: AnalyticsRangeDays,
): Promise<AggregatedAnalyticsMetrics> {
  if (!channelId) return emptyAggregatedMetrics();
  const range = analyticsDateRange(days);
  const db = getDb();
  const rows = await db.youTubeAnalyticsChannelDay.findMany({
    where: {
      channelId,
      date: {
        gte: utcDayStart(range.startDate),
        lte: utcDayStart(range.endDate),
      },
    },
  });
  return aggregateDayMetrics(rows);
}

export async function loadVideoAnalyticsAggregate(
  videoId: string,
  days: AnalyticsRangeDays,
): Promise<AggregatedAnalyticsMetrics> {
  if (!videoId) return emptyAggregatedMetrics();
  const db = getDb();
  const storeDate = analyticsVideoPeriodStoreDate(days);
  const row = await db.youTubeAnalyticsVideoDay.findUnique({
    where: { videoId_date: { videoId, date: storeDate } },
  });
  return row ? aggregateDayMetrics([row]) : emptyAggregatedMetrics();
}

export async function loadVideoAnalyticsAggregatesForIds(
  videoIds: string[],
  days: AnalyticsRangeDays,
): Promise<Map<string, AggregatedAnalyticsMetrics>> {
  const map = new Map<string, AggregatedAnalyticsMetrics>();
  for (const id of videoIds) map.set(id, emptyAggregatedMetrics());
  if (!videoIds.length) return map;

  const db = getDb();
  const storeDate = analyticsVideoPeriodStoreDate(days);
  const rows = await db.youTubeAnalyticsVideoDay.findMany({
    where: {
      videoId: { in: videoIds },
      date: storeDate,
    },
  });

  for (const row of rows) {
    map.set(row.videoId, aggregateDayMetrics([row]));
  }
  return map;
}

export function displayMetrics(metrics: AggregatedAnalyticsMetrics) {
  return {
    views: metrics.views.toLocaleString("en-US"),
    watchTime: formatWatchTimeHours(metrics.estimatedMinutesWatched),
    averageViewDuration: formatAverageViewDuration(metrics.averageViewDuration),
    averageViewPercentage: formatAverageViewPercentage(metrics.averageViewPercentage),
    subscribersGained: metrics.subscribersGained.toLocaleString("en-US"),
    subscribersLost: metrics.subscribersLost.toLocaleString("en-US"),
    subscriberGrowth: formatSignedCount(metrics.subscriberGrowth),
    likes: metrics.likes.toLocaleString("en-US"),
    comments: metrics.comments.toLocaleString("en-US"),
    shares: metrics.shares.toLocaleString("en-US"),
    hasData: metrics.dayCount > 0 || metrics.views > 0,
  };
}

/** Format per-video Analytics cells; API_ERROR must never look like genuine zeros. */
export function displayVideoAnalyticsMetrics(
  metrics: AggregatedAnalyticsMetrics,
  state: VideoAnalyticsLoadState,
) {
  if (state === "API_ERROR") {
    return {
      views: "—",
      watchTime: "—",
      averageViewDuration: "—",
      averageViewPercentage: "—",
      subscribersGained: "—",
      subscribersLost: "—",
      subscriberGrowth: "—",
      likes: "—",
      comments: "—",
      shares: "—",
      hasData: false,
      state,
    };
  }

  const display = displayMetrics(metrics);
  return { ...display, state };
}

export { parseAnalyticsRangeDays, analyticsDateRange };
