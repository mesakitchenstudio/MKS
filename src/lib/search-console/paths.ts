import { site } from "@/data/site";

const MESA_HOSTS = new Set(
  [site.domain, `www.${site.domain}`, new URL(site.url).host]
    .map((h) => h.toLowerCase())
    .filter(Boolean),
);

/** Calendar date → UTC midnight Date for storage. */
export function searchConsoleDateFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function searchConsoleYmdFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Preserve original Search Console pageUrl; derive Mesa pathname when host matches.
 * Query strings are stripped from normalizedPath (Phase 3 filtered URLs are noindex).
 */
export function normalizeSearchConsolePageUrl(
  pageUrl: string,
  allowedHosts: Set<string> = MESA_HOSTS,
): { pageUrl: string; normalizedPath: string; isMesaHost: boolean } {
  const raw = String(pageUrl || "").trim();
  if (!raw) return { pageUrl: "", normalizedPath: "", isMesaHost: false };
  try {
    const url = new URL(raw);
    const host = url.host.toLowerCase();
    const isMesaHost = allowedHosts.has(host);
    if (!isMesaHost) {
      return { pageUrl: raw, normalizedPath: "", isMesaHost: false };
    }
    let path = url.pathname || "/";
    path = path.replace(/\/{2,}/g, "/");
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return { pageUrl: raw, normalizedPath: path || "/", isMesaHost: true };
  } catch {
    return { pageUrl: raw, normalizedPath: "", isMesaHost: false };
  }
}

export type SearchConsoleRouteKind =
  | "recipe"
  | "category"
  | "collection"
  | "ingredient"
  | "video_hub"
  | "video"
  | "studio"
  | "other";

/** Display-only route classification — not persisted content identity. */
export function classifySearchConsolePath(normalizedPath: string): SearchConsoleRouteKind {
  const path = String(normalizedPath || "").trim() || "/";
  if (path === "/videos") return "video_hub";
  if (/^\/videos\/[^/]+$/.test(path)) return "video";
  if (/^\/recipes\/[^/]+$/.test(path)) return "recipe";
  if (/^\/category\/[^/]+$/.test(path)) return "category";
  if (path === "/series" || /^\/series\/[^/]+$/.test(path)) return "collection";
  if (/^\/ingredient\/[^/]+$/.test(path)) return "ingredient";
  if (path === "/studio" || /^\/studio\/[^/]+$/.test(path)) return "studio";
  return "other";
}
