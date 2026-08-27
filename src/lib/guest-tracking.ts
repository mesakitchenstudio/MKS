/** Shared guest analytics helpers (safe for client + tests). */

/** Heartbeat interval while a public page is open (also refreshed on focus/visibility). */
export const GUEST_HEARTBEAT_MS = 45_000;
/** Early follow-up so mobile timer throttling cannot leave lastSeen stuck after the first pageview. */
export const GUEST_EARLY_HEARTBEAT_MS = 15_000;

/**
 * Signed-in members are recorded on Members, not Visitors.
 * Staff keep a NextAuth session for Admin but must still appear in Visitors while
 * browsing the public Coming Soon page (common Android QA case).
 */
export function shouldSkipGuestAnalytics(session: {
  email?: string | null;
  staffRole?: unknown;
} | null | undefined) {
  if (!session?.email) return false;
  if (session.staffRole) return false;
  return true;
}

/**
 * Whether a client presence ping should fire.
 * Routine heartbeats skip hidden tabs (mobile Chrome suspends them anyway).
 * Pageviews and unload (`force`) always send so lastSeen stays accurate.
 */
export function shouldSendGuestPresence(input: {
  pageview: boolean;
  visibilityState: string;
  force?: boolean;
}) {
  if (input.pageview || input.force) return true;
  return input.visibilityState !== "hidden";
}

export function shouldTrackGuestPath(pathname: string) {
  return (
    Boolean(pathname) &&
    pathname.startsWith("/") &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/auth") &&
    !pathname.startsWith("/profile")
  );
}

/** While SITE_PRIVATE rewrites public pages to Coming Soon, store one canonical path. */
export function guestAnalyticsPath(pathname: string, sitePrivate: boolean) {
  const path = pathname.trim().split("?")[0]?.split("#")[0] || "";
  if (!shouldTrackGuestPath(path) && path !== "/coming-soon") return "";
  if (sitePrivate) return "/coming-soon";
  return path;
}

export function normalizeGuestNavId(value: unknown) {
  const navId = String(value || "").trim();
  if (!navId || navId.length > 80) return "";
  // UUIDs / cuid-like tokens from the client
  if (!/^[A-Za-z0-9_-]+$/.test(navId)) return "";
  return navId;
}

/**
 * Decide whether to insert a GuestPageView row.
 * Heartbeats never insert. With navId, uniqueness is enforced at the DB;
 * without navId (legacy), skip same-path inserts inside a short window.
 */
export function shouldInsertGuestPageView(input: {
  recordPageView: boolean;
  navId: string;
  alreadyStoredForNavId: boolean;
  latestPath: string | null | undefined;
  path: string;
  latestAgeMs: number | null;
  dedupeWindowMs: number;
}) {
  if (!input.recordPageView) return false;
  if (input.navId) return !input.alreadyStoredForNavId;
  if (
    input.latestPath === input.path &&
    input.latestAgeMs != null &&
    input.latestAgeMs < input.dedupeWindowMs
  ) {
    return false;
  }
  return true;
}

/** Module-level navigation state survives React Strict Mode remounts. */
let activeNavigation: { path: string; navId: string } | null = null;
const sentNavIds = new Set<string>();

export function resetGuestNavigationStateForTests() {
  activeNavigation = null;
  sentNavIds.clear();
}

export function clearActiveGuestNavigation() {
  activeNavigation = null;
}

export function guestNavigationFor(path: string) {
  if (activeNavigation?.path === path) return activeNavigation;
  activeNavigation = {
    path,
    navId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `nav_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  };
  return activeNavigation;
}

/** Returns true once per navId (first caller wins). */
export function claimGuestPageview(navId: string) {
  if (!navId || sentNavIds.has(navId)) return false;
  sentNavIds.add(navId);
  return true;
}
