/**
 * Pure Search Console metric aggregation helpers.
 * CTR = total clicks / total impressions (never mean of row CTRs).
 * Position = impression-weighted average of row positions.
 */

export type SearchConsoleMetricRow = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SearchConsolePageRow = SearchConsoleMetricRow & {
  pageUrl: string;
  normalizedPath: string;
};

export type SearchConsoleQueryRow = SearchConsoleMetricRow & {
  query: string;
};

export type SearchConsoleKpis = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  rowCount: number;
};

export function aggregateSearchConsoleKpis(
  rows: Array<{ clicks: number; impressions: number; position: number }>,
): SearchConsoleKpis {
  let clicks = 0;
  let impressions = 0;
  let positionWeight = 0;
  for (const row of rows) {
    const c = Number(row.clicks) || 0;
    const i = Number(row.impressions) || 0;
    const p = Number(row.position) || 0;
    clicks += c;
    impressions += i;
    positionWeight += p * i;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? positionWeight / impressions : 0,
    rowCount: rows.length,
  };
}

export function formatSearchConsoleCtr(ctr: number): string {
  if (!Number.isFinite(ctr) || ctr <= 0) return "0%";
  return `${(ctr * 100).toFixed(ctr * 100 >= 10 ? 1 : 2)}%`;
}

export function formatSearchConsolePosition(position: number): string {
  if (!Number.isFinite(position) || position <= 0) return "—";
  return position.toFixed(1);
}

export function dailySearchConsoleTrend(
  rows: Array<{ date: string; clicks: number; impressions: number; position: number }>,
): Array<{ date: string; clicks: number; impressions: number; ctr: number; position: number }> {
  const byDate = new Map<
    string,
    { clicks: number; impressions: number; positionWeight: number }
  >();
  for (const row of rows) {
    const key = row.date.slice(0, 10);
    const current = byDate.get(key) ?? { clicks: 0, impressions: 0, positionWeight: 0 };
    current.clicks += Number(row.clicks) || 0;
    current.impressions += Number(row.impressions) || 0;
    current.positionWeight += (Number(row.position) || 0) * (Number(row.impressions) || 0);
    byDate.set(key, current);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      date,
      clicks: value.clicks,
      impressions: value.impressions,
      ctr: value.impressions > 0 ? value.clicks / value.impressions : 0,
      position: value.impressions > 0 ? value.positionWeight / value.impressions : 0,
    }));
}

export function topSearchConsolePages(
  rows: SearchConsolePageRow[],
  limit = 25,
): Array<SearchConsolePageRow & { clicks: number; impressions: number; ctr: number; position: number }> {
  const byPage = new Map<
    string,
    {
      pageUrl: string;
      normalizedPath: string;
      clicks: number;
      impressions: number;
      positionWeight: number;
    }
  >();
  for (const row of rows) {
    const key = row.pageUrl;
    const current = byPage.get(key) ?? {
      pageUrl: row.pageUrl,
      normalizedPath: row.normalizedPath,
      clicks: 0,
      impressions: 0,
      positionWeight: 0,
    };
    current.clicks += Number(row.clicks) || 0;
    current.impressions += Number(row.impressions) || 0;
    current.positionWeight += (Number(row.position) || 0) * (Number(row.impressions) || 0);
    if (!current.normalizedPath && row.normalizedPath) {
      current.normalizedPath = row.normalizedPath;
    }
    byPage.set(key, current);
  }
  return [...byPage.values()]
    .map((row) => ({
      date: "",
      pageUrl: row.pageUrl,
      normalizedPath: row.normalizedPath,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
      position: row.impressions > 0 ? row.positionWeight / row.impressions : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit);
}

export function topSearchConsoleQueries(
  rows: SearchConsoleQueryRow[],
  limit = 25,
): Array<SearchConsoleQueryRow & { clicks: number; impressions: number; ctr: number; position: number }> {
  const byQuery = new Map<
    string,
    { query: string; clicks: number; impressions: number; positionWeight: number }
  >();
  for (const row of rows) {
    const key = row.query;
    const current = byQuery.get(key) ?? {
      query: row.query,
      clicks: 0,
      impressions: 0,
      positionWeight: 0,
    };
    current.clicks += Number(row.clicks) || 0;
    current.impressions += Number(row.impressions) || 0;
    current.positionWeight += (Number(row.position) || 0) * (Number(row.impressions) || 0);
    byQuery.set(key, current);
  }
  return [...byQuery.values()]
    .map((row) => ({
      date: "",
      query: row.query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
      position: row.impressions > 0 ? row.positionWeight / row.impressions : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit);
}

/** Inclusive UTC window ending yesterday (Search Console lag). */
export function searchConsoleAnalyticsDateRange(
  days: 7 | 28 | 90,
  now: Date = new Date(),
): { startDate: string; endDate: string; days: 7 | 28 | 90 } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    days,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export const SEARCH_CONSOLE_INITIAL_SYNC_DAYS = 90;
/** Re-sync recent days on incremental runs so late revisions upsert correctly. */
export const SEARCH_CONSOLE_SYNC_OVERLAP_DAYS = 3;
export const SEARCH_CONSOLE_API_ROW_LIMIT = 25000;
export const SEARCH_CONSOLE_MAX_PAGES = 20;
