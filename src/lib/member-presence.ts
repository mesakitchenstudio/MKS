export const MEMBER_ONLINE_WITHIN_MS = 3 * 60 * 1000;

export function isMemberOnline(lastSeenAt: Date | string | null | undefined, now = Date.now()) {
  if (!lastSeenAt) return false;
  const date = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  if (Number.isNaN(date.getTime())) return false;
  return now - date.getTime() <= MEMBER_ONLINE_WITHIN_MS;
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
