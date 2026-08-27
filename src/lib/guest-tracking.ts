/** Shared guest analytics helpers (safe for client + tests). */

export function shouldTrackGuestPath(pathname: string) {
  return (
    Boolean(pathname) &&
    pathname.startsWith("/") &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/auth") &&
    !pathname.startsWith("/profile") &&
    !pathname.startsWith("/coming-soon")
  );
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
