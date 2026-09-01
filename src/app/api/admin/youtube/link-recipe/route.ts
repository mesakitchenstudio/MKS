import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { canAccess } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { linkExistingRecipeToYoutubeVideo } from "@/lib/youtube-data/link-recipe-from-video";

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "content")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  let body: { videoId?: string; recipeId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = await linkExistingRecipeToYoutubeVideo({
    videoId: String(body.videoId || ""),
    recipeId: String(body.recipeId || ""),
  });

  if (!result.ok) {
    const status =
      result.code === "video_not_found" || result.code === "recipe_not_found"
        ? 404
        : result.code === "unauthorized"
          ? 403
          : 400;
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        message: result.message,
        conflictingRecipe: result.conflictingRecipe,
      },
      { status },
    );
  }

  revalidatePath("/admin/youtube");
  revalidatePath(`/admin/recipes/${result.recipeId}`);

  return NextResponse.json({
    ok: true,
    recipeId: result.recipeId,
    recipeTitle: result.recipeTitle,
    recipeSlug: result.recipeSlug,
  });
}
