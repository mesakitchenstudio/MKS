const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

export function isAdminLoginBlocked(ip: string) {
  const current = attempts.get(ip || "unknown");
  if (!current) return false;
  if (Date.now() > current.resetAt) {
    attempts.delete(ip || "unknown");
    return false;
  }
  return current.count >= MAX_ATTEMPTS;
}

export function recordAdminLoginFailure(ip: string) {
  const key = ip || "unknown";
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || now > current.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  current.count += 1;
}

export function clearAdminLoginFailures(ip: string) {
  attempts.delete(ip || "unknown");
}
