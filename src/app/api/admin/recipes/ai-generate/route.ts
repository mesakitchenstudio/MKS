import { NextResponse } from "next/server";
import { canAccess } from "@/lib/admin-access";
import { runAiRecipeGeneration } from "@/lib/ai-recipe/generate";
import { checkAiGenerateRateLimit } from "@/lib/ai-recipe/rate-limit";
import { getAdminSession } from "@/lib/auth";
import { connectionMeta } from "@/lib/request-meta";

export const runtime = "nodejs";
export const maxDuration = 300;

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

  let body: { youtubeUrl?: string; typeId?: string; forceRefresh?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "bad_request" }, { status: 400 });
  }

  const youtubeUrl = String(body.youtubeUrl || "").trim();
  const typeId = String(body.typeId || "").trim();
  if (!youtubeUrl || !typeId) {
    return NextResponse.json(
      { error: "youtubeUrl and typeId are required.", code: "bad_request" },
      { status: 400 },
    );
  }

  try {
    const result = await runAiRecipeGeneration({
      youtubeUrl,
      typeId,
      forceRefresh: Boolean(body.forceRefresh),
    });

    if (!result.ok) {
      const status =
        result.code === "INVALID_YOUTUBE_URL" || result.code === "invalid_type"
          ? 400
          : result.code === "GEMINI_CONFIGURATION_ERROR" || result.code === "GEMINI_AUTH_FAILED"
            ? 503
            : result.code === "GEMINI_TIMEOUT"
              ? 504
              : result.code === "rate_limit" || result.code === "GEMINI_RATE_LIMIT"
              ? 429
              : 422;
      return NextResponse.json(
        {
          error: result.message,
          code: result.code,
          videoAnalysisSucceeded: result.videoAnalysisSucceeded ?? false,
        },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      cached: result.cached,
      model: result.model,
      schemaVersion: result.schemaVersion,
      draft: {
        typeId: result.draft.typeId,
        title: result.draft.title,
        slug: result.draft.slug,
        excerpt: result.draft.excerpt,
        featured: result.draft.featured,
        seasonal: result.draft.seasonal,
        categoryIds: result.draft.categoryIds,
        values: result.draft.values,
      },
      meta: result.meta,
    });
  } catch (error) {
    console.error("AI recipe generate route failed", {
      message: error instanceof Error ? error.message : String(error),
      adminId: admin.id,
    });
    return NextResponse.json(
      {
        error: "Unexpected error while generating the recipe draft.",
        code: "server_error",
      },
      { status: 500 },
    );
  }
}
