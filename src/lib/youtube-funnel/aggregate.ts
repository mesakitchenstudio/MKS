import {
  type AnalyticsRangeDays,
  utcDayStart,
} from "@/lib/youtube-analytics/ranges";
import type { FunnelEventName, FunnelPlacement } from "@/lib/funnel-analytics";

function utcYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type FunnelSummaryMetrics = {
  linkedRecipePageviews: number;
  uniquePageviewVisitors: number;
  videoPlays: number;
  uniquePlayVisitors: number;
  playRate: number | null;
  chapterClicks: number;
  watchOnYoutubeClicks: number;
  uniqueWatchOnYoutubeVisitors: number;
  watchOnYoutubeCtr: number | null;
  subscribeCtaClicks: number;
  uniqueSubscribeVisitors: number;
  subscribeCtr: number | null;
  watchNextClicks: number;
  uniqueWatchNextVisitors: number;
  continuedViewingSessions: number;
  videoInteractionSessions: number;
  continuedViewingRate: number | null;
};

export type FunnelRecipeRow = {
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  youtubeVideoId: string;
  pageviews: number;
  uniquePageviewVisitors: number;
  videoPlays: number;
  uniquePlayVisitors: number;
  playRate: number | null;
  chapterClicks: number;
  watchOnYoutubeClicks: number;
  uniqueWatchVisitors: number;
  watchCtr: number | null;
  subscribeCtaClicks: number;
  uniqueSubscribeVisitors: number;
  subscribeCtr: number | null;
  continuedWatchActions: number;
  watchNextClicks: number;
};

export type FunnelPlacementRow = {
  placement: FunnelPlacement | string;
  label: string;
  watchOnYoutubeClicks: number;
  subscribeCtaClicks: number;
};

export type FunnelChapterRow = {
  chapterLabel: string;
  chapterTimeSeconds: number | null;
  chapterIndex: number | null;
  clicks: number;
};

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function formatFunnelRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatFunnelCount(value: number): string {
  return value.toLocaleString("en-US");
}

const PLACEMENT_LABELS: Record<string, string> = {
  hero: "Hero",
  video_section: "Main video section",
  floating_player: "Floating video",
  recipe_card: "Recipe card",
  chapter_section: "Chapter section",
  watch_next: "Watch next / related",
  watch_next_section: "Watch next section",
  subscribe: "End of recipe",
  end_of_recipe: "End of recipe",
  post_video_subscribe: "Post-video subscribe",
  post_recipe_subscribe: "Post-recipe subscribe",
  watch_method_subscribe: "Watch method subscribe",
  recipe_end_subscribe: "Recipe end subscribe",
  series_page: "Series page",
  other: "Other",
};

export function funnelPlacementLabel(placement: string): string {
  return PLACEMENT_LABELS[placement] || placement || "Other";
}

/** Unique visitors among event rows for a name (optionally scoped to recipe slug). */
export function uniqueVisitorsForEvents(
  rows: Array<{ visitorId: string; name: string; recipeSlug?: string }>,
  name: FunnelEventName,
  recipeSlug?: string,
): number {
  const set = new Set<string>();
  for (const row of rows) {
    if (row.name !== name) continue;
    if (recipeSlug && row.recipeSlug !== recipeSlug) continue;
    set.add(row.visitorId);
  }
  return set.size;
}

export function countEvents(
  rows: Array<{ name: string; recipeSlug?: string }>,
  name: FunnelEventName,
  recipeSlug?: string,
): number {
  let n = 0;
  for (const row of rows) {
    if (row.name !== name) continue;
    if (recipeSlug && row.recipeSlug !== recipeSlug) continue;
    n += 1;
  }
  return n;
}

/**
 * Continued viewing: visitors who interacted with ≥2 distinct Mesa youtubeVideoIds
 * via play, watch-on-YouTube, or watch-next (target or source video id).
 */
export function computeContinuedViewing(rows: Array<{
  visitorId: string;
  name: string;
  youtubeVideoId: string;
  targetVideoId: string;
}>): { continued: number; interacted: number; rate: number | null } {
  const byVisitor = new Map<string, Set<string>>();
  for (const row of rows) {
    if (
      row.name !== "recipe_video_play" &&
      row.name !== "recipe_watch_on_youtube_click" &&
      row.name !== "recipe_watch_next_click"
    ) {
      continue;
    }
    const ids = byVisitor.get(row.visitorId) || new Set<string>();
    if (row.youtubeVideoId) ids.add(row.youtubeVideoId);
    if (row.name === "recipe_watch_next_click" && row.targetVideoId) {
      ids.add(row.targetVideoId);
    }
    byVisitor.set(row.visitorId, ids);
  }
  let interacted = 0;
  let continued = 0;
  for (const ids of byVisitor.values()) {
    if (ids.size === 0) continue;
    interacted += 1;
    if (ids.size >= 2) continued += 1;
  }
  return { continued, interacted, rate: rate(continued, interacted) };
}

export function buildFunnelSummary(input: {
  uniquePageviewVisitors: number;
  linkedRecipePageviews: number;
  events: Array<{
    visitorId: string;
    name: string;
    recipeSlug: string;
    youtubeVideoId: string;
    targetVideoId: string;
  }>;
}): FunnelSummaryMetrics {
  const { events } = input;
  const uniquePlayVisitors = uniqueVisitorsForEvents(events, "recipe_video_play");
  const uniqueWatch = uniqueVisitorsForEvents(events, "recipe_watch_on_youtube_click");
  const uniqueSub = uniqueVisitorsForEvents(events, "recipe_youtube_subscribe_click");
  const uniqueWatchNext = uniqueVisitorsForEvents(events, "recipe_watch_next_click");
  const continued = computeContinuedViewing(events);
  const denom = input.uniquePageviewVisitors;

  return {
    linkedRecipePageviews: input.linkedRecipePageviews,
    uniquePageviewVisitors: denom,
    videoPlays: countEvents(events, "recipe_video_play"),
    uniquePlayVisitors,
    playRate: rate(uniquePlayVisitors, denom),
    chapterClicks: countEvents(events, "recipe_video_chapter_click"),
    watchOnYoutubeClicks: countEvents(events, "recipe_watch_on_youtube_click"),
    uniqueWatchOnYoutubeVisitors: uniqueWatch,
    watchOnYoutubeCtr: rate(uniqueWatch, denom),
    subscribeCtaClicks: countEvents(events, "recipe_youtube_subscribe_click"),
    uniqueSubscribeVisitors: uniqueSub,
    subscribeCtr: rate(uniqueSub, denom),
    watchNextClicks: countEvents(events, "recipe_watch_next_click"),
    uniqueWatchNextVisitors: uniqueWatchNext,
    continuedViewingSessions: continued.continued,
    videoInteractionSessions: continued.interacted,
    continuedViewingRate: continued.rate,
  };
}

export function buildFunnelRecipeRows(input: {
  recipes: Array<{
    recipeId: string;
    recipeSlug: string;
    recipeTitle: string;
    youtubeVideoId: string;
  }>;
  pageviewsBySlug: Map<string, { views: number; uniqueVisitors: number }>;
  events: Array<{
    visitorId: string;
    name: string;
    recipeSlug: string;
    youtubeVideoId: string;
    targetVideoId: string;
  }>;
}): FunnelRecipeRow[] {
  const rows: FunnelRecipeRow[] = [];
  for (const recipe of input.recipes) {
    const pv = input.pageviewsBySlug.get(recipe.recipeSlug) || { views: 0, uniqueVisitors: 0 };
    const scoped = input.events.filter((e) => e.recipeSlug === recipe.recipeSlug);
    const uniquePlay = uniqueVisitorsForEvents(scoped, "recipe_video_play");
    const uniqueWatch = uniqueVisitorsForEvents(scoped, "recipe_watch_on_youtube_click");
    const uniqueSub = uniqueVisitorsForEvents(scoped, "recipe_youtube_subscribe_click");
    const watchNextClicks = countEvents(scoped, "recipe_watch_next_click");
    const continuedActions = scoped.filter(
      (e) =>
        e.name === "recipe_watch_next_click" ||
        (e.name === "recipe_watch_on_youtube_click" && e.targetVideoId),
    ).length;

    rows.push({
      recipeId: recipe.recipeId,
      recipeSlug: recipe.recipeSlug,
      recipeTitle: recipe.recipeTitle,
      youtubeVideoId: recipe.youtubeVideoId,
      pageviews: pv.views,
      uniquePageviewVisitors: pv.uniqueVisitors,
      videoPlays: countEvents(scoped, "recipe_video_play"),
      uniquePlayVisitors: uniquePlay,
      playRate: rate(uniquePlay, pv.uniqueVisitors),
      chapterClicks: countEvents(scoped, "recipe_video_chapter_click"),
      watchOnYoutubeClicks: countEvents(scoped, "recipe_watch_on_youtube_click"),
      uniqueWatchVisitors: uniqueWatch,
      watchCtr: rate(uniqueWatch, pv.uniqueVisitors),
      subscribeCtaClicks: countEvents(scoped, "recipe_youtube_subscribe_click"),
      uniqueSubscribeVisitors: uniqueSub,
      subscribeCtr: rate(uniqueSub, pv.uniqueVisitors),
      continuedWatchActions: continuedActions,
      watchNextClicks,
    });
  }
  rows.sort((a, b) => b.pageviews - a.pageviews || a.recipeTitle.localeCompare(b.recipeTitle));
  return rows;
}

export function buildPlacementBreakdown(
  events: Array<{ name: string; placement: string }>,
): FunnelPlacementRow[] {
  const map = new Map<string, FunnelPlacementRow>();
  for (const event of events) {
    if (
      event.name !== "recipe_watch_on_youtube_click" &&
      event.name !== "recipe_youtube_subscribe_click"
    ) {
      continue;
    }
    const key = event.placement || "other";
    const row = map.get(key) || {
      placement: key,
      label: funnelPlacementLabel(key),
      watchOnYoutubeClicks: 0,
      subscribeCtaClicks: 0,
    };
    if (event.name === "recipe_watch_on_youtube_click") row.watchOnYoutubeClicks += 1;
    if (event.name === "recipe_youtube_subscribe_click") row.subscribeCtaClicks += 1;
    map.set(key, row);
  }
  return [...map.values()].sort(
    (a, b) =>
      b.watchOnYoutubeClicks +
      b.subscribeCtaClicks -
      (a.watchOnYoutubeClicks + a.subscribeCtaClicks),
  );
}

export function buildChapterClickRows(
  events: Array<{
    name: string;
    chapterLabel: string;
    chapterTimeSeconds: number | null;
    chapterIndex: number | null;
  }>,
): FunnelChapterRow[] {
  const map = new Map<string, FunnelChapterRow>();
  for (const event of events) {
    if (event.name !== "recipe_video_chapter_click") continue;
    const key = `${event.chapterIndex ?? ""}:${event.chapterTimeSeconds ?? ""}:${event.chapterLabel}`;
    const row = map.get(key) || {
      chapterLabel: event.chapterLabel || "(untitled)",
      chapterTimeSeconds: event.chapterTimeSeconds,
      chapterIndex: event.chapterIndex,
      clicks: 0,
    };
    row.clicks += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => {
    const ta = a.chapterTimeSeconds ?? a.chapterIndex ?? 0;
    const tb = b.chapterTimeSeconds ?? b.chapterIndex ?? 0;
    return ta - tb || b.clicks - a.clicks;
  });
}

/**
 * Website funnel date window (UTC).
 * Ends on **today** inclusive — first-party events are near-real-time.
 * Do not reuse YouTube Analytics' lag window (which ends yesterday).
 */
export function funnelDateWindow(days: AnalyticsRangeDays, now: Date = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const startDate = utcYmd(start);
  const endDate = utcYmd(end);
  return {
    days,
    start: utcDayStart(startDate),
    end: utcDayStart(endDate),
    /** Exclusive upper bound (start of tomorrow UTC). */
    endExclusive: new Date(utcDayStart(endDate).getTime() + 24 * 60 * 60 * 1000),
    startDate,
    endDate,
  };
}

export type { AnalyticsRangeDays };
