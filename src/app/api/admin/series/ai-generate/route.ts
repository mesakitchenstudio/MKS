import { NextResponse } from "next/server";
import { canAccess } from "@/lib/admin-access";
import { checkAiGenerateRateLimit } from "@/lib/ai-recipe/rate-limit";
import { getAdminSession } from "@/lib/auth";
import { connectionMeta } from "@/lib/request-meta";
import { generateSeriesEditorialDraft } from "@/lib/series-ai/generate";
import type { SeriesAiMergeMode } from "@/lib/series-ai/types";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "content")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = connectionMeta(request.headers).ip;
  const limited = checkAiGenerateRateLimit({ adminId: admin.id, ip });
  if (!limited.ok) {
    return NextResponse.json(
      {
        error: "Too many AI generation requests. Please wait before trying again.",
        code: "rate_limit",
        retryAfterMs: limited.retryAfterMs,
      },
      { status: 429 },
    );
  }

  let body: { seriesId?: string; mode?: SeriesAiMergeMode };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "bad_request" }, { status: 400 });
  }

  const seriesId = String(body.seriesId || "").trim();
  const mode: SeriesAiMergeMode = body.mode === "replace_ai" ? "replace_ai" : "fill_empty";
  if (!seriesId) {
    return NextResponse.json({ error: "seriesId is required.", code: "bad_request" }, { status: 400 });
  }

  try {
    const result = await generateSeriesEditorialDraft({ seriesId, mode });
    if (!result.ok) {
      const status =
        result.code === "GEMINI_CONFIGURATION_ERROR" || result.code === "GEMINI_AUTH_FAILED"
          ? 503
          : result.code === "not_found"
            ? 404
            : 422;
      return NextResponse.json({ error: result.message, code: result.code }, { status });
    }

    revalidatePath("/admin/series");
    revalidatePath(`/admin/series/${seriesId}`);
    revalidatePath("/series");

    return NextResponse.json({
      ok: true,
      model: result.model,
      draftStatus: result.draftStatus,
      appliedPaths: result.appliedPaths,
      heroSource: result.heroSource,
      heroLabel: result.heroLabel,
    });
  } catch (error) {
    console.error("Series AI generate failed", {
      message: error instanceof Error ? error.message : String(error),
      adminId: admin.id,
      seriesId,
    });
    return NextResponse.json(
      { error: "Unexpected error while generating the Series editorial draft.", code: "server_error" },
      { status: 500 },
    );
  }
}
