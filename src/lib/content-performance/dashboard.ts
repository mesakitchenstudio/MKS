import "server-only";
import { getDb } from "@/lib/db";
import { isHumanAudienceGuest } from "@/lib/guest-classification";
import { guestPathTitle } from "@/lib/guest-path-labels";
import { normalizeRedirectPath, recipePublicPath } from "@/lib/redirects";
import { recipeMainVideoId } from "@/lib/youtube-data/matching";
import { parseValues } from "@/lib/recipe-map";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import { getSearchConsoleConnectionPublic } from "@/lib/search-console/connection";
import { getAnalyticsConnectionPublic } from "@/lib/youtube-analytics/connection";
import { loadVideoAnalyticsAggregatesForIds } from "@/lib/youtube-analytics/aggregate";
import { loadChannelAnalyticsAggregate } from "@/lib/youtube-analytics/aggregate";
import {
  collectPathsForRecipe,
  isRecipeCookPath,
  resolvePerformancePath,
  type PerformanceIdentityContext,
  type PerformanceRecipeRef,
  type PerformanceSeriesRef,
} from "@/lib/content-performance/identity";
import {
  contentPerformanceRange,
  parseContentPerformanceRangeDays,
  type AnalyticsRangeDays,
  type ContentPerformanceRange,
} from "@/lib/content-performance/ranges";
import { aggregateGoogleFromRows, googleDailyTrend, type GscPageMetricInput } from "@/lib/content-performance/gsc";
import { aggregateWebsiteFromVisitorSets } from "@/lib/content-performance/website";
import {
  aggregateFunnelForRecipe,
  sumRecipeToVideoOpens,
  type FunnelEventRow,
} from "@/lib/content-performance/funnels";
import { memberMetricsFromCounts } from "@/lib/content-performance/member";
import { youtubeMetricsFromAggregate } from "@/lib/content-performance/youtube";
import type {
  ContentPerformanceSort,
  ContentPerformanceStatusFilter,
  ContentPerformanceVideoFilter,
  PagePerformance,
  RecipePerformance,
  SeriesPerformance,
  SourceCoverage,
} from "@/lib/content-performance/types";
import { searchConsoleDateFromYmd } from "@/lib/search-console/paths";

export type ContentPerformanceDashboard = {
  range: ContentPerformanceRange;
  coverage: SourceCoverage;
  overview: {
    websitePageViews: number;
    websiteUniqueVisitors: number;
    googleClicks: number | null;
    googleImpressions: number | null;
    googleCtr: number | null;
    googlePosition: number | null;
    googleAvailability: string;
    youtubeViews: number | null;
    youtubeAvailability: string;
    recipeToVideoOpens: number;
  };
  recipes: RecipePerformance[];
  series: SeriesPerformance[];
  otherPages: PagePerformance[];
  unresolvedPages: PagePerformance[];
  unresolvedGooglePathCount: number;
};

async function loadIdentityContext(): Promise<PerformanceIdentityContext> {
  const db = getDb();
  const [recipes, series, redirects] = await Promise.all([
    db.recipe.findMany({
      select: { id: true, slug: true, title: true, status: true },
      orderBy: { title: "asc" },
    }),
    db.series.findMany({
      select: { id: true, slug: true, title: true, isPublished: true },
      orderBy: { title: "asc" },
    }),
    db.redirect.findMany({
      where: { isActive: true },
      select: { fromPath: true, toPath: true },
    }),
  ]);

  const recipesBySlug = new Map<string, PerformanceRecipeRef>();
  const recipesById = new Map<string, PerformanceRecipeRef>();
  for (const row of recipes) {
    const ref = { id: row.id, slug: row.slug, title: row.title, status: row.status };
    recipesBySlug.set(row.slug, ref);
    recipesById.set(row.id, ref);
  }

  const seriesBySlug = new Map<string, PerformanceSeriesRef>();
  const seriesById = new Map<string, PerformanceSeriesRef>();
  for (const row of series) {
    const ref = {
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.isPublished ? "published" : "draft",
    };
    seriesBySlug.set(row.slug, ref);
    seriesById.set(row.id, ref);
  }

  const redirectToByFrom = new Map<string, string>();
  for (const row of redirects) {
    const from = normalizeRedirectPath(row.fromPath);
    const to = normalizeRedirectPath(row.toPath);
    if (from && to) redirectToByFrom.set(from, to);
  }

  return { recipesBySlug, recipesById, seriesBySlug, seriesById, redirectToByFrom };
}

type RecipeValuesRow = { values: string };

function linkedVideoIdForRecipe(row: RecipeValuesRow): string | null {
  const values = parseValues(row.values);
  return recipeMainVideoId({
    youtubeUrl: typeof values.youtubeUrl === "string" ? values.youtubeUrl : undefined,
    youtube: parseRecipeYoutubeBlob(values.youtube),
  });
}

function sortRecipes(
  rows: RecipePerformance[],
  sort: ContentPerformanceSort,
): RecipePerformance[] {
  const copy = [...rows];
  const num = (v: number | null | undefined) => (typeof v === "number" ? v : -1);
  copy.sort((a, b) => {
    switch (sort) {
      case "google_clicks":
        return num(b.google.clicks) - num(a.google.clicks) || a.title.localeCompare(b.title);
      case "google_impressions":
        return (
          num(b.google.impressions) - num(a.google.impressions) || a.title.localeCompare(b.title)
        );
      case "google_ctr":
        return num(b.google.ctr) - num(a.google.ctr) || a.title.localeCompare(b.title);
      case "google_position": {
        const ap = a.google.position;
        const bp = b.google.position;
        if (ap == null && bp == null) return a.title.localeCompare(b.title);
        if (ap == null) return 1;
        if (bp == null) return -1;
        return ap - bp || a.title.localeCompare(b.title);
      }
      case "youtube_views":
        return (
          num(b.youtube?.views) - num(a.youtube?.views) || a.title.localeCompare(b.title)
        );
      case "title":
        return a.title.localeCompare(b.title);
      case "website_views":
      default:
        return num(b.website.pageViews) - num(a.website.pageViews) || a.title.localeCompare(b.title);
    }
  });
  return copy;
}

export async function loadContentPerformanceDashboard(input?: {
  rangeDays?: AnalyticsRangeDays | unknown;
  sort?: ContentPerformanceSort;
  status?: ContentPerformanceStatusFilter;
  video?: ContentPerformanceVideoFilter;
  includeYoutube?: boolean;
  now?: Date;
}): Promise<ContentPerformanceDashboard> {
  const rangeDays = parseContentPerformanceRangeDays(input?.rangeDays);
  const range = contentPerformanceRange(rangeDays, input?.now);
  const sort = input?.sort ?? "website_views";
  const statusFilter = input?.status ?? "published";
  const videoFilter = input?.video ?? "all";
  const includeYoutube = input?.includeYoutube !== false;

  const db = getDb();
  const identity = await loadIdentityContext();

  const [gscConnection, ytConnection, recipesRaw] = await Promise.all([
    getSearchConsoleConnectionPublic(),
    getAnalyticsConnectionPublic(),
    db.recipe.findMany({
      select: { id: true, slug: true, title: true, status: true, values: true },
      orderBy: { title: "asc" },
    }),
  ]);

  const googleConnected = Boolean(gscConnection.selectedProperty);
  const youtubeConnected = ytConnection.connected;

  const connectionRow = await db.searchConsoleConnection.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true, selectedProperty: true, lastDataDate: true },
  });

  const googleStart = searchConsoleDateFromYmd(range.googleStartDate);
  const googleEnd = searchConsoleDateFromYmd(range.googleEndDate);

  const [gscRows, pageViews, funnelEvents, saveGroups, reviewGroups] = await Promise.all([
    connectionRow?.id && connectionRow.selectedProperty
      ? db.searchConsolePageMetric.findMany({
          where: {
            connectionId: connectionRow.id,
            date: { gte: googleStart, lte: googleEnd },
          },
          select: {
            date: true,
            pageUrl: true,
            normalizedPath: true,
            clicks: true,
            impressions: true,
            ctr: true,
            position: true,
          },
        })
      : Promise.resolve([]),
    db.guestPageView.findMany({
      where: {
        createdAt: { gte: range.websiteStart, lt: range.websiteEndExclusive },
      },
      select: {
        path: true,
        visitorId: true,
        visitor: { select: { clientKind: true, userAgent: true } },
        userAgent: true,
      },
    }),
    db.funnelEvent.findMany({
      where: {
        createdAt: { gte: range.websiteStart, lt: range.websiteEndExclusive },
      },
      select: {
        name: true,
        recipeId: true,
        recipeSlug: true,
        targetRecipeId: true,
        youtubeVideoId: true,
        visitor: { select: { clientKind: true, userAgent: true } },
      },
    }),
    db.recipeSave.groupBy({
      by: ["recipeId"],
      where: { recipeId: { not: null } },
      _count: { _all: true },
    }),
    db.recipeReview.groupBy({
      by: ["recipeId"],
      where: { recipeId: { not: null } },
      _count: { _all: true },
      _avg: { rating: true },
    }),
  ]);

  const savesByRecipe = new Map<string, number>();
  for (const row of saveGroups) {
    if (row.recipeId) savesByRecipe.set(row.recipeId, row._count._all);
  }
  const reviewsByRecipe = new Map<string, { count: number; avg: number | null }>();
  for (const row of reviewGroups) {
    if (row.recipeId) {
      reviewsByRecipe.set(row.recipeId, {
        count: row._count._all,
        avg: row._avg.rating ?? null,
      });
    }
  }

  // Website: human-only; exclude cook subroutes from Recipe aggregation.
  type Acc = { pageViews: number; visitors: Set<string>; paths: Set<string> };
  const websiteByRecipe = new Map<string, Acc>();
  const websiteBySeries = new Map<string, Acc>();
  const websiteByPage = new Map<string, Acc>();
  let websiteTotalViews = 0;
  const websiteTotalVisitors = new Set<string>();

  for (const view of pageViews) {
    const ua = view.userAgent || view.visitor.userAgent || "";
    if (!isHumanAudienceGuest({ clientKind: view.visitor.clientKind, userAgent: ua })) {
      continue;
    }
    const path = normalizeRedirectPath(view.path) || view.path;
    if (isRecipeCookPath(path)) continue;

    websiteTotalViews += 1;
    websiteTotalVisitors.add(view.visitorId);

    const resolved = resolvePerformancePath(path, identity);
    if (resolved.status !== "resolved") {
      const key = path;
      const acc = websiteByPage.get(key) || { pageViews: 0, visitors: new Set(), paths: new Set() };
      acc.pageViews += 1;
      acc.visitors.add(view.visitorId);
      acc.paths.add(path);
      websiteByPage.set(key, acc);
      continue;
    }

    if (resolved.entity.kind === "recipe") {
      const acc =
        websiteByRecipe.get(resolved.entity.recipeId) || {
          pageViews: 0,
          visitors: new Set(),
          paths: new Set(),
        };
      acc.pageViews += 1;
      acc.visitors.add(view.visitorId);
      acc.paths.add(path);
      websiteByRecipe.set(resolved.entity.recipeId, acc);
    } else if (resolved.entity.kind === "series") {
      const acc =
        websiteBySeries.get(resolved.entity.seriesId) || {
          pageViews: 0,
          visitors: new Set(),
          paths: new Set(),
        };
      acc.pageViews += 1;
      acc.visitors.add(view.visitorId);
      acc.paths.add(path);
      websiteBySeries.set(resolved.entity.seriesId, acc);
    } else {
      const key = resolved.entity.path;
      const acc = websiteByPage.get(key) || { pageViews: 0, visitors: new Set(), paths: new Set() };
      acc.pageViews += 1;
      acc.visitors.add(view.visitorId);
      acc.paths.add(path);
      websiteByPage.set(key, acc);
    }
  }

  // GSC aggregation maps
  const gscByRecipe = new Map<string, GscPageMetricInput[]>();
  const gscPathsByRecipe = new Map<string, Set<string>>();
  const gscBySeries = new Map<string, GscPageMetricInput[]>();
  const gscPathsBySeries = new Map<string, Set<string>>();
  const gscByPage = new Map<string, GscPageMetricInput[]>();
  const unresolvedGscPaths = new Set<string>();
  const allGscForOverview: GscPageMetricInput[] = [];

  for (const row of gscRows) {
    const mapped: GscPageMetricInput = {
      date: row.date.toISOString().slice(0, 10),
      pageUrl: row.pageUrl,
      normalizedPath: row.normalizedPath,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    };
    allGscForOverview.push(mapped);

    const path = row.normalizedPath || "";
    if (!path) {
      unresolvedGscPaths.add(row.pageUrl);
      continue;
    }
    if (isRecipeCookPath(path)) continue;

    const resolved = resolvePerformancePath(path, identity);
    if (resolved.status !== "resolved") {
      unresolvedGscPaths.add(path);
      const list = gscByPage.get(path) || [];
      list.push(mapped);
      gscByPage.set(path, list);
      continue;
    }

    if (resolved.entity.kind === "recipe") {
      const list = gscByRecipe.get(resolved.entity.recipeId) || [];
      list.push(mapped);
      gscByRecipe.set(resolved.entity.recipeId, list);
      const paths = gscPathsByRecipe.get(resolved.entity.recipeId) || new Set();
      paths.add(path);
      gscPathsByRecipe.set(resolved.entity.recipeId, paths);
    } else if (resolved.entity.kind === "series") {
      const list = gscBySeries.get(resolved.entity.seriesId) || [];
      list.push(mapped);
      gscBySeries.set(resolved.entity.seriesId, list);
      const paths = gscPathsBySeries.get(resolved.entity.seriesId) || new Set();
      paths.add(path);
      gscPathsBySeries.set(resolved.entity.seriesId, paths);
    } else {
      const key = resolved.entity.path;
      const list = gscByPage.get(key) || [];
      list.push(mapped);
      gscByPage.set(key, list);
    }
  }

  // Funnel: prefer stable recipeId; fill from slug map when missing.
  const funnelRows: FunnelEventRow[] = [];
  for (const event of funnelEvents) {
    const ua = event.visitor.userAgent || "";
    if (!isHumanAudienceGuest({ clientKind: event.visitor.clientKind, userAgent: ua })) {
      continue;
    }
    let recipeId = event.recipeId || "";
    if (!recipeId && event.recipeSlug) {
      recipeId = identity.recipesBySlug.get(event.recipeSlug)?.id || "";
    }
    let targetRecipeId = event.targetRecipeId || "";
    if (!targetRecipeId && event.recipeSlug && event.name === "video_to_recipe") {
      targetRecipeId = identity.recipesBySlug.get(event.recipeSlug)?.id || "";
    }
    funnelRows.push({
      name: event.name,
      recipeId,
      recipeSlug: event.recipeSlug,
      targetRecipeId: targetRecipeId || recipeId,
      youtubeVideoId: event.youtubeVideoId,
    });
  }

  const videoIds = recipesRaw
    .map((row) => linkedVideoIdForRecipe(row))
    .filter((id): id is string => Boolean(id));

  const uniqueVideoIds = [...new Set(videoIds)];
  const [youtubeByVideo, channelAggregate] = await Promise.all([
    includeYoutube && youtubeConnected && uniqueVideoIds.length
      ? loadVideoAnalyticsAggregatesForIds(uniqueVideoIds, rangeDays)
      : Promise.resolve(new Map()),
    includeYoutube && youtubeConnected && ytConnection.channelId
      ? loadChannelAnalyticsAggregate(ytConnection.channelId, rangeDays)
      : Promise.resolve(null),
  ]);

  const googleOverview = aggregateGoogleFromRows(
    allGscForOverview,
    [],
    googleConnected || allGscForOverview.length > 0,
  );

  const recipeTitleMap = new Map(recipesRaw.map((r) => [r.slug, r.title]));

  let recipes: RecipePerformance[] = recipesRaw.map((row) => {
    const videoId = linkedVideoIdForRecipe(row);
    const websiteAcc = websiteByRecipe.get(row.id);
    const website = websiteAcc
      ? aggregateWebsiteFromVisitorSets({
          paths: [...websiteAcc.paths],
          pageViews: websiteAcc.pageViews,
          visitorIds: websiteAcc.visitors,
        })
      : aggregateWebsiteFromVisitorSets({ paths: [], pageViews: 0, visitorIds: new Set() });

    const gscList = gscByRecipe.get(row.id) || [];
    const gscPaths = [...(gscPathsByRecipe.get(row.id) || new Set())];
    const google = aggregateGoogleFromRows(
      gscList,
      gscPaths,
      googleConnected || gscList.length > 0,
    );

    const review = reviewsByRecipe.get(row.id);
    const member = memberMetricsFromCounts({
      saves: savesByRecipe.get(row.id) || 0,
      reviews: review?.count || 0,
      ratingSum: (review?.avg || 0) * (review?.count || 0),
    });
    if (review?.avg != null) member.averageRating = review.avg;

    return {
      recipeId: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      publicPath: recipePublicPath(row.slug),
      website,
      google,
      funnel: aggregateFunnelForRecipe(funnelRows, row.id),
      member,
      hasLinkedVideo: Boolean(videoId),
      youtube: videoId
        ? youtubeMetricsFromAggregate(
            videoId,
            youtubeByVideo.get(videoId),
            youtubeConnected,
          )
        : null,
    };
  });

  if (statusFilter !== "all") {
    recipes = recipes.filter((r) => r.status === statusFilter);
  }
  if (videoFilter === "linked") recipes = recipes.filter((r) => r.hasLinkedVideo);
  if (videoFilter === "none") recipes = recipes.filter((r) => !r.hasLinkedVideo);
  recipes = sortRecipes(recipes, sort);

  const series: SeriesPerformance[] = [...identity.seriesById.values()].map((row) => {
    const websiteAcc = websiteBySeries.get(row.id);
    const website = websiteAcc
      ? aggregateWebsiteFromVisitorSets({
          paths: [...websiteAcc.paths],
          pageViews: websiteAcc.pageViews,
          visitorIds: websiteAcc.visitors,
        })
      : aggregateWebsiteFromVisitorSets({ paths: [], pageViews: 0, visitorIds: new Set() });
    const gscList = gscBySeries.get(row.id) || [];
    const gscPaths = [...(gscPathsBySeries.get(row.id) || new Set())];
    return {
      seriesId: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      publicPath: `/series/${row.slug}`,
      website,
      google: aggregateGoogleFromRows(gscList, gscPaths, googleConnected || gscList.length > 0),
    };
  });

  const otherPages: PagePerformance[] = [];
  const unresolvedPages: PagePerformance[] = [];

  const pageKeys = new Set([...websiteByPage.keys(), ...gscByPage.keys()]);
  for (const path of pageKeys) {
    const resolved = resolvePerformancePath(path, identity);
    const websiteAcc = websiteByPage.get(path);
    const website = websiteAcc
      ? aggregateWebsiteFromVisitorSets({
          paths: [...websiteAcc.paths],
          pageViews: websiteAcc.pageViews,
          visitorIds: websiteAcc.visitors,
        })
      : aggregateWebsiteFromVisitorSets({ paths: [], pageViews: 0, visitorIds: new Set() });
    const gscList = gscByPage.get(path) || [];
    const google = aggregateGoogleFromRows(
      gscList,
      gscList.map((r) => r.normalizedPath).filter(Boolean),
      googleConnected || gscList.length > 0,
    );
    const routeKind =
      resolved.status === "resolved" && resolved.entity.kind === "page"
        ? resolved.entity.routeKind
        : "other";
    const entry: PagePerformance = {
      path,
      label: guestPathTitle(path, recipeTitleMap),
      routeKind,
      website,
      google,
      unresolved: resolved.status !== "resolved",
    };
    if (entry.unresolved) {
      unresolvedPages.push(entry);
      continue;
    }
    if (resolved.status === "resolved" && resolved.entity.kind === "page") {
      otherPages.push(entry);
    }
  }

  otherPages.sort(
    (a, b) => (b.website.pageViews || 0) - (a.website.pageViews || 0) || a.path.localeCompare(b.path),
  );
  unresolvedPages.sort((a, b) => a.path.localeCompare(b.path));

  const coverage: SourceCoverage = {
    googleConnected,
    googleLastDataDate: connectionRow?.lastDataDate
      ? connectionRow.lastDataDate.toISOString().slice(0, 10)
      : gscConnection.lastDataDate,
    youtubeConnected,
    youtubeLastSuccessfulSyncAt: ytConnection.lastSyncAt,
    websiteIncludesToday: true,
    googleEndsYesterday: true,
  };

  return {
    range,
    coverage,
    overview: {
      websitePageViews: websiteTotalViews,
      websiteUniqueVisitors: websiteTotalVisitors.size,
      googleClicks: googleOverview.clicks,
      googleImpressions: googleOverview.impressions,
      googleCtr: googleOverview.ctr,
      googlePosition: googleOverview.position,
      googleAvailability: googleOverview.availability,
      youtubeViews:
        includeYoutube && channelAggregate ? channelAggregate.views : null,
      youtubeAvailability: !includeYoutube
        ? "hidden"
        : !youtubeConnected
          ? "not_connected"
          : channelAggregate
            ? "available"
            : "unavailable",
      recipeToVideoOpens: sumRecipeToVideoOpens(funnelRows),
    },
    recipes,
    series,
    otherPages,
    unresolvedPages,
    unresolvedGooglePathCount: unresolvedGscPaths.size,
  };
}

export async function loadRecipePerformanceDetail(input: {
  recipeId: string;
  rangeDays?: AnalyticsRangeDays | unknown;
  includeYoutube?: boolean;
  now?: Date;
}) {
  const dashboard = await loadContentPerformanceDashboard({
    rangeDays: input.rangeDays,
    status: "all",
    includeYoutube: input.includeYoutube,
    now: input.now,
  });
  const recipe = dashboard.recipes.find((row) => row.recipeId === input.recipeId);
  if (!recipe) return null;

  const identity = await loadIdentityContext();
  const db = getDb();
  const connectionRow = await db.searchConsoleConnection.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true, selectedProperty: true },
  });
  const googleStart = searchConsoleDateFromYmd(dashboard.range.googleStartDate);
  const googleEnd = searchConsoleDateFromYmd(dashboard.range.googleEndDate);

  const gscRows = connectionRow?.id
    ? await db.searchConsolePageMetric.findMany({
        where: {
          connectionId: connectionRow.id,
          date: { gte: googleStart, lte: googleEnd },
        },
        select: {
          date: true,
          pageUrl: true,
          normalizedPath: true,
          clicks: true,
          impressions: true,
          ctr: true,
          position: true,
        },
      })
    : [];

  const contributing = gscRows
    .filter((row) => {
      if (!row.normalizedPath) return false;
      const resolved = resolvePerformancePath(row.normalizedPath, identity);
      return (
        resolved.status === "resolved" &&
        resolved.entity.kind === "recipe" &&
        resolved.entity.recipeId === input.recipeId
      );
    })
    .map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      pageUrl: row.pageUrl,
      normalizedPath: row.normalizedPath,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }));

  const historicalPaths = collectPathsForRecipe(
    input.recipeId,
    contributing.map((r) => r.normalizedPath),
    identity,
  );

  const websiteViews = await db.guestPageView.findMany({
    where: {
      createdAt: {
        gte: dashboard.range.websiteStart,
        lt: dashboard.range.websiteEndExclusive,
      },
    },
    select: {
      path: true,
      createdAt: true,
      visitorId: true,
      visitor: { select: { clientKind: true, userAgent: true } },
      userAgent: true,
    },
  });

  const dailyWebsite = new Map<string, { views: number; visitors: Set<string> }>();
  for (const view of websiteViews) {
    const ua = view.userAgent || view.visitor.userAgent || "";
    if (!isHumanAudienceGuest({ clientKind: view.visitor.clientKind, userAgent: ua })) continue;
    const path = normalizeRedirectPath(view.path) || view.path;
    if (isRecipeCookPath(path)) continue;
    const resolved = resolvePerformancePath(path, identity);
    if (
      resolved.status !== "resolved" ||
      resolved.entity.kind !== "recipe" ||
      resolved.entity.recipeId !== input.recipeId
    ) {
      continue;
    }
    const day = view.createdAt.toISOString().slice(0, 10);
    const acc = dailyWebsite.get(day) || { views: 0, visitors: new Set() };
    acc.views += 1;
    acc.visitors.add(view.visitorId);
    dailyWebsite.set(day, acc);
  }

  return {
    recipe,
    coverage: dashboard.coverage,
    range: dashboard.range,
    historicalPaths,
    googleTrend: googleDailyTrend(contributing),
    websiteTrend: [...dailyWebsite.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        date,
        pageViews: value.views,
        uniqueVisitors: value.visitors.size,
      })),
  };
}

export { parseContentPerformanceRangeDays, contentPerformanceRange };
