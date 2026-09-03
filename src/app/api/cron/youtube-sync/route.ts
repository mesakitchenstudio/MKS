import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { syncYoutubeChannel } from "@/lib/youtube-data/sync";

/**
 * Auth: Authorization: Bearer CRON_SECRET only (no query-string secret).
 */
export async function GET(request: Request) {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await syncYoutubeChannel({ forceSnapshot: false });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
