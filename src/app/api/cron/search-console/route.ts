import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { syncSearchConsole } from "@/lib/search-console/sync";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await syncSearchConsole();
  return NextResponse.json({
    ok: result.ok,
    skipped: Boolean(result.skipped),
    reason: result.reason || "",
    pageRowsUpserted: result.pageRowsUpserted,
    queryRowsUpserted: result.queryRowsUpserted,
    pageTruncated: result.pageTruncated,
    queryTruncated: result.queryTruncated,
    lastDataDate: result.lastDataDate || null,
    error: result.error || "",
  });
}
