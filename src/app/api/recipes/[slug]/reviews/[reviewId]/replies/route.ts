import { NextResponse } from "next/server";
import { canManageRecipeReviewReplies, getRecipeReviewData, submitAdminRecipeReviewReply } from "@/lib/recipe-reviews";
import { getAdminSession } from "@/lib/auth";
import { isBlockedApiWhilePrivate } from "@/lib/site-gate";

type RouteContext = {
  params: Promise<{ slug: string; reviewId: string }>;
};

/**
 * Staff-only reply endpoint. Members and anonymous callers receive 403.
 * Identity is taken from the admin session — client name/email are ignored.
 */
export async function POST(request: Request, context: RouteContext) {
  if (isBlockedApiWhilePrivate(new URL(request.url).pathname)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = await getAdminSession();
  if (!admin || !canManageRecipeReviewReplies(admin.role)) {
    return NextResponse.json(
      { error: "Only Mesa staff can reply to recipe reviews." },
      { status: 403 },
    );
  }

  const { slug, reviewId } = await context.params;
  const body = (await request.json()) as { comment?: string };

  try {
    const recipeSlug = await submitAdminRecipeReviewReply({
      reviewId,
      recipeSlug: slug,
      body: body.comment?.trim() || "",
      admin: {
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    });
    if (!recipeSlug) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }
    const data = await getRecipeReviewData(recipeSlug);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save your reply." },
      { status: 400 },
    );
  }
}
