import { NextResponse } from "next/server";
import { canAccess } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { classifyRecipeTypeForYoutubeVideo } from "@/lib/ai-recipe/classify-recipe-type";

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "content")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  let body: { videoId?: string };
  try {
    body = (await request.json()) as { videoId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const videoId = String(body.videoId || "").trim();
  if (!videoId) {
    return NextResponse.json({ error: "videoId is required." }, { status: 400 });
  }

  const result = await classifyRecipeTypeForYoutubeVideo(videoId);
  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      confidence: result.confidence,
      message: result.message,
    });
  }

  return NextResponse.json({
    ok: true,
    recipeTypeId: result.classification.recipeTypeId,
    recipeTypeName: result.classification.recipeTypeName,
    confidence: result.classification.confidence,
    reasoning: result.classification.reasoning,
    model: result.model,
  });
}
