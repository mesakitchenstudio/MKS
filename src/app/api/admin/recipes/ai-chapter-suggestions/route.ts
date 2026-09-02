import { NextResponse } from "next/server";
import { canAccess } from "@/lib/admin-access";
import { checkAiGenerateRateLimit } from "@/lib/ai-recipe/rate-limit";
import { chapterSuggestionsRequireAiQuota } from "@/lib/ai-recipe/chapter-suggestions/ai-quota";
import {
  resolveChapterSuggestionCapabilityForRecipe,
  runChapterTimestampSuggestions,
} from "@/lib/ai-recipe/chapter-suggestions/run";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { getAdminSession } from "@/lib/auth";
import { connectionMeta } from "@/lib/request-meta";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "content")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    typeId?: string;
    youtubeUrl?: string;
    mode?: "missing" | "all";
    forceRefresh?: boolean;
    titlesOnly?: boolean;
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

  const values =
    body.current?.values && typeof body.current.values === "object" ? body.current.values : {};
  const titlesOnly = body.titlesOnly === true;
  const forceRefresh = body.forceRefresh === true;

  const capabilityResult = await resolveChapterSuggestionCapabilityForRecipe({
    typeId: String(body.typeId ?? ""),
    youtubeUrl: body.youtubeUrl,
    values,
    aiMeta: body.aiMeta ?? null,
  });

  if (!capabilityResult.ok) {
    const status =
      capabilityResult.code === "bad_request" ||
      capabilityResult.code === "invalid_type" ||
      capabilityResult.code === "no_video"
        ? 400
        : 422;
    return NextResponse.json(
      {
        ok: false,
        error: capabilityResult.message,
        code: capabilityResult.code,
      },
      { status },
    );
  }

  // Source-backed YouTube description matching must not consume AI quota.
  if (
    chapterSuggestionsRequireAiQuota({
      capability: capabilityResult.capability,
      titlesOnly,
      forceRefresh,
    })
  ) {
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
  }

  const result = await runChapterTimestampSuggestions({
    typeId: String(body.typeId ?? ""),
    youtubeUrl: body.youtubeUrl,
    values,
    title: body.current?.title,
    aiMeta: body.aiMeta ?? null,
    mode: body.mode === "all" ? "all" : "missing",
    forceRefresh,
    titlesOnly,
  });

  if (!result.ok) {
    const status =
      result.code === "bad_request" ||
      result.code === "invalid_type" ||
      result.code === "no_video"
        ? 400
        : result.code === "video_analysis_unconfigured"
          ? 503
          : 422;
    return NextResponse.json(
      {
        ok: false,
        error: result.message,
        code: result.code,
        stage: result.stage,
        diagnostics: result.diagnostics
          ? {
              videoId: result.diagnostics.videoId,
              typeId: result.diagnostics.typeId,
              cachePresent: result.diagnostics.cachePresent,
              cacheBypassed: result.diagnostics.cacheBypassed,
              cacheChapterCount: result.diagnostics.cacheChapterCount,
              freshGeminiStarted: result.diagnostics.freshGeminiStarted,
              model: result.diagnostics.model,
              latencyMs: result.diagnostics.latencyMs,
              stage: result.diagnostics.stage,
              rawChapterCount: result.diagnostics.rawChapterCount,
              matchedSectionCount: result.diagnostics.matchedSectionCount,
              parseNotes: result.diagnostics.parseNotes,
              geminiErrorCode: result.diagnostics.geminiErrorCode,
            }
          : undefined,
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
    timestampEvidenceAvailable: result.batch.diagnostics?.timestampEvidenceAvailable,
    videoTemporalAnalysisAvailable: result.batch.diagnostics?.videoTemporalAnalysisAvailable,
    capability: result.capability,
  });
}
