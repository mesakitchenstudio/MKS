/** Shared guest analytics helpers (safe for client + tests). */

/** Dedupe and trim anonymous visitor ids for bulk admin deletes. */
export function normalizeGuestVisitorIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

/** Heartbeat interval while a public page is open (also refreshed on focus/visibility). */
export const GUEST_HEARTBEAT_MS = 12_000;
/** Early follow-up so mobile timer throttling cannot leave lastSeen stuck after the first pageview. */
export const GUEST_EARLY_HEARTBEAT_MS = 8_000;

/** Presence connection is Online while lastSeenAt is within this window. */
export const GUEST_PRESENCE_STALE_MS = 40_000;

/**
 * After pagehide/sendBeacon disconnect, keep the connection Online briefly so
 * refresh / navigation does not flicker offline.
 */
export const GUEST_PRESENCE_DISCONNECT_GRACE_MS = 5_000;

/** Skip guest presence DB writes when the same connection was touched this recently. */
export const GUEST_PRESENCE_WRITE_THROTTLE_MS = 10_000;

/** Admin → Visitors lightweight presence poll interval. */
export const GUEST_ADMIN_PRESENCE_POLL_MS = 3_000;

/** Shared across tabs in the same browser/incognito session (not tab-scoped). */
export const GUEST_VISITOR_STORAGE_KEY = "mesa-guest-visitor";
const GUEST_CONNECTION_STORAGE_KEY = "mesa-guest-connection";
const GUEST_VISITOR_LOCK_NAME = "mesa-guest-visitor-key";

export function normalizeGuestVisitorKey(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  if (!key || key.length > 80) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(key)) return "";
  return key;
}

/**
 * Cookie wins when present. Otherwise a shared client bootstrap key (localStorage)
 * is accepted so simultaneous tabs upsert the same unique visitorKey.
 */
export function resolveGuestVisitorKey(input: {
  cookieKey?: string | null;
  clientVisitorKey?: string | null;
  generate?: () => string;
}) {
  const fromCookie = normalizeGuestVisitorKey(input.cookieKey);
  if (fromCookie) return { visitorKey: fromCookie, source: "cookie" as const };

  const fromClient = normalizeGuestVisitorKey(input.clientVisitorKey);
  if (fromClient) return { visitorKey: fromClient, source: "client" as const };

  const generate = input.generate ?? (() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `v_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  return { visitorKey: generate(), source: "generated" as const };
}

/**
 * Cookie pointing at a deleted GuestVisitor must rotate — not recreate that history.
 * Client-only bootstrap keys (first visit) are allowed to create normally.
 */
export function shouldRotateMissingGuestVisitor(input: {
  source: "cookie" | "client" | "generated";
  visitorExists: boolean;
}) {
  return input.source === "cookie" && !input.visitorExists;
}

/** Mint a replacement visitor key when the server reports the current one was deleted. */
export async function rotateSharedGuestVisitorKey(staleKey: string) {
  if (typeof window === "undefined") return "";
  const stale = normalizeGuestVisitorKey(staleKey);

  const rotateSync = () => {
    try {
      const current = normalizeGuestVisitorKey(localStorage.getItem(GUEST_VISITOR_STORAGE_KEY));
      // Another tab already rotated away from the deleted identity.
      if (current && current !== stale) return current;

      const created =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `v_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(GUEST_VISITOR_STORAGE_KEY, created);
      return (
        normalizeGuestVisitorKey(localStorage.getItem(GUEST_VISITOR_STORAGE_KEY)) || created
      );
    } catch {
      return (
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `v_${Date.now()}_${Math.random().toString(36).slice(2)}`
      );
    }
  };

  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks && typeof locks.request === "function") {
    try {
      return await locks.request(GUEST_VISITOR_LOCK_NAME, rotateSync);
    } catch {
      // Fall through.
    }
  }
  return rotateSync();
}

function readOrCreateSharedGuestVisitorKeySync() {
  if (typeof window === "undefined") return "";
  try {
    const existing = normalizeGuestVisitorKey(localStorage.getItem(GUEST_VISITOR_STORAGE_KEY));
    if (existing) return existing;

    const created =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `v_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(GUEST_VISITOR_STORAGE_KEY, created);
    // Another tab may have written first — always re-read the shared value.
    return normalizeGuestVisitorKey(localStorage.getItem(GUEST_VISITOR_STORAGE_KEY)) || created;
  } catch {
    return "";
  }
}

/** One anonymous visitor id for all tabs in this browser/private session. */
export async function getSharedGuestVisitorKey() {
  if (typeof window === "undefined") return "";
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks && typeof locks.request === "function") {
    try {
      return await locks.request(GUEST_VISITOR_LOCK_NAME, () =>
        readOrCreateSharedGuestVisitorKeySync(),
      );
    } catch {
      // Fall through if locks are unavailable/denied.
    }
  }
  return readOrCreateSharedGuestVisitorKeySync();
}

export function rememberSharedGuestVisitorKey(visitorKey: string) {
  const key = normalizeGuestVisitorKey(visitorKey);
  if (!key || typeof window === "undefined") return;
  try {
    localStorage.setItem(GUEST_VISITOR_STORAGE_KEY, key);
  } catch {
    // Private mode quota / blocked storage — cookie still carries identity.
  }
}

const GUEST_AUTH_CHANNEL = "mesa-guest-auth";
const GUEST_CONVERTED_STORAGE_KEY = "mesa-guest-converted-at";
const GUEST_ROTATED_STORAGE_KEY = "mesa-guest-rotated-at";

/** Tell sibling tabs a deleted visitor identity was replaced with a fresh key. */
export function broadcastGuestVisitorRotated(visitorKey: string) {
  const key = normalizeGuestVisitorKey(visitorKey);
  if (!key || typeof window === "undefined") return;
  rememberSharedGuestVisitorKey(key);
  try {
    localStorage.setItem(GUEST_ROTATED_STORAGE_KEY, `${Date.now()}:${key}`);
  } catch {
    // ignore
  }
  try {
    const channel = new BroadcastChannel(GUEST_AUTH_CHANNEL);
    channel.postMessage({ type: "rotated", visitorKey: key });
    channel.close();
  } catch {
    // storage event still covers same-origin tabs
  }
}

/** Subscribe when another tab minted a fresh anonymous visitor after admin delete. */
export function subscribeGuestVisitorRotated(onRotated: (visitorKey: string) => void) {
  if (typeof window === "undefined") return () => undefined;

  function apply(raw: unknown) {
    const key = normalizeGuestVisitorKey(raw);
    if (key) onRotated(key);
  }

  function onStorage(event: StorageEvent) {
    if (event.key === GUEST_VISITOR_STORAGE_KEY && event.newValue) {
      apply(event.newValue);
      return;
    }
    if (event.key === GUEST_ROTATED_STORAGE_KEY && event.newValue) {
      const parts = event.newValue.split(":");
      apply(parts.slice(1).join(":") || parts[0]);
    }
  }

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(GUEST_AUTH_CHANNEL);
    channel.onmessage = (event) => {
      if (event?.data?.type === "rotated") apply(event.data.visitorKey);
    };
  } catch {
    channel = null;
  }

  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
    try {
      channel?.close();
    } catch {
      // ignore
    }
  };
}

/** Tell sibling tabs to stop anonymous heartbeats after Member sign-in. */
export function broadcastGuestConvertedToMember() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GUEST_CONVERTED_STORAGE_KEY, String(Date.now()));
  } catch {
    // ignore
  }
  try {
    const channel = new BroadcastChannel(GUEST_AUTH_CHANNEL);
    channel.postMessage({ type: "converted" });
    channel.close();
  } catch {
    // BroadcastChannel unsupported — storage event still covers same-origin tabs.
  }
}

/** Subscribe to Visitor→Member conversion in other tabs of this browser session. */
export function subscribeGuestConvertedToMember(onConverted: () => void) {
  if (typeof window === "undefined") return () => undefined;

  function onStorage(event: StorageEvent) {
    if (event.key === GUEST_CONVERTED_STORAGE_KEY && event.newValue) onConverted();
  }

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(GUEST_AUTH_CHANNEL);
    channel.onmessage = (event) => {
      if (event?.data?.type === "converted") onConverted();
    };
  } catch {
    channel = null;
  }

  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
    try {
      channel?.close();
    } catch {
      // ignore
    }
  };
}

/**
 * End anonymous Online presence for this browser session after authentication.
 * Idempotent — safe to call from SessionSync and GuestTracker.
 */
export async function endAnonymousGuestPresenceOnAuth() {
  if (typeof window === "undefined") return;
  let clientVisitorKey = "";
  try {
    clientVisitorKey =
      normalizeGuestVisitorKey(localStorage.getItem(GUEST_VISITOR_STORAGE_KEY)) ||
      (await getSharedGuestVisitorKey());
  } catch {
    clientVisitorKey = await getSharedGuestVisitorKey();
  }

  const payload = JSON.stringify({
    endAllPresence: true,
    clientVisitorKey,
    connectionKey: getGuestConnectionKey(),
  });

  try {
    await fetch("/api/analytics/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: payload,
      keepalive: true,
    });
  } catch {
    // Best-effort; Admin poll will catch up if this fails once.
  }

  broadcastGuestConvertedToMember();
}

/** Stable per-tab anonymous connection id (not the httpOnly visitor cookie). */
export function getGuestConnectionKey() {
  if (typeof window === "undefined") return "";
  try {
    let key = sessionStorage.getItem(GUEST_CONNECTION_STORAGE_KEY)?.trim() || "";
    if (!key || key.length > 80 || !/^[A-Za-z0-9_-]+$/.test(key)) {
      key =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().replace(/-/g, "")
          : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(GUEST_CONNECTION_STORAGE_KEY, key);
    }
    return key;
  } catch {
    return "";
  }
}

export function normalizeGuestConnectionKey(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  if (!key || key.length > 80) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(key)) return "";
  return key;
}

/** lastSeenAt value that expires a guest connection after the disconnect grace window. */
export function guestPresenceLastSeenForGraceDisconnect(
  now = Date.now(),
  staleMs = GUEST_PRESENCE_STALE_MS,
  graceMs = GUEST_PRESENCE_DISCONNECT_GRACE_MS,
) {
  return new Date(now - staleMs + graceMs);
}

/** Session-aware Online check for Admin → Visitors. */
export function isGuestOnlineFromPresence(
  input: {
    online?: boolean;
    lastSeenAt?: Date | string | null;
  },
  now = Date.now(),
) {
  if (typeof input.online === "boolean") return input.online;
  if (!input.lastSeenAt) return false;
  const date =
    input.lastSeenAt instanceof Date ? input.lastSeenAt : new Date(input.lastSeenAt);
  if (Number.isNaN(date.getTime())) return false;
  return now - date.getTime() <= GUEST_PRESENCE_STALE_MS;
}

export function formatGuestPresenceLabel(
  input: { online?: boolean; lastSeenAt?: Date | string | null },
  now = Date.now(),
) {
  return isGuestOnlineFromPresence(input, now) ? "Online" : "Offline";
}

/**
 * Client + session helper: skip anonymous guest analytics for signed-in public
 * Members and for NextAuth sessions that carry a staff role.
 *
 * Password / View site / SITE_PRIVATE preview may only have `mesa_admin_session`
 * (no NextAuth staffRole). APIs must also call {@link shouldSkipGuestAnalyticsIngest}
 * with verified `hasVerifiedAdminSession` from `getAdminSession()`.
 */
export function shouldSkipGuestAnalytics(session: {
  email?: string | null;
  staffRole?: unknown;
} | null | undefined) {
  if (session?.staffRole) return true;
  if (!session?.email) return false;
  return true;
}

/** True for signed-in public Members (not staff). Used for endAllPresence auth. */
export function isSignedInPublicMember(session: {
  email?: string | null;
  staffRole?: unknown;
} | null | undefined) {
  return Boolean(session?.email) && !session?.staffRole;
}

/**
 * Authoritative ingest skip for `/api/analytics/guest` and `/api/analytics/events`.
 * Skips when a verified admin session exists OR NextAuth staffRole / Member session
 * would skip via {@link shouldSkipGuestAnalytics}.
 *
 * `hasVerifiedAdminSession` must come from server `getAdminSession()` only —
 * never from client-supplied role or cookie raw values.
 */
export function shouldSkipGuestAnalyticsIngest(input: {
  email?: string | null;
  staffRole?: unknown;
  hasVerifiedAdminSession: boolean;
}) {
  if (input.hasVerifiedAdminSession) return true;
  return shouldSkipGuestAnalytics({
    email: input.email,
    staffRole: input.staffRole,
  });
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
