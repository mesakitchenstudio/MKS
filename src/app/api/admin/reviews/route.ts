import { NextResponse } from "next/server";
import { canAccess } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { listReviewsForAdmin } from "@/lib/recipe-reviews";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Lightweight poll endpoint for Admin → Reviews live conversation updates. */
export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "content")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pageParam = new URL(request.url).searchParams.get("page");
  const requestedPage = Number.parseInt(pageParam || "1", 10);
  const result = await listReviewsForAdmin({
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
  });

  return NextResponse.json(
    {
      ...result,
      reviews: result.reviews.map((review) => ({
        ...review,
        createdAt: review.createdAt.toISOString(),
        replies: review.replies.map((reply) => ({
          ...reply,
          createdAt: reply.createdAt.toISOString(),
        })),
      })),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
