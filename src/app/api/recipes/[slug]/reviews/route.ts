import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRecipeReviewData, submitRecipeReview } from "@/lib/recipe-reviews";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const data = await getRecipeReviewData(slug);
  return NextResponse.json(data);
}

export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const session = await auth();
  const body = (await request.json()) as {
    authorName?: string;
    authorEmail?: string;
    rating?: number;
    comment?: string;
  };

  try {
    const data = await submitRecipeReview({
      recipeSlug: slug,
      authorName: body.authorName?.trim() || session?.user?.name || "",
      authorEmail: body.authorEmail?.trim() || session?.user?.email || "",
      rating: Number(body.rating),
      body: body.comment?.trim() || "",
      userId: null,
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save your review." },
      { status: 400 },
    );
  }
}
