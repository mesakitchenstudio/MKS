const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_ADMIN = 8;
const MAX_PER_IP = 20;

type Bucket = { count: number; resetAt: number };

const byAdmin = new Map<string, Bucket>();
const byIp = new Map<string, Bucket>();

function hit(map: Map<string, Bucket>, key: string, max: number) {
  const now = Date.now();
  const current = map.get(key);
  if (!current || now > current.resetAt) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true as const, remaining: max - 1 };
  }
  if (current.count >= max) {
    return { ok: false as const, retryAfterMs: current.resetAt - now };
  }
  current.count += 1;
  return { ok: true as const, remaining: max - current.count };
}

export function checkAiGenerateRateLimit(input: { adminId: string; ip: string }) {
  const admin = hit(byAdmin, input.adminId || "unknown", MAX_PER_ADMIN);
  if (!admin.ok) return admin;
  const ip = hit(byIp, input.ip || "unknown", MAX_PER_IP);
  if (!ip.ok) return ip;
  return { ok: true as const, remaining: Math.min(admin.remaining, ip.remaining) };
}

/** Test helper */
export function resetAiGenerateRateLimitsForTests() {
  byAdmin.clear();
  byIp.clear();
}
