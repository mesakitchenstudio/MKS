import "server-only";
import { getDb } from "@/lib/db";
import {
  DEFAULT_ANALYTICS_RANGE_DAYS,
  parseAnalyticsRangeDays,
} from "@/lib/youtube-analytics/ranges";

export type SearchTermStat = {
  query: string;
  searches: number;
};

export type SearchFilterDeadEnd = {
  label: string;
  searches: number;
};

export type SearchAnalyticsDashboard = {
  rangeDays: number;
  totalSearches: number;
  zeroResultSearches: number;
  popular: SearchTermStat[];
  zeroResults: SearchTermStat[];
  filterDeadEnds: SearchFilterDeadEnd[];
};

function searchDateWindow(rangeDays: number) {
  const endExclusive = new Date();
  const start = new Date(endExclusive.getTime() - rangeDays * 24 * 60 * 60 * 1000);
  return { start, endExclusive };
}

function filterDeadEndLabel(filtersJson: string): string | null {
  try {
    const parsed = JSON.parse(filtersJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    const parts: string[] = [];
    for (const key of ["category", "time", "cuisine", "method", "video", "collection", "sort"]) {
      const value = parsed[key];
      if (value === undefined || value === null || value === "") continue;
      parts.push(`${key}=${String(value)}`);
    }
    return parts.length ? parts.join(" · ") : null;
  } catch {
    return null;
  }
}

export async function loadSearchAnalyticsDashboard(input?: {
  analyticsRangeDays?: number;
  limit?: number;
}): Promise<SearchAnalyticsDashboard> {
  const rangeDays = parseAnalyticsRangeDays(
    input?.analyticsRangeDays ?? DEFAULT_ANALYTICS_RANGE_DAYS,
  );
  const limit = Math.min(50, Math.max(5, input?.limit ?? 20));
  const window = searchDateWindow(rangeDays);
  const db = getDb();

  const rows = await db.searchEvent.findMany({
    where: {
      createdAt: { gte: window.start, lt: window.endExclusive },
    },
    select: {
      queryNorm: true,
      queryRaw: true,
      zeroResult: true,
      filters: true,
    },
  });

  const popularMap = new Map<string, { query: string; searches: number }>();
  const zeroMap = new Map<string, { query: string; searches: number }>();
  const filterMap = new Map<string, number>();
  let zeroResultSearches = 0;

  for (const row of rows) {
    const norm = row.queryNorm.trim();
    if (norm) {
      const display = row.queryRaw.trim() || norm;
      const popular = popularMap.get(norm) ?? { query: display, searches: 0 };
      popular.searches += 1;
      if (display.length < popular.query.length) popular.query = display;
      popularMap.set(norm, popular);

      if (row.zeroResult) {
        zeroResultSearches += 1;
        const zero = zeroMap.get(norm) ?? { query: display, searches: 0 };
        zero.searches += 1;
        if (display.length < zero.query.length) zero.query = display;
        zeroMap.set(norm, zero);
      }
      continue;
    }

    if (row.zeroResult) {
      zeroResultSearches += 1;
      const label = filterDeadEndLabel(row.filters);
      if (label) filterMap.set(label, (filterMap.get(label) ?? 0) + 1);
    }
  }

  const sortDesc = (a: { searches: number; query: string }, b: { searches: number; query: string }) =>
    b.searches - a.searches || a.query.localeCompare(b.query);

  return {
    rangeDays,
    totalSearches: rows.length,
    zeroResultSearches,
    popular: [...popularMap.values()].sort(sortDesc).slice(0, limit),
    zeroResults: [...zeroMap.values()].sort(sortDesc).slice(0, limit),
    filterDeadEnds: [...filterMap.entries()]
      .map(([label, searches]) => ({ label, searches }))
      .sort((a, b) => b.searches - a.searches || a.label.localeCompare(b.label))
      .slice(0, limit),
  };
}
