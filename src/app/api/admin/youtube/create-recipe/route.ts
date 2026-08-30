import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { canAccess } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { RecipeTypeConfidence } from "@/lib/ai-recipe/classify-recipe-type";
import {
  classifyRecipeTypeForCreate,
  createAndPopulateRecipeFromYoutubeVideo,
} from "@/lib/youtube-data/create-recipe-from-video";

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "content")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  let body: {
    videoId?: string;
    step?: "classify" | "create";
    typeId?: string;
    typeSource?: "ai" | "manual";
    typeConfidence?: RecipeTypeConfidence;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const videoId = String(body.videoId || "").trim();
  if (!videoId) {
    return NextResponse.json({ error: "videoId is required." }, { status: 400 });
  }

  const step = body.step === "create" ? "create" : "classify";

  if (step === "classify") {
    const result = await classifyRecipeTypeForCreate(videoId);
    if (!result.ok && result.code === "already_linked" && result.existingRecipe) {
      return NextResponse.json({
        ok: true,
        alreadyLinked: true,
        recipeId: result.existingRecipe.id,
        recipeTitle: result.existingRecipe.title,
        recipeSlug: result.existingRecipe.slug,
      });
    }
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, message: result.message },
        { status: result.code === "video_not_found" ? 404 : 400 },
      );
    }

    if (result.confidence === "HIGH") {
      return NextResponse.json({
        ok: true,
        confidence: "HIGH",
        recipeTypeId: result.recipeTypeId,
        recipeTypeName: result.recipeTypeName,
        reasoning: result.reasoning,
        needsTypeConfirmation: false,
      });
    }

    return NextResponse.json({
      ok: true,
      confidence: result.confidence,
      recipeTypeId: result.recipeTypeId ?? null,
      recipeTypeName: result.recipeTypeName ?? null,
      reasoning: result.reasoning ?? null,
      message: result.message,
      needsTypeConfirmation: true,
    });
  }

  const typeId = String(body.typeId || "").trim();
  const typeSource = body.typeSource === "ai" ? "ai" : "manual";
  const typeConfidenceRaw = String(body.typeConfidence || "LOW").toUpperCase();
  const typeConfidence: RecipeTypeConfidence =
    typeConfidenceRaw === "HIGH" || typeConfidenceRaw === "MEDIUM" || typeConfidenceRaw === "LOW"
      ? typeConfidenceRaw
      : "LOW";

  const result = await createAndPopulateRecipeFromYoutubeVideo({
    videoId,
    typeId,
    typeSource,
    typeConfidence,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message },
      { status: result.code === "unauthorized" ? 403 : 400 },
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/youtube");
  revalidatePath(`/admin/recipes/${result.recipeId}`);

  return NextResponse.json({
    ok: true,
    recipeId: result.recipeId,
    recipeTitle: result.recipeTitle,
    recipeSlug: result.recipeSlug,
    typeId: result.typeId,
    typeName: result.typeName,
    alreadyExisted: result.alreadyExisted,
    analysisOk: result.analysisOk,
    analysisMessage: result.analysisMessage,
  });
}

/** List active recipe types for confirmation UI. */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "content")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  const db = getDb();
  const recipeTypes = await db.recipeType.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return NextResponse.json({ recipeTypes });
}
