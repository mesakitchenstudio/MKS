import type { RecipeReviewData } from "@/lib/recipe-reviews";

/** Poll open recipe comment threads for remote adds/edits/deletes. */
export const RECIPE_REVIEW_POLL_MS = 4_000;

/**
 * Stable fingerprint of the public comment thread. Used so polls only update
 * React state when something actually changed (avoids focus/scroll churn).
 */
export function recipeReviewThreadSignature(data: RecipeReviewData): string {
  return JSON.stringify({
    average: data.stats.average,
    count: data.stats.count,
    replyableReviewIds: [...(data.replyableReviewIds || [])].sort(),
    reviews: data.reviews.map((review) => ({
      id: review.id,
      authorName: review.authorName,
      rating: review.rating,
      body: review.body,
      createdAt: review.createdAt,
      replies: review.replies.map((reply) => ({
        id: reply.id,
        authorName: reply.authorName,
        authorTitle: reply.authorTitle,
        authorPhotoUrl: reply.authorPhotoUrl,
        body: reply.body,
        isStaff: reply.isStaff,
        createdAt: reply.createdAt,
      })),
    })),
  });
}

/** Fingerprint Admin → Reviews list for poll reconciliation without duplicate churn. */
export function adminReviewsListSignature(
  reviews: Array<{
    id: string;
    body: string;
    rating: number;
    replyCount: number;
    authorName?: string;
    recipeSlug?: string;
    replies: Array<{
      id: string;
      body: string;
      authorName: string;
      isStaff: boolean;
      createdAt: string | Date;
    }>;
  }>,
): string {
  return JSON.stringify(
    reviews.map((review) => ({
      id: review.id,
      recipeSlug: review.recipeSlug || "",
      authorName: review.authorName || "",
      body: review.body,
      rating: review.rating,
      replyCount: review.replyCount,
      replies: review.replies.map((reply) => ({
        id: reply.id,
        body: reply.body,
        authorName: reply.authorName,
        isStaff: reply.isStaff,
        createdAt:
          typeof reply.createdAt === "string"
            ? reply.createdAt
            : reply.createdAt.toISOString(),
      })),
    })),
  );
}

export async function fetchRecipeReviewData(slug: string): Promise<RecipeReviewData> {
  const response = await fetch(`/api/recipes/${encodeURIComponent(slug)}/reviews`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Could not load reviews.");
  }
  return (await response.json()) as RecipeReviewData;
}
