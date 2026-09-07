/**
 * Recipe search analytics — client helpers (no secrets).
 * Consent-gated first-party ingest; not a member profile.
 */

export const SEARCH_ANALYTICS_PLACEMENTS = ["search_overlay", "recipes_catalog"] as const;
export type SearchAnalyticsPlacement = (typeof SEARCH_ANALYTICS_PLACEMENTS)[number];

export const SEARCH_QUERY_MAX_LEN = 120;
export const SEARCH_FILTER_VALUE_MAX_LEN = 80;

export type SearchAnalyticsPayload = {
  searchQuery: string;
  resultCount: number;
  placement: SearchAnalyticsPlacement;
  filters?: Record<string, string | number | boolean | undefined | null>;
  clientVisitorKey?: string;
};

export function normalizeSearchAnalyticsQuery(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, SEARCH_QUERY_MAX_LEN);
}

export function clipSearchAnalyticsQueryRaw(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, SEARCH_QUERY_MAX_LEN);
}

export function isSearchAnalyticsPlacement(value: unknown): value is SearchAnalyticsPlacement {
  return (
    typeof value === "string" &&
    (SEARCH_ANALYTICS_PLACEMENTS as readonly string[]).includes(value)
  );
}

const BLOCKED_FILTER_KEYS = new Set([
  "email",
  "authorEmail",
  "authorName",
  "comment",
  "body",
  "name",
  "search",
  "query",
  "ip",
  "userAgent",
]);

export function sanitizeSearchAnalyticsFilters(
  raw: Record<string, string | number | boolean | undefined | null> | undefined,
): Record<string, string | number | boolean> {
  if (!raw) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (BLOCKED_FILTER_KEYS.has(key)) continue;
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "boolean" || typeof value === "number") {
      if (typeof value === "number" && !Number.isFinite(value)) continue;
      out[key] = value;
      continue;
    }
    if (typeof value === "string") {
      const clipped = value.trim().slice(0, SEARCH_FILTER_VALUE_MAX_LEN);
      if (clipped) out[key] = clipped;
    }
  }
  return out;
}

/**
 * Fire-and-forget search ingest. Never throws / never blocks navigation.
 * Empty queries are skipped unless filters are present (filter dead-end signal).
 */
export function recordSearchAnalytics(payload: SearchAnalyticsPayload): void {
  if (typeof window === "undefined") return;

  const queryRaw = clipSearchAnalyticsQueryRaw(payload.searchQuery);
  const queryNorm = normalizeSearchAnalyticsQuery(queryRaw);
  const filters = sanitizeSearchAnalyticsFilters(payload.filters);
  if (!queryNorm && Object.keys(filters).length === 0) return;
  if (!isSearchAnalyticsPlacement(payload.placement)) return;

  const resultCount = Math.max(0, Math.round(Number(payload.resultCount) || 0));
  const body = JSON.stringify({
    queryRaw,
    queryNorm,
    resultCount,
    zeroResult: resultCount === 0,
    placement: payload.placement,
    filters,
    clientVisitorKey: payload.clientVisitorKey || "",
  });

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/analytics/search", blob)) return;
    }
    void fetch("/api/analytics/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {
      /* fail open */
    });
  } catch {
    /* fail open */
  }
}
