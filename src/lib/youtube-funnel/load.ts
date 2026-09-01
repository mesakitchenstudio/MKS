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
import {
  formatRecipeMultiVideoVisitorsLabel,
  formatRecipeVisitorOutcome,
} from "@/lib/youtube-funnel/funnel-display";
import type { FunnelNoVideoTrafficRow, YoutubeFunnelDashboard } from "@/lib/youtube-funnel/types";
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

function aggregatePageviews(
  rows: Array<{
    path: string;
    visitorId: string;
    userAgent: string;
    visitor: { userAgent: string };
  }>,
) {
  const pageviewsBySlug = new Map<string, { views: number; uniqueVisitors: number }>();
  const pageviewVisitorSet = new Set<string>();
  let totalPageviews = 0;

  for (const row of rows) {
    const ua = row.userAgent.trim() || row.visitor.userAgent.trim();
    if (!isHumanGuestUserAgent(ua)) continue;
    const slug = row.path.replace(/^\/recipes\//, "").split("/")[0] || "";
    if (!slug) continue;
    const bucket = pageviewsBySlug.get(slug) || { views: 0, uniqueVisitors: 0 };
    bucket.views += 1;
    pageviewsBySlug.set(slug, bucket);
    totalPageviews += 1;
    pageviewVisitorSet.add(`${slug}::${row.visitorId}`);
  }

  for (const [slug, bucket] of pageviewsBySlug) {
    let unique = 0;
    for (const key of pageviewVisitorSet) {
      if (key.startsWith(`${slug}::`)) unique += 1;
    }
    bucket.uniqueVisitors = unique;
  }

  const uniquePageviewVisitors = new Set(
    [...pageviewVisitorSet].map((key) => key.split("::")[1] || ""),
  ).size;

  return { pageviewsBySlug, pageviewVisitorSet, totalPageviews, uniquePageviewVisitors };
}

function formatRecipeOutcomeLabel(numerator: number, denominator: number): string {
  const { fractionLabel, rateLabel } = formatRecipeVisitorOutcome(numerator, denominator);
  return rateLabel ? `${fractionLabel} · ${rateLabel}` : fractionLabel;
}

export async function loadYoutubeFunnelDashboard(input?: {
  analyticsRangeDays?: AnalyticsRangeDays | string | number;
  includeDiagnostics?: boolean;
  includeEditorTracking?: boolean;
}): Promise<YoutubeFunnelDashboard> {
  const rangeDays = parseAnalyticsRangeDays(
    input?.analyticsRangeDays ?? DEFAULT_ANALYTICS_RANGE_DAYS,
  );
  const window = funnelDateWindow(rangeDays);
  const db = getDb();
  const { recipesWithVideo, recipesWithoutVideo } = await buildRecipeVideoIndex({
    includeDrafts: false,
  });

  const linkedSlugs = recipesWithVideo.map((r) => r.recipeSlug);
  const linkedPaths = linkedSlugs.map(recipePath);
  const noVideoPaths = recipesWithoutVideo.map((r) => recipePath(r.slug));

  const pageviewWhere = {
    createdAt: { gte: window.start, lt: window.endExclusive },
  };

  const [linkedPageViews, noVideoPageViews, events, latestPageview, latestFunnelEvent] =
    await Promise.all([
      linkedPaths.length
        ? db.guestPageView.findMany({
            where: { path: { in: linkedPaths }, ...pageviewWhere },
            select: {
              path: true,
              visitorId: true,
              userAgent: true,
              visitor: { select: { userAgent: true } },
            },
          })
        : Promise.resolve([]),
      noVideoPaths.length
        ? db.guestPageView.findMany({
            where: { path: { in: noVideoPaths }, ...pageviewWhere },
            select: {
              path: true,
              visitorId: true,
              userAgent: true,
              visitor: { select: { userAgent: true } },
            },
          })
        : Promise.resolve([]),
      db.funnelEvent.findMany({
        where: pageviewWhere,
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
      input?.includeDiagnostics || input?.includeEditorTracking
        ? db.funnelEvent.findFirst({
            orderBy: { createdAt: "desc" },
            select: { name: true, recipeSlug: true, createdAt: true, visitorId: true },
          })
        : Promise.resolve(null),
    ]);

  const linkedPv = aggregatePageviews(linkedPageViews);
  const noVideoPv = aggregatePageviews(noVideoPageViews);

  const summary = buildFunnelSummary({
    uniquePageviewVisitors: linkedPv.uniquePageviewVisitors,
    linkedRecipePageviews: linkedPv.totalPageviews,
    events,
  });

  const recipeRows = buildFunnelRecipeRows({
    recipes: recipesWithVideo.map((r) => ({
      recipeId: r.recipeId,
      recipeSlug: r.recipeSlug,
      recipeTitle: r.recipeTitle,
      youtubeVideoId: r.videoId,
    })),
    pageviewsBySlug: linkedPv.pageviewsBySlug,
    pageviewVisitorKeys: linkedPv.pageviewVisitorSet,
    events,
  });

  const noVideoTraffic: FunnelNoVideoTrafficRow[] = recipesWithoutVideo
    .map((recipe) => {
      const pv = noVideoPv.pageviewsBySlug.get(recipe.slug) || {
        views: 0,
        uniqueVisitors: 0,
      };
      return {
        recipeId: recipe.id,
        recipeSlug: recipe.slug,
        recipeTitle: recipe.title,
        pageviews: pv.views,
        uniquePageviewVisitors: pv.uniqueVisitors,
      };
    })
    .filter((row) => row.uniquePageviewVisitors > 0)
    .sort(
      (a, b) =>
        b.uniquePageviewVisitors - a.uniquePageviewVisitors ||
        b.pageviews - a.pageviews ||
        a.recipeTitle.localeCompare(b.recipeTitle),
    );

  const placements = buildPlacementBreakdown(events);
  const hasFunnelEvents = events.length > 0;
  const visitorDenom = summary.uniquePageviewVisitors;

  return {
    rangeDays,
    startDate: window.startDate,
    endDate: window.endDate,
    summary,
    summaryDisplay: {
      linkedRecipePageviews: formatFunnelCount(summary.linkedRecipePageviews),
      uniquePageviewVisitors: formatFunnelCount(summary.uniquePageviewVisitors),
      videoPlays: formatFunnelCount(summary.videoPlays),
      uniquePlayVisitors: formatFunnelCount(summary.uniquePlayVisitors),
      playRate: formatFunnelRate(summary.playRate, visitorDenom),
      chapterClicks: formatFunnelCount(summary.chapterClicks),
      uniqueChapterVisitors: formatFunnelCount(summary.uniqueChapterVisitors),
      watchOnYoutubeClicks: formatFunnelCount(summary.watchOnYoutubeClicks),
      uniqueWatchOnYoutubeVisitors: formatFunnelCount(summary.uniqueWatchOnYoutubeVisitors),
      watchOnYoutubeCtr: formatFunnelRate(summary.watchOnYoutubeCtr, visitorDenom),
      subscribeCtaClicks: formatFunnelCount(summary.subscribeCtaClicks),
      uniqueSubscribeVisitors: formatFunnelCount(summary.uniqueSubscribeVisitors),
      subscribeCtr: formatFunnelRate(summary.subscribeCtr, visitorDenom),
      watchNextClicks: formatFunnelCount(summary.watchNextClicks),
      uniqueWatchNextVisitors: formatFunnelCount(summary.uniqueWatchNextVisitors),
      continuedViewingSessions: formatFunnelCount(summary.continuedViewingSessions),
      videoInteractionSessions: formatFunnelCount(summary.videoInteractionSessions),
      continuedViewingRate: formatFunnelRate(
        summary.continuedViewingRate,
        summary.videoInteractionSessions,
      ),
    },
    recipes: recipeRows.map((row) => ({
      ...row,
      playOutcomeLabel: formatRecipeOutcomeLabel(
        row.uniquePlayVisitors,
        row.uniquePageviewVisitors,
      ),
      watchOutcomeLabel: formatRecipeOutcomeLabel(
        row.uniqueWatchVisitors,
        row.uniquePageviewVisitors,
      ),
      subscribeOutcomeLabel: formatRecipeOutcomeLabel(
        row.uniqueSubscribeVisitors,
        row.uniquePageviewVisitors,
      ),
      multiVideoVisitorsLabel: formatRecipeMultiVideoVisitorsLabel(
        row.uniqueContinuedVisitors,
        row.uniquePageviewVisitors,
      ),
    })),
    noVideoTraffic,
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
    editorTracking: input?.includeEditorTracking
      ? {
          trackingActive: hasFunnelEvents || linkedPv.totalPageviews > 0,
          lastEvent: latestFunnelEvent
            ? {
                name: latestFunnelEvent.name,
                receivedAt: latestFunnelEvent.createdAt.toISOString(),
              }
            : null,
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
