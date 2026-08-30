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

function maskVisitorId(id: string) {
  const trimmed = id.trim();
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export async function loadYoutubeFunnelDashboard(input?: {
  analyticsRangeDays?: AnalyticsRangeDays | string | number;
  includeDiagnostics?: boolean;
}): Promise<YoutubeFunnelDashboard> {
  const rangeDays = parseAnalyticsRangeDays(
    input?.analyticsRangeDays ?? DEFAULT_ANALYTICS_RANGE_DAYS,
  );
  const window = funnelDateWindow(rangeDays);
  const db = getDb();
  const { recipesWithVideo } = await buildRecipeVideoIndex({ includeDrafts: false });

  const linkedSlugs = recipesWithVideo.map((r) => r.recipeSlug);
  const linkedPaths = linkedSlugs.map(recipePath);

  const [pageViews, events, latestPageview, latestFunnelEvent] = await Promise.all([
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
    input?.includeDiagnostics
      ? db.guestPageView.findFirst({
          where: linkedPaths.length ? { path: { in: linkedPaths } } : undefined,
          orderBy: { createdAt: "desc" },
          select: { path: true, createdAt: true, visitorId: true },
        })
      : Promise.resolve(null),
    input?.includeDiagnostics
      ? db.funnelEvent.findFirst({
          orderBy: { createdAt: "desc" },
          select: { name: true, recipeSlug: true, createdAt: true, visitorId: true },
        })
      : Promise.resolve(null),
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
      `UTC window ${window.startDate} → ${window.endDate} (includes today). ` +
      "Linked recipe pageviews = raw GuestPageView rows. " +
      "Visitor play rate / Visitor YouTube CTR / Visitor Subscribe CTR = unique visitors who did the action ÷ unique linked-recipe visitors (mks_guest). " +
      "Continued-viewing visitor rate = visitors who interacted with ≥2 distinct videos ÷ visitors with ≥1 video interaction. " +
      "Raw click/play counts are also shown; rates never use raw pageviews as the denominator.",
    summary,
    summaryDisplay: {
      linkedRecipePageviews: formatFunnelCount(summary.linkedRecipePageviews),
      uniquePageviewVisitors: formatFunnelCount(summary.uniquePageviewVisitors),
      videoPlays: formatFunnelCount(summary.videoPlays),
      uniquePlayVisitors: formatFunnelCount(summary.uniquePlayVisitors),
      playRate: formatFunnelRate(summary.playRate),
      chapterClicks: formatFunnelCount(summary.chapterClicks),
      watchOnYoutubeClicks: formatFunnelCount(summary.watchOnYoutubeClicks),
      uniqueWatchOnYoutubeVisitors: formatFunnelCount(summary.uniqueWatchOnYoutubeVisitors),
      watchOnYoutubeCtr: formatFunnelRate(summary.watchOnYoutubeCtr),
      subscribeCtaClicks: formatFunnelCount(summary.subscribeCtaClicks),
      uniqueSubscribeVisitors: formatFunnelCount(summary.uniqueSubscribeVisitors),
      subscribeCtr: formatFunnelRate(summary.subscribeCtr),
      watchNextClicks: formatFunnelCount(summary.watchNextClicks),
      uniqueWatchNextVisitors: formatFunnelCount(summary.uniqueWatchNextVisitors),
      continuedViewingSessions: formatFunnelCount(summary.continuedViewingSessions),
      videoInteractionSessions: formatFunnelCount(summary.videoInteractionSessions),
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
    diagnostics: input?.includeDiagnostics
      ? {
          windowLabel: `${window.startDate} → ${window.endDate} UTC (includes today)`,
          latestPageview: latestPageview
            ? {
                path: latestPageview.path,
                receivedAt: latestPageview.createdAt.toISOString(),
                visitorMasked: maskVisitorId(latestPageview.visitorId),
              }
            : null,
          latestFunnelEvent: latestFunnelEvent
            ? {
                name: latestFunnelEvent.name,
                recipeSlug: latestFunnelEvent.recipeSlug || "(none)",
                receivedAt: latestFunnelEvent.createdAt.toISOString(),
                visitorMasked: maskVisitorId(latestFunnelEvent.visitorId),
              }
            : null,
          trackingEndpoints: {
            guestPageview: "POST /api/analytics/guest (pageview: true)",
            funnelEvents: "POST /api/analytics/events",
          },
        }
      : undefined,
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
