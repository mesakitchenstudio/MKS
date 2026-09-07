/**
 * Shared cron endpoint auth: Authorization Bearer secrets only.
 * Query-string secrets are rejected (may leak via logs, proxies, observability).
 */
import { timingSafeEqual } from "node:crypto";

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  const size = Math.max(left.length, right.length, 1);
  const paddedLeft = Buffer.alloc(size);
  const paddedRight = Buffer.alloc(size);
  left.copy(paddedLeft);
  right.copy(paddedRight);
  return timingSafeEqual(paddedLeft, paddedRight) && left.length === right.length;
}

function bearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
}

/** Shared daily Vercel crons (YouTube, guest retention, Search Console). */
export function authorizeCronRequest(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): CronAuthResult {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    return { ok: false, status: 503, error: "CRON_SECRET is not configured." };
  }

  const provided = bearerToken(request);
  if (provided == null || !safeEqual(provided, secret)) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  return { ok: true };
}

/**
 * Recipe publish cron — external 10-minute scheduler on Hobby.
 * Accepts RECIPE_PUBLISH_CRON_SECRET (preferred) or CRON_SECRET (manual/compat).
 * Does not authorize other cron routes.
 */
export function authorizeRecipePublishCronRequest(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): CronAuthResult {
  const dedicated = env.RECIPE_PUBLISH_CRON_SECRET?.trim() || "";
  const shared = env.CRON_SECRET?.trim() || "";
  if (!dedicated && !shared) {
    return {
      ok: false,
      status: 503,
      error: "RECIPE_PUBLISH_CRON_SECRET is not configured.",
    };
  }

  const provided = bearerToken(request);
  if (provided == null) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  const accepted =
    (dedicated.length > 0 && safeEqual(provided, dedicated)) ||
    (shared.length > 0 && safeEqual(provided, shared));

  if (!accepted) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  return { ok: true };
}
