import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageRecipeReviewReplies, getRecipeReviewData, submitRecipeReview } from "@/lib/recipe-reviews";
import { getAdminSession } from "@/lib/auth";
import { isBlockedApiWhilePrivate } from "@/lib/site-gate";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

async function resolveViewer() {
  const admin = await getAdminSession();
  const session = await auth();
  const canStaffReply =
    Boolean(admin && canManageRecipeReviewReplies(admin.role)) ||
    Boolean(session?.staffRole && canManageRecipeReviewReplies(session.staffRole));
  return {
    canStaffReply,
    email: session?.user?.email ?? null,
    userId: session?.user?.id ?? null,
  };
}

export async function GET(request: Request, context: RouteContext) {
  if (isBlockedApiWhilePrivate(new URL(request.url).pathname, request.headers.get("cookie"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { slug } = await context.params;
  const data = await getRecipeReviewData(slug, await resolveViewer());
  return NextResponse.json(data);
}

export async function POST(request: Request, context: RouteContext) {
  if (isBlockedApiWhilePrivate(new URL(request.url).pathname, request.headers.get("cookie"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { slug } = await context.params;
  const [session, admin] = await Promise.all([auth(), getAdminSession()]);
  const body = (await request.json()) as {
    authorName?: string;
    authorEmail?: string;
    rating?: number;
    comment?: string;
  };

  // Prefer verified session identity: member NextAuth, then Team Access admin.
  const authorName =
    session?.user?.name?.trim() ||
    admin?.name?.trim() ||
    body.authorName?.trim() ||
    "";
  const authorEmail =
    session?.user?.email?.trim() ||
    admin?.email?.trim() ||
    body.authorEmail?.trim() ||
    "";

  try {
    const data = await submitRecipeReview({
      recipeSlug: slug,
      authorName,
      authorEmail,
      rating: Number(body.rating),
      body: body.comment?.trim() || "",
      userId: session?.user?.id ?? null,
    });
    // Re-fetch with viewer context so replyable ids are accurate after submit.
    const withViewer = await getRecipeReviewData(slug, await resolveViewer());
    return NextResponse.json({
      ...data,
      replyableReviewIds: withViewer.replyableReviewIds,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save your review." },
      { status: 400 },
    );
  }
}
