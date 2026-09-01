import { NextResponse } from "next/server";
import { canAccess } from "@/lib/admin-access";
import { checkAiGenerateRateLimit } from "@/lib/ai-recipe/rate-limit";
import { runChapterTimestampSuggestions } from "@/lib/ai-recipe/chapter-suggestions/run";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { getAdminSession } from "@/lib/auth";
import { connectionMeta } from "@/lib/request-meta";

export const runtime = "nodejs";
export const maxDuration = 30;

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
        error: "Too many AI requests. Please wait before trying again.",
        code: "rate_limit",
        retryAfterMs: limited.retryAfterMs,
      },
      { status: 429 },
    );
  }

  let body: {
    typeId?: string;
    youtubeUrl?: string;
    mode?: "missing" | "all";
    current?: {
      title?: string;
      values?: Record<string, unknown>;
    };
    aiMeta?: RecipeAiMeta | null;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "bad_request" }, { status: 400 });
  }

  const result = await runChapterTimestampSuggestions({
    typeId: String(body.typeId ?? ""),
    youtubeUrl: body.youtubeUrl,
    values: body.current?.values && typeof body.current.values === "object" ? body.current.values : {},
    title: body.current?.title,
    aiMeta: body.aiMeta ?? null,
    mode: body.mode === "all" ? "all" : "missing",
  });

  if (!result.ok) {
    const status =
      result.code === "bad_request" || result.code === "invalid_type" || result.code === "no_video"
        ? 400
        : 422;
    return NextResponse.json(
      {
        ok: false,
        error: result.message,
        code: result.code,
      },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    requestId: result.batch.requestId,
    generatedAt: result.batch.generatedAt,
    snapshotFingerprint: result.batch.instructionSnapshotFingerprint,
    mode: result.batch.mode,
    suggestions: result.batch.suggestions,
    diagnostics: result.batch.diagnostics,
  });
}
