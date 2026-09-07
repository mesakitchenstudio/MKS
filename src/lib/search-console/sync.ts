import "server-only";
import { getDb } from "@/lib/db";
import { querySearchConsoleSearchAnalytics } from "@/lib/search-console/api";
import {
  SEARCH_CONSOLE_INITIAL_SYNC_DAYS,
  SEARCH_CONSOLE_SYNC_OVERLAP_DAYS,
  searchConsoleAnalyticsDateRange,
} from "@/lib/search-console/aggregate";
import {
  getSearchConsoleAccessToken,
  getSearchConsoleConnectionRow,
} from "@/lib/search-console/connection";
import { SearchConsoleError, searchConsoleErrorMessage } from "@/lib/search-console/errors";
import {
  normalizeSearchConsolePageUrl,
  searchConsoleDateFromYmd,
  searchConsoleYmdFromDate,
} from "@/lib/search-console/paths";

export type SearchConsoleSyncResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  connectionId?: string;
  property?: string;
  startDate?: string;
  endDate?: string;
  pageRowsUpserted: number;
  queryRowsUpserted: number;
  pageTruncated: boolean;
  queryTruncated: boolean;
  lastDataDate?: string | null;
  error?: string;
  errorCode?: string;
};

function resolveSyncWindow(input?: {
  days?: number;
  now?: Date;
  lastDataDate?: Date | null;
}): { startDate: string; endDate: string } {
  const now = input?.now ?? new Date();
  const initial = searchConsoleAnalyticsDateRange(
    SEARCH_CONSOLE_INITIAL_SYNC_DAYS,
    now,
  );
  if (!input?.lastDataDate) {
    return { startDate: initial.startDate, endDate: initial.endDate };
  }
  const last = searchConsoleYmdFromDate(input.lastDataDate);
  const overlapStart = searchConsoleDateFromYmd(last);
  overlapStart.setUTCDate(overlapStart.getUTCDate() - SEARCH_CONSOLE_SYNC_OVERLAP_DAYS);
  const startDate = overlapStart.toISOString().slice(0, 10);
  // Never sync before the initial window floor.
  return {
    startDate: startDate < initial.startDate ? initial.startDate : startDate,
    endDate: initial.endDate,
  };
}

async function upsertPageRows(input: {
  connectionId: string;
  rows: Array<{
    date: string;
    pageUrl: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
}): Promise<number> {
  const db = getDb();
  let count = 0;
  for (const row of input.rows) {
    if (!row.pageUrl || !row.date) continue;
    const normalized = normalizeSearchConsolePageUrl(row.pageUrl);
    const date = searchConsoleDateFromYmd(row.date);
    await db.searchConsolePageMetric.upsert({
      where: {
        connectionId_date_pageUrl: {
          connectionId: input.connectionId,
          date,
          pageUrl: normalized.pageUrl,
        },
      },
      create: {
        connectionId: input.connectionId,
        date,
        pageUrl: normalized.pageUrl,
        normalizedPath: normalized.normalizedPath,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      },
      update: {
        normalizedPath: normalized.normalizedPath,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      },
    });
    count += 1;
  }
  return count;
}

async function upsertQueryRows(input: {
  connectionId: string;
  rows: Array<{
    date: string;
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
}): Promise<number> {
  const db = getDb();
  let count = 0;
  for (const row of input.rows) {
    const query = String(row.query || "").trim();
    if (!query || !row.date) continue;
    const date = searchConsoleDateFromYmd(row.date);
    await db.searchConsoleQueryMetric.upsert({
      where: {
        connectionId_date_query: {
          connectionId: input.connectionId,
          date,
          query,
        },
      },
      create: {
        connectionId: input.connectionId,
        date,
        query,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      },
      update: {
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      },
    });
    count += 1;
  }
  return count;
}

/**
 * Canonical Search Console sync — used by OAuth callback, manual Sync, and cron.
 * Page metrics are mandatory; query metrics are best-effort (failure does not wipe pages).
 */
export async function syncSearchConsole(input?: {
  now?: Date;
  forceFullWindow?: boolean;
}): Promise<SearchConsoleSyncResult> {
  const db = getDb();
  const connection = await getSearchConsoleConnectionRow();
  if (!connection || connection.status === "disconnected" || !connection.refreshTokenEnc) {
    return {
      ok: true,
      skipped: true,
      reason: "disconnected",
      pageRowsUpserted: 0,
      queryRowsUpserted: 0,
      pageTruncated: false,
      queryTruncated: false,
    };
  }
  if (!connection.selectedProperty) {
    return {
      ok: true,
      skipped: true,
      reason: "no_property",
      connectionId: connection.id,
      pageRowsUpserted: 0,
      queryRowsUpserted: 0,
      pageTruncated: false,
      queryTruncated: false,
    };
  }
  if (connection.status === "needs_reconnect") {
    return {
      ok: false,
      skipped: true,
      reason: "needs_reconnect",
      connectionId: connection.id,
      pageRowsUpserted: 0,
      queryRowsUpserted: 0,
      pageTruncated: false,
      queryTruncated: false,
      error: connection.lastErrorMessage || "Search Console needs reconnection.",
      errorCode: connection.lastErrorCode || "needs_reconnect",
    };
  }

  await db.searchConsoleConnection.update({
    where: { id: connection.id },
    data: {
      lastSyncStartedAt: new Date(),
      lastErrorCode: "",
      lastErrorMessage: "",
    },
  });

  try {
    const { accessToken, connectionId } = await getSearchConsoleAccessToken();
    const window = resolveSyncWindow({
      now: input?.now,
      lastDataDate: input?.forceFullWindow ? null : connection.lastDataDate,
    });

    const pageResult = await querySearchConsoleSearchAnalytics({
      accessToken,
      siteUrl: connection.selectedProperty,
      startDate: window.startDate,
      endDate: window.endDate,
      dimensions: ["date", "page"],
    });

    const pageRows = pageResult.rows.map((row) => ({
      date: row.keys[0] || "",
      pageUrl: row.keys[1] || "",
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }));
    const pageRowsUpserted = await upsertPageRows({ connectionId, rows: pageRows });

    let queryRowsUpserted = 0;
    let queryTruncated = false;
    let queryError: string | undefined;
    try {
      const queryResult = await querySearchConsoleSearchAnalytics({
        accessToken,
        siteUrl: connection.selectedProperty,
        startDate: window.startDate,
        endDate: window.endDate,
        dimensions: ["date", "query"],
      });
      queryTruncated = queryResult.truncated;
      queryRowsUpserted = await upsertQueryRows({
        connectionId,
        rows: queryResult.rows.map((row) => ({
          date: row.keys[0] || "",
          query: row.keys[1] || "",
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        })),
      });
    } catch (error) {
      queryError = searchConsoleErrorMessage(error);
    }

    const latestPage = await db.searchConsolePageMetric.findFirst({
      where: { connectionId },
      orderBy: { date: "desc" },
      select: { date: true },
    });

    await db.searchConsoleConnection.update({
      where: { id: connectionId },
      data: {
        status: "connected",
        lastSyncCompletedAt: new Date(),
        lastSuccessfulSyncAt: new Date(),
        lastDataDate: latestPage?.date ?? connection.lastDataDate,
        lastErrorCode: queryError ? "query_sync_partial" : "",
        lastErrorMessage: queryError
          ? `Page metrics synced. Query metrics failed: ${queryError}`
          : pageResult.truncated
            ? "Page sync hit pagination safety bound; some rows may be truncated."
            : "",
      },
    });

    return {
      ok: true,
      connectionId,
      property: connection.selectedProperty,
      startDate: window.startDate,
      endDate: window.endDate,
      pageRowsUpserted,
      queryRowsUpserted,
      pageTruncated: pageResult.truncated,
      queryTruncated,
      lastDataDate: latestPage ? searchConsoleYmdFromDate(latestPage.date) : null,
      error: queryError,
      errorCode: queryError ? "query_sync_partial" : undefined,
    };
  } catch (error) {
    const message = searchConsoleErrorMessage(error);
    const code = error instanceof SearchConsoleError ? error.code : "sync_failed";
    const needsReconnect = code === "revoked" || code === "not_connected";
    await db.searchConsoleConnection.update({
      where: { id: connection.id },
      data: {
        status: needsReconnect ? "needs_reconnect" : "error",
        lastSyncCompletedAt: new Date(),
        lastErrorCode: code,
        lastErrorMessage: message,
      },
    });
    return {
      ok: false,
      connectionId: connection.id,
      property: connection.selectedProperty,
      pageRowsUpserted: 0,
      queryRowsUpserted: 0,
      pageTruncated: false,
      queryTruncated: false,
      error: message,
      errorCode: code,
    };
  }
}
