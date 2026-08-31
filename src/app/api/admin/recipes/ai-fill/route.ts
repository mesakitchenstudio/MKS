import { NextResponse } from "next/server";
import { canAccess } from "@/lib/admin-access";
import { runTargetedRecipeFill, type TargetedFillMode } from "@/lib/ai-recipe/targeted-fill";
import { checkAiGenerateRateLimit } from "@/lib/ai-recipe/rate-limit";
import { getAdminSession } from "@/lib/auth";
import { connectionMeta } from "@/lib/request-meta";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  let body: {
    typeId?: string;
    youtubeUrl?: string;
    recipeId?: string;
    mode?: TargetedFillMode;
    fields?: string[];
    allowRepopulate?: boolean;
    current?: {
      title?: string;
      slug?: string;
      excerpt?: string;
      categoryIds?: string[];
      values?: Record<string, unknown>;
    };
    aiMeta?: RecipeAiMeta | null;
    fieldIntent?: "generate" | "improve" | "alternative";
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "bad_request" }, { status: 400 });
  }

  const typeId = String(body.typeId || "").trim();
  const mode = body.mode === "fields" ? "fields" : "missing";
  if (!typeId) {
    return NextResponse.json({ error: "typeId is required.", code: "bad_request" }, { status: 400 });
  }
  if (mode === "fields" && !(body.fields && body.fields.length)) {
    return NextResponse.json(
      { error: "fields are required when mode is fields.", code: "bad_request" },
      { status: 400 },
    );
  }

  const fieldIntent =
    body.fieldIntent === "improve" || body.fieldIntent === "alternative"
      ? body.fieldIntent
      : "generate";

  try {
    const result = await runTargetedRecipeFill({
      typeId,
      youtubeUrl: body.youtubeUrl,
      recipeId: body.recipeId,
      mode,
      fields: body.fields,
      allowRepopulate: Boolean(body.allowRepopulate),
      fieldIntent: mode === "fields" ? fieldIntent : undefined,
      current: {
        title: String(body.current?.title ?? ""),
        slug: String(body.current?.slug ?? ""),
        excerpt: String(body.current?.excerpt ?? ""),
        categoryIds: Array.isArray(body.current?.categoryIds)
          ? body.current.categoryIds.map((id) => String(id))
          : [],
        values: body.current?.values && typeof body.current.values === "object" ? body.current.values : {},
      },
      aiMeta: body.aiMeta ?? null,
    });

    if (!result.ok) {
      const status =
        result.code === "invalid_type"
          ? 400
          : result.code === "GEMINI_CONFIGURATION_ERROR" || result.code === "GEMINI_AUTH_FAILED"
            ? 503
            : result.code === "GEMINI_TIMEOUT"
              ? 504
              : result.code === "GEMINI_RATE_LIMIT"
                ? 429
                : 422;
      return NextResponse.json(
        {
          error: result.message,
          code: result.code,
          detail: result.detail,
          latencyMs: result.latencyMs,
        },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      cachedContextUsed: result.cachedContextUsed,
      generationCacheUsed: result.generationCacheUsed,
      model: result.model,
      requestedPaths: result.requestedPaths,
      draft: result.draft,
      confidenceByPath: result.confidenceByPath,
      latencyMs: result.latencyMs,
    });
  } catch (error) {
    console.error("AI recipe fill route failed", {
      message: error instanceof Error ? error.message : String(error),
      adminId: admin.id,
    });
    return NextResponse.json(
      {
        error: "AI could not complete the missing fields. Existing recipe content was not changed.",
        code: "server_error",
      },
      { status: 500 },
    );
  }
}
