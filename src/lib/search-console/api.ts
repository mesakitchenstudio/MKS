import "server-only";
import { SearchConsoleError } from "@/lib/search-console/errors";
import { SEARCH_CONSOLE_API_ROW_LIMIT, SEARCH_CONSOLE_MAX_PAGES } from "@/lib/search-console/aggregate";

export type SearchConsoleSiteEntry = {
  siteUrl: string;
  permissionLevel: string;
};

export type SearchConsoleAnalyticsRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function listSearchConsoleSites(
  accessToken: string,
): Promise<SearchConsoleSiteEntry[]> {
  const response = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await response.json()) as {
    siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new SearchConsoleError(
      "api_error",
      "Could not load Search Console properties.",
      json.error?.message,
    );
  }
  return (json.siteEntry || [])
    .map((entry) => ({
      siteUrl: String(entry.siteUrl || "").trim(),
      permissionLevel: String(entry.permissionLevel || "").trim(),
    }))
    .filter((entry) => entry.siteUrl);
}

export type SearchAnalyticsQueryInput = {
  accessToken: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions: Array<"page" | "date" | "query">;
  rowLimit?: number;
  maxPages?: number;
};

export type SearchAnalyticsQueryResult = {
  rows: SearchConsoleAnalyticsRow[];
  truncated: boolean;
  pagesFetched: number;
};

/**
 * Paginated Search Analytics query with a hard safety bound.
 * Does not silently stop after the first page.
 */
export async function querySearchConsoleSearchAnalytics(
  input: SearchAnalyticsQueryInput,
): Promise<SearchAnalyticsQueryResult> {
  const rowLimit = input.rowLimit ?? SEARCH_CONSOLE_API_ROW_LIMIT;
  const maxPages = input.maxPages ?? SEARCH_CONSOLE_MAX_PAGES;
  const encodedSite = encodeURIComponent(input.siteUrl);
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`;

  const rows: SearchConsoleAnalyticsRow[] = [];
  let truncated = false;
  let pagesFetched = 0;

  for (let page = 0; page < maxPages; page += 1) {
    pagesFetched += 1;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: input.startDate,
        endDate: input.endDate,
        dimensions: input.dimensions,
        rowLimit,
        startRow: page * rowLimit,
      }),
    });
    const json = (await response.json()) as {
      rows?: Array<{
        keys?: string[];
        clicks?: number;
        impressions?: number;
        ctr?: number;
        position?: number;
      }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new SearchConsoleError(
        "api_error",
        "Search Console Search Analytics request failed.",
        json.error?.message,
      );
    }
    const batch = json.rows || [];
    for (const row of batch) {
      rows.push({
        keys: Array.isArray(row.keys) ? row.keys.map(String) : [],
        clicks: Number(row.clicks) || 0,
        impressions: Number(row.impressions) || 0,
        ctr: Number(row.ctr) || 0,
        position: Number(row.position) || 0,
      });
    }
    if (batch.length < rowLimit) {
      return { rows, truncated: false, pagesFetched };
    }
  }

  truncated = true;
  return { rows, truncated, pagesFetched };
}

export function inferSearchConsolePropertyType(siteUrl: string): "DOMAIN" | "URL_PREFIX" | "" {
  const value = String(siteUrl || "").trim();
  if (!value) return "";
  if (value.startsWith("sc-domain:")) return "DOMAIN";
  if (/^https?:\/\//i.test(value)) return "URL_PREFIX";
  return "";
}
