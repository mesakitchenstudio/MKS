/**
 * Shared cron endpoint auth: Authorization Bearer CRON_SECRET only.
 * Query-string secrets are rejected (may leak via logs, proxies, observability).
 */

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

export function authorizeCronRequest(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): CronAuthResult {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    return { ok: false, status: 503, error: "CRON_SECRET is not configured." };
  }

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  const provided = auth.slice("Bearer ".length);
  if (provided !== secret) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  return { ok: true };
}
