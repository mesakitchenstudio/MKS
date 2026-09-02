import { NextResponse } from "next/server";
import { canAccess } from "@/lib/admin-access";
import { resolveChapterSuggestionCapabilityForRecipe } from "@/lib/ai-recipe/chapter-suggestions/run";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { getAdminSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "content")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    typeId?: string;
    youtubeUrl?: string;
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

  const result = await resolveChapterSuggestionCapabilityForRecipe({
    typeId: String(body.typeId ?? ""),
    youtubeUrl: body.youtubeUrl,
    values:
      body.current?.values && typeof body.current.values === "object" ? body.current.values : {},
    aiMeta: body.aiMeta ?? null,
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
    capability: result.capability,
  });
}
