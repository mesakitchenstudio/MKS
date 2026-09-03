import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { runGuestRetentionLifecycle } from "@/lib/guest-retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily guest retention lifecycle.
 * Auth: Authorization: Bearer CRON_SECRET only (no query-string secret).
 */
export async function GET(request: Request) {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await runGuestRetentionLifecycle();
  // Privacy-minimal operational payload — counts only, no IPs / UUIDs / UAs.
  return NextResponse.json(
    {
      ok: result.ok,
      presenceDeleted: result.presenceDeleted,
      visitorIpsScrubbed: result.visitorIpsScrubbed,
      pageViewIpsScrubbed: result.pageViewIpsScrubbed,
      inactiveVisitorsDeleted: result.inactiveVisitorsDeleted,
      truncated: result.truncated,
      config: result.config,
      errors: result.errors,
    },
    { status: result.ok ? 200 : 500 },
  );
}
