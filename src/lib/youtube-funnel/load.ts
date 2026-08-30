import "server-only";
import { getDb } from "@/lib/db";
import { isHumanGuestUserAgent } from "@/lib/guest-client";
import { buildRecipeVideoIndex } from "@/lib/youtube-data/matching";
import {
  buildChapterClickRows,
  buildFunnelRecipeRows,
  buildFunnelSummary,
  buildPlacementBreakdown,
  formatFunnelCount,
  formatFunnelRate,
  funnelDateWindow,
} from "@/lib/youtube-funnel/aggregate";
import type { YoutubeFunnelDashboard } from "@/lib/youtube-funnel/types";
import {
  DEFAULT_ANALYTICS_RANGE_DAYS,
  parseAnalyticsRangeDays,
  type AnalyticsRangeDays,
} from "@/lib/youtube-analytics/ranges";

export type { YoutubeFunnelDashboard } from "@/lib/youtube-funnel/types";

function recipePath(slug: string) {
  return `/recipes/${slug}`;
}

export async function loadYoutubeFunnelDashboard(input?: {
  analyticsRangeDays?: AnalyticsRangeDays | string | number;
}): Promise<YoutubeFunnelDashboard> {
  const rangeDays = parseAnalyticsRangeDays(
    input?.analyticsRangeDays ?? DEFAULT_ANALYTICS_RANGE_DAYS,
  );
  const window = funnelDateWindow(rangeDays);
  const db = getDb();
  const { recipesWithVideo } = await buildRecipeVideoIndex({ includeDrafts: false });

  const linkedSlugs = recipesWithVideo.map((r) => r.recipeSlug);
  const linkedPaths = linkedSlugs.map(recipePath);

  const [pageViews, events] = await Promise.all([
    linkedPaths.length
      ? db.guestPageView.findMany({
          where: {
            path: { in: linkedPaths },
            createdAt: { gte: window.start, lt: window.endExclusive },
          },
          select: {
            path: true,
            visitorId: true,
            userAgent: true,
            visitor: { select: { userAgent: true } },
          },
        })
      : Promise.resolve([]),
    db.funnelEvent.findMany({
      where: {
        createdAt: { gte: window.start, lt: window.endExclusive },
      },
      select: {
        visitorId: true,
        name: true,
        recipeSlug: true,
        youtubeVideoId: true,
        targetVideoId: true,
        placement: true,
        chapterLabel: true,
        chapterTimeSeconds: true,
        chapterIndex: true,
      },
    }),
  ]);

  const pageviewsBySlug = new Map<string, { views: number; uniqueVisitors: number }>();
  const pageviewVisitorSet = new Set<string>();
  let linkedRecipePageviews = 0;

  for (const row of pageViews) {
    const ua = row.userAgent.trim() || row.visitor.userAgent.trim();
    if (!isHumanGuestUserAgent(ua)) continue;
    const slug = row.path.replace(/^\/recipes\//, "").split("/")[0] || "";
    if (!slug) continue;
    const bucket = pageviewsBySlug.get(slug) || { views: 0, uniqueVisitors: 0 };
    bucket.views += 1;
    pageviewsBySlug.set(slug, bucket);
    linkedRecipePageviews += 1;
    pageviewVisitorSet.add(`${slug}::${row.visitorId}`);
  }

  for (const [slug, bucket] of pageviewsBySlug) {
    const unique = new Set<string>();
    for (const key of pageviewVisitorSet) {
      if (key.startsWith(`${slug}::`)) unique.add(key);
    }
    bucket.uniqueVisitors = unique.size;
  }

  const uniquePageviewVisitors = new Set(
    [...pageviewVisitorSet].map((key) => key.split("::")[1] || ""),
  ).size;

  const summary = buildFunnelSummary({
    uniquePageviewVisitors,
    linkedRecipePageviews,
    events,
  });

  const recipeRows = buildFunnelRecipeRows({
    recipes: recipesWithVideo.map((r) => ({
      recipeId: r.recipeId,
      recipeSlug: r.recipeSlug,
      recipeTitle: r.recipeTitle,
      youtubeVideoId: r.videoId,
    })),
    pageviewsBySlug,
    events,
  });

  const placements = buildPlacementBreakdown(events);
  const hasFunnelEvents = events.length > 0;

  return {
    rangeDays,
    startDate: window.startDate,
    endDate: window.endDate,
    trackingNote:
      "CTA clicks, embedded plays, and chapter interactions are counted from when website funnel tracking shipped. Linked recipe pageviews include earlier visitor history when available. Rates use unique anonymous visitors (mks_guest), not confirmed YouTube conversions.",
    summary,
    summaryDisplay: {
      linkedRecipePageviews: formatFunnelCount(summary.linkedRecipePageviews),
      videoPlays: formatFunnelCount(summary.videoPlays),
      playRate: formatFunnelRate(summary.playRate),
      chapterClicks: formatFunnelCount(summary.chapterClicks),
      watchOnYoutubeClicks: formatFunnelCount(summary.watchOnYoutubeClicks),
      watchOnYoutubeCtr: formatFunnelRate(summary.watchOnYoutubeCtr),
      subscribeCtaClicks: formatFunnelCount(summary.subscribeCtaClicks),
      subscribeCtr: formatFunnelRate(summary.subscribeCtr),
      continuedViewingSessions: formatFunnelCount(summary.continuedViewingSessions),
      continuedViewingRate: formatFunnelRate(summary.continuedViewingRate),
    },
    recipes: recipeRows.map((row) => ({
      ...row,
      playRateLabel: formatFunnelRate(row.playRate),
      watchCtrLabel: formatFunnelRate(row.watchCtr),
      subscribeCtrLabel: formatFunnelRate(row.subscribeCtr),
    })),
    placements: placements.map((row) => ({
      placement: row.placement,
      label: row.label,
      watchOnYoutubeClicks: formatFunnelCount(row.watchOnYoutubeClicks),
      subscribeCtaClicks: formatFunnelCount(row.subscribeCtaClicks),
    })),
    hasFunnelEvents,
  };
}

export async function loadVideoFunnelChapters(input: {
  youtubeVideoId: string;
  analyticsRangeDays?: AnalyticsRangeDays | string | number;
}) {
  const rangeDays = parseAnalyticsRangeDays(
    input.analyticsRangeDays ?? DEFAULT_ANALYTICS_RANGE_DAYS,
  );
  const window = funnelDateWindow(rangeDays);
  const db = getDb();
  const events = await db.funnelEvent.findMany({
    where: {
      youtubeVideoId: input.youtubeVideoId,
      name: "recipe_video_chapter_click",
      createdAt: { gte: window.start, lt: window.endExclusive },
    },
    select: {
      name: true,
      chapterLabel: true,
      chapterTimeSeconds: true,
      chapterIndex: true,
    },
  });
  return {
    rangeDays,
    chapters: buildChapterClickRows(events).map((row) => ({
      ...row,
      clicksLabel: formatFunnelCount(row.clicks),
    })),
  };
}
