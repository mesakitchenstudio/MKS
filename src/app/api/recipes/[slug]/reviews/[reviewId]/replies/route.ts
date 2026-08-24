import { NextResponse } from "next/server";
import { submitRecipeReviewReply } from "@/lib/recipe-reviews";

type RouteContext = {
  params: Promise<{ slug: string; reviewId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { slug, reviewId } = await context.params;
  const body = (await request.json()) as {
    authorName?: string;
    authorEmail?: string;
    comment?: string;
  };

  try {
    const data = await submitRecipeReviewReply({
      recipeSlug: slug,
      reviewId,
      authorName: body.authorName?.trim() || "",
      authorEmail: body.authorEmail?.trim() || "",
      body: body.comment?.trim() || "",
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save your reply." },
      { status: 400 },
    );
  }
}
