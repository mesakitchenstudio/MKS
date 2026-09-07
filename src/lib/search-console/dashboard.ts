import "server-only";
import { getDb } from "@/lib/db";
import {
  aggregateSearchConsoleKpis,
  dailySearchConsoleTrend,
  topSearchConsolePages,
  topSearchConsoleQueries,
  searchConsoleAnalyticsDateRange,
} from "@/lib/search-console/aggregate";
import { getSearchConsoleConnectionPublic } from "@/lib/search-console/connection";
import {
  classifySearchConsolePath,
  type SearchConsoleRouteKind,
} from "@/lib/search-console/paths";
import { parseAnalyticsRangeDays, type AnalyticsRangeDays } from "@/lib/youtube-analytics/ranges";

export type SearchConsoleTopPageView = ReturnType<typeof topSearchConsolePages>[number] & {
  routeKind: SearchConsoleRouteKind;
};

export function parseSearchConsoleRangeDays(raw: unknown): AnalyticsRangeDays {
  return parseAnalyticsRangeDays(raw);
}

export async function loadSearchConsoleDashboard(input?: {
  rangeDays?: AnalyticsRangeDays;
  now?: Date;
}): Promise<{
  connection: Awaited<ReturnType<typeof getSearchConsoleConnectionPublic>>;
  range: ReturnType<typeof searchConsoleAnalyticsDateRange>;
  kpis: ReturnType<typeof aggregateSearchConsoleKpis>;
  trend: ReturnType<typeof dailySearchConsoleTrend>;
  topPages: SearchConsoleTopPageView[];
  topQueries: ReturnType<typeof topSearchConsoleQueries>;
  coverageNote: string | null;
  hasLocalData: boolean;
}> {
  const connection = await getSearchConsoleConnectionPublic();
  const rangeDays = input?.rangeDays ?? 28;
  const range = searchConsoleAnalyticsDateRange(rangeDays, input?.now);
  const db = getDb();
  const row = await db.searchConsoleConnection.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true, selectedProperty: true, lastDataDate: true },
  });

  if (!row?.id || !row.selectedProperty) {
    return {
      connection,
      range,
      kpis: aggregateSearchConsoleKpis([]),
      trend: [],
      topPages: [],
      topQueries: [],
      coverageNote: null,
      hasLocalData: false,
    };
  }

  const start = new Date(`${range.startDate}T00:00:00.000Z`);
  const end = new Date(`${range.endDate}T00:00:00.000Z`);

  const [pageRows, queryRows] = await Promise.all([
    db.searchConsolePageMetric.findMany({
      where: {
        connectionId: row.id,
        date: { gte: start, lte: end },
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
    }),
    db.searchConsoleQueryMetric.findMany({
      where: {
        connectionId: row.id,
        date: { gte: start, lte: end },
      },
      select: {
        date: true,
        query: true,
        clicks: true,
        impressions: true,
        ctr: true,
        position: true,
      },
    }),
  ]);

  const mappedPages = pageRows.map((item) => ({
    date: item.date.toISOString().slice(0, 10),
    pageUrl: item.pageUrl,
    normalizedPath: item.normalizedPath,
    clicks: item.clicks,
    impressions: item.impressions,
    ctr: item.ctr,
    position: item.position,
  }));
  const mappedQueries = queryRows.map((item) => ({
    date: item.date.toISOString().slice(0, 10),
    query: item.query,
    clicks: item.clicks,
    impressions: item.impressions,
    ctr: item.ctr,
    position: item.position,
  }));

  const lastData = row.lastDataDate?.toISOString().slice(0, 10) ?? null;
  let coverageNote: string | null = null;
  if (lastData && lastData < range.endDate) {
    coverageNote = `Local data currently runs through ${lastData}. Later dates may still be unavailable from Google.`;
  } else if (!lastData && mappedPages.length === 0) {
    coverageNote = "No Search Console metrics have been synchronized yet.";
  }

  const topPages = topSearchConsolePages(mappedPages, 25).map((page) => ({
    ...page,
    routeKind: classifySearchConsolePath(page.normalizedPath),
  }));

  return {
    connection,
    range,
    kpis: aggregateSearchConsoleKpis(mappedPages),
    trend: dailySearchConsoleTrend(mappedPages),
    topPages,
    topQueries: topSearchConsoleQueries(mappedQueries, 25),
    coverageNote,
    hasLocalData: mappedPages.length > 0 || mappedQueries.length > 0,
  };
}
