/** Guest Visitors “online now” window (unchanged). */
export const MEMBER_ONLINE_WITHIN_MS = 3 * 60 * 1000;

/** How often signed-in members ping while Mesa is open. */
export const MEMBER_PRESENCE_HEARTBEAT_MS = 12_000;

/** Presence session is Online while lastSeenAt is within this window. */
export const MEMBER_PRESENCE_STALE_MS = 40_000;

/**
 * After pagehide/sendBeacon disconnect, keep the session Online briefly so
 * refresh / SPA restore does not flicker Offline.
 */
export const MEMBER_PRESENCE_DISCONNECT_GRACE_MS = 5_000;

/** Skip presence DB writes when the same session was touched this recently. */
export const MEMBER_PRESENCE_WRITE_THROTTLE_MS = 10_000;

/** Admin → Members lightweight presence poll interval. */
export const MEMBER_ADMIN_PRESENCE_POLL_MS = 3_000;

export function isMemberOnline(lastSeenAt: Date | string | null | undefined, now = Date.now()) {
  if (!lastSeenAt) return false;
  const date = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  if (Number.isNaN(date.getTime())) return false;
  return now - date.getTime() <= MEMBER_ONLINE_WITHIN_MS;
}

/** Session-aware Online check used by Admin → Members. */
export function isMemberPresenceSessionLive(
  lastSeenAt: Date | string | null | undefined,
  now = Date.now(),
  staleMs = MEMBER_PRESENCE_STALE_MS,
) {
  if (!lastSeenAt) return false;
  const date = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  if (Number.isNaN(date.getTime())) return false;
  return now - date.getTime() <= staleMs;
}

/** Online when any live presence session exists, else fall back to lastSeenAt. */
export function isMemberOnlineFromPresence(
  input: {
    online?: boolean;
    presenceLastSeenAt?: Date | string | null;
    lastSeenAt?: Date | string | null;
  },
  now = Date.now(),
) {
  if (typeof input.online === "boolean") return input.online;
  if (input.presenceLastSeenAt != null) {
    return isMemberPresenceSessionLive(input.presenceLastSeenAt, now);
  }
  return isMemberOnline(input.lastSeenAt, now);
}

export function formatPresenceLabel(lastSeenAt: Date | string | null | undefined, now = Date.now()) {
  return isMemberOnline(lastSeenAt, now) ? "Online" : "Offline";
}

export function formatSignInMethod(method?: string | null) {
  if (!method) return "—";
  if (method === "google") return "Google";
  if (method === "email") return "Email";
  return method.charAt(0).toUpperCase() + method.slice(1);
}

export function normalizePresenceSessionKey(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  if (!key || key.length > 80) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(key)) return "";
  return key;
}

/** lastSeenAt value that expires a presence row after the disconnect grace window. */
export function presenceLastSeenForGraceDisconnect(
  now = Date.now(),
  staleMs = MEMBER_PRESENCE_STALE_MS,
  graceMs = MEMBER_PRESENCE_DISCONNECT_GRACE_MS,
) {
  return new Date(now - staleMs + graceMs);
}
