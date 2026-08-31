import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  canManageRecipeReviewReplies,
  getRecipeReviewData,
  submitAdminRecipeReviewReply,
  submitMemberRecipeReviewReply,
  type RecipeReviewViewer,
} from "@/lib/recipe-reviews";
import { getAdminSession } from "@/lib/auth";
import { isBlockedApiWhilePrivate } from "@/lib/site-gate";

type RouteContext = {
  params: Promise<{ slug: string; reviewId: string }>;
};

async function resolveReplyViewer(): Promise<RecipeReviewViewer> {
  const admin = await getAdminSession();
  const session = await auth();
  const canStaffReply =
    Boolean(admin && canManageRecipeReviewReplies(admin.role)) ||
    Boolean(session?.staffRole && canManageRecipeReviewReplies(session.staffRole));

  return {
    canStaffReply,
    email: session?.user?.email ?? admin?.email ?? null,
    userId: session?.user?.id ?? null,
  };
}

/**
 * Continue a review conversation.
 * Allowed: content-role Mesa staff, or the original review author (session-derived).
 * Client-supplied identity fields are ignored.
 */
export async function POST(request: Request, context: RouteContext) {
  if (isBlockedApiWhilePrivate(new URL(request.url).pathname, request.headers.get("cookie"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { slug, reviewId } = await context.params;
  const payload = (await request.json()) as { comment?: string };
  const comment = payload.comment?.trim() || "";

  const admin = await getAdminSession();
  const session = await auth();
  const viewer = await resolveReplyViewer();

  try {
    let recipeSlug: string | null = null;

    if (admin && canManageRecipeReviewReplies(admin.role)) {
      recipeSlug = await submitAdminRecipeReviewReply({
        reviewId,
        recipeSlug: slug,
        body: comment,
        admin: {
          email: admin.email,
          name: admin.name,
          role: admin.role,
        },
      });
    } else if (session?.staffRole && canManageRecipeReviewReplies(session.staffRole)) {
      recipeSlug = await submitAdminRecipeReviewReply({
        reviewId,
        recipeSlug: slug,
        body: comment,
        admin: {
          email: session.user?.email || "",
          name: session.user?.name || "Staff",
          role: session.staffRole,
        },
      });
    } else if (session?.user?.email) {
      recipeSlug = await submitMemberRecipeReviewReply({
        reviewId,
        recipeSlug: slug,
        body: comment,
        member: {
          email: session.user.email,
          name: session.user.name || "Member",
          userId: session.user.id,
          image: session.user.image,
        },
      });
    } else {
      return NextResponse.json(
        { error: "Sign in to continue this conversation." },
        { status: 401 },
      );
    }

    if (!recipeSlug) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }

    const data = await getRecipeReviewData(recipeSlug, viewer);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save your reply.";
    const status = /only reply to your own|unauthorized/i.test(message) ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
