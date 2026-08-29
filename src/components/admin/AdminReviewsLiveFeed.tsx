"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AdminReviewReplyControls } from "@/components/admin/AdminReviewReplyControls";
import { RemoveReviewButton } from "@/components/admin/RemoveReviewButton";
import { ReviewRepliesSection } from "@/components/admin/ReviewRepliesSection";
import { adminFocusRing } from "@/lib/admin-ui";
import { formatAdminDate } from "@/lib/datetime";
import {
  adminReviewsListSignature,
  RECIPE_REVIEW_POLL_MS,
} from "@/lib/recipe-reviews-client";
import { formatReviewRating, type AdminReviewListItem } from "@/lib/recipe-reviews";

type LiveReview = Omit<AdminReviewListItem, "createdAt" | "replies"> & {
  createdAt: string | Date;
  replies: Array<{
    id: string;
    authorName: string;
    authorTitle: string;
    authorPhotoUrl: string;
    body: string;
    isStaff: boolean;
    createdAt: string | Date;
  }>;
};

export function AdminReviewsLiveFeed({
  initialReviews,
  page,
  totalPages,
  total,
  canOpenMembers,
}: {
  initialReviews: LiveReview[];
  page: number;
  totalPages: number;
  total: number;
  canOpenMembers: boolean;
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [meta, setMeta] = useState({ page, totalPages, total });
  const sigRef = useRef(adminReviewsListSignature(initialReviews));

  useEffect(() => {
    setReviews(initialReviews);
    setMeta({ page, totalPages, total });
    sigRef.current = adminReviewsListSignature(initialReviews);
  }, [initialReviews, page, totalPages, total]);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let inFlight = false;

    async function poll() {
      if (cancelled || inFlight) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      inFlight = true;
      try {
        const response = await fetch(`/api/admin/reviews?page=${meta.page}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          reviews: LiveReview[];
          page: number;
          totalPages: number;
          total: number;
        };
        if (cancelled) return;
        const signature = adminReviewsListSignature(payload.reviews);
        if (signature === sigRef.current) return;
        sigRef.current = signature;
        setReviews(payload.reviews);
        setMeta({
          page: payload.page,
          totalPages: payload.totalPages,
          total: payload.total,
        });
      } catch {
        // Keep current list; retry next interval.
      } finally {
        inFlight = false;
      }
    }

    void poll();
    timer = window.setInterval(() => void poll(), RECIPE_REVIEW_POLL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") void poll();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [meta.page]);

  if (!reviews.length) {
    return <p className="mt-8 text-sm text-muted">No reviews to moderate.</p>;
  }

  return (
    <>
      <ul className="mt-8 divide-y divide-line border border-line bg-paper">
        {reviews.map((review) => {
          const ratingLabel = formatReviewRating(review.rating);
          const publicRecipeHref = `/recipes/${encodeURIComponent(review.recipeSlug)}`;
          const memberHref =
            canOpenMembers && review.userId ? `/admin/members/${review.userId}` : null;

          return (
            <li key={review.id} className="p-5 md:p-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link
                    href={publicRecipeHref}
                    className={`min-w-0 break-words font-serif text-xl text-ink hover:text-terracotta ${adminFocusRing}`}
                  >
                    {review.recipeTitle}
                  </Link>
                  <span className="shrink-0 text-sm text-muted">{ratingLabel}</span>
                </div>

                <div className="mt-3 min-w-0">
                  {memberHref ? (
                    <Link
                      href={memberHref}
                      className={`font-semibold text-ink hover:text-terracotta ${adminFocusRing}`}
                    >
                      {review.authorName}
                    </Link>
                  ) : (
                    <p className="font-semibold text-ink">{review.authorName}</p>
                  )}
                  {review.authorEmail ? (
                    <p className="mt-0.5 break-all text-xs text-muted">{review.authorEmail}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted">{formatAdminDate(review.createdAt)}</p>
                </div>

                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-ink/90">
                  {review.body}
                </p>

                <ReviewRepliesSection
                  count={review.replyCount}
                  replies={review.replies.map((reply) => ({
                    id: reply.id,
                    authorName: reply.authorName,
                    authorTitle: reply.authorTitle,
                    authorPhotoUrl: reply.authorPhotoUrl,
                    body: reply.body,
                    isStaff: reply.isStaff,
                    createdAt: reply.createdAt,
                  }))}
                />

                <AdminReviewReplyControls reviewId={review.id} page={meta.page}>
                  <RemoveReviewButton
                    id={review.id}
                    authorName={review.authorName}
                    recipeTitle={review.recipeTitle}
                  />
                </AdminReviewReplyControls>
              </div>
            </li>
          );
        })}
      </ul>

      {meta.totalPages > 1 ? (
        <nav
          className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-muted"
          aria-label="Reviews pagination"
        >
          <p>
            Page {meta.page} of {meta.totalPages}
            <span className="text-muted"> · {meta.total} total</span>
          </p>
          <div className="flex items-center gap-4">
            {meta.page > 1 ? (
              <Link
                href={
                  meta.page === 2 ? "/admin/reviews" : `/admin/reviews?page=${meta.page - 1}`
                }
                className={`font-semibold text-ink hover:text-terracotta ${adminFocusRing}`}
              >
                Previous
              </Link>
            ) : (
              <span className="font-semibold text-muted/50">Previous</span>
            )}
            {meta.page < meta.totalPages ? (
              <Link
                href={`/admin/reviews?page=${meta.page + 1}`}
                className={`font-semibold text-ink hover:text-terracotta ${adminFocusRing}`}
              >
                Next
              </Link>
            ) : (
              <span className="font-semibold text-muted/50">Next</span>
            )}
          </div>
        </nav>
      ) : null}
    </>
  );
}
