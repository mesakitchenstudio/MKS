import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { runScheduledRecipePublishLifecycle } from "@/lib/recipe-schedule-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Publish due scheduled recipes.
 * Auth: Authorization: Bearer CRON_SECRET only.
 */
export async function GET(request: Request) {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await runScheduledRecipePublishLifecycle();
  return NextResponse.json(
    {
      ok: result.ok,
      scanned: result.scanned,
      published: result.published,
      failedDeterministic: result.failedDeterministic,
      failedTransient: result.failedTransient,
      skipped: result.skipped,
      truncated: result.truncated,
      errors: result.errors,
    },
    { status: result.ok ? 200 : 500 },
  );
}
