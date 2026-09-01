/**
 * UI copy for YouTube Analytics metric semantics.
 *
 * Mesa requests standard YouTube Analytics report metrics (views, estimatedMinutesWatched,
 * averageViewDuration, averageViewPercentage, etc.) — not engagedViews. YouTube defines
 * each metric independently; retention metrics may reflect engaged/stayed populations
 * that differ from start/play-based view counts.
 */

export const YOUTUBE_ANALYTICS_RETENTION_FOOTNOTE =
  "YouTube Views and retention metrics use different engagement definitions. Average view duration is not derived from total watch time ÷ Views.";

/** Metrics currently requested in CHANNEL_METRICS / TOP_VIDEO_METRICS (client.ts). */
export const YOUTUBE_ANALYTICS_CHANNEL_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
  "subscribersGained",
  "subscribersLost",
  "likes",
  "comments",
  "shares",
] as const;
