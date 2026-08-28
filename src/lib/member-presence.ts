export const MEMBER_ONLINE_WITHIN_MS = 3 * 60 * 1000;

export function isMemberOnline(lastSeenAt: Date | string | null | undefined, now = Date.now()) {
  if (!lastSeenAt) return false;
  const date = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  if (Number.isNaN(date.getTime())) return false;
  return now - date.getTime() <= MEMBER_ONLINE_WITHIN_MS;
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
  if (input.presenceLastSeenAt != null) return isMemberOnline(input.presenceLastSeenAt, now);
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
