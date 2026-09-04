"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { AdminReviewReplyControls } from "@/components/admin/AdminReviewReplyControls";
import { RemoveReviewButton } from "@/components/admin/RemoveReviewButton";
import { ReviewRepliesSection } from "@/components/admin/ReviewRepliesSection";
import { adminFocusRing, adminTertiaryButtonClass } from "@/lib/admin-ui";
import { formatAdminDate } from "@/lib/datetime";
import {
  adminReviewsListSignature,
  RECIPE_REVIEW_POLL_MS,
} from "@/lib/recipe-reviews-client";
import {
  adminReviewRecipeHref,
  countStaffReviewReplies,
  formatReviewRating,
  formatReviewRatingAccessible,
  type AdminReviewListItem,
} from "@/lib/recipe-reviews";

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

function NeedsResponseIndicator() {
  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-olive">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-olive" aria-hidden />
      Needs response
    </p>
  );
}

function ReviewArticle({
  review,
  page,
  canOpenMembers,
}: {
  review: LiveReview;
  page: number;
  canOpenMembers: boolean;
}) {
  const titleId = useId();
  const ratingLabel = formatReviewRating(review.rating);
  const ratingAccessible = formatReviewRatingAccessible(review.rating);
  const recipeLink = adminReviewRecipeHref({
    recipeId: review.recipeId,
    recipeSlug: review.recipeSlug,
    recipeStatus: review.recipeStatus,
  });
  const memberHref =
    canOpenMembers && review.userId ? `/admin/members/${review.userId}` : null;
  const staffReplyCount = countStaffReviewReplies(review.replies);
  const needsResponse = staffReplyCount === 0;

  return (
    <article aria-labelledby={titleId} className="py-7 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          {recipeLink ? (
            <Link
              id={titleId}
              href={recipeLink.href}
              target={recipeLink.external ? "_blank" : undefined}
              rel={recipeLink.external ? "noreferrer" : undefined}
              className={`min-w-0 break-words font-serif text-xl leading-snug text-ink hover:text-terracotta ${adminFocusRing}`}
            >
              {review.recipeTitle}
              {recipeLink.external ? (
                <span className="ml-1 text-sm font-sans font-normal text-muted" aria-hidden>
                  ↗
                </span>
              ) : null}
              {recipeLink.external ? (
                <span className="sr-only"> (opens in a new tab)</span>
              ) : null}
            </Link>
          ) : (
            <p
              id={titleId}
              className="min-w-0 break-words font-serif text-xl leading-snug text-ink"
            >
              {review.recipeTitle}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="text-sm tabular-nums text-muted">
            <span aria-hidden>★ {ratingLabel}</span>
            <span className="sr-only">{ratingAccessible}</span>
          </p>
          {needsResponse ? <NeedsResponseIndicator /> : null}
          <RemoveReviewButton
            id={review.id}
            authorName={review.authorName}
            recipeTitle={review.recipeTitle}
          />
        </div>
      </div>

      <p className="mt-2.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm leading-5">
        {memberHref ? (
          <Link
            href={memberHref}
            className={`font-semibold text-ink hover:text-terracotta ${adminFocusRing}`}
          >
            {review.authorName}
          </Link>
        ) : (
          <span className="font-semibold text-ink">{review.authorName}</span>
        )}
        <span className="text-muted" aria-hidden>
          ·
        </span>
        <span className="text-muted">{formatAdminDate(review.createdAt)}</span>
        {review.authorEmail ? (
          <>
            <span className="text-muted/50" aria-hidden>
              ·
            </span>
            <span className="break-all text-xs text-muted/75">{review.authorEmail}</span>
          </>
        ) : null}
      </p>

      <p className="mt-4 whitespace-pre-wrap break-words text-base leading-7 text-ink">
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

      <AdminReviewReplyControls
        reviewId={review.id}
        page={page}
        authorName={review.authorName}
        recipeTitle={review.recipeTitle}
        staffReplyCount={staffReplyCount}
      />
    </article>
  );
}

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
  const [listMeta, setListMeta] = useState({ page, totalPages, total });
  const [listSignature, setListSignature] = useState(() =>
    adminReviewsListSignature(initialReviews),
  );
  const pageRef = useRef(page);
  const sigRef = useRef(listSignature);
  const [trackedPage, setTrackedPage] = useState(page);
  if (page !== trackedPage) {
    setTrackedPage(page);
    setReviews(initialReviews);
    setListMeta({ page, totalPages, total });
    setListSignature(adminReviewsListSignature(initialReviews));
  }

  useEffect(() => {
    pageRef.current = page;
    sigRef.current = listSignature;
  }, [page, listSignature]);

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
        const response = await fetch(`/api/admin/reviews?page=${pageRef.current}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          reviews: LiveReview[];
          page: number;
          totalPages: number;
          total: number;
        };
        if (cancelled) return;
        const signature = adminReviewsListSignature(payload.reviews || []);
        if (signature === sigRef.current) return;
        sigRef.current = signature;
        setListSignature(signature);
        setReviews(payload.reviews || []);
        setListMeta({
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
  }, [page]);

  if (!reviews.length) {
    return <p className="mt-10 text-sm text-muted">No reviews yet.</p>;
  }

  return (
    <>
      <ul className="mt-10 divide-y divide-line/80 border-y border-line/80">
        {reviews.map((review) => (
          <li key={review.id} className="min-w-0">
            <ReviewArticle
              review={review}
              page={listMeta.page}
              canOpenMembers={canOpenMembers}
            />
          </li>
        ))}
      </ul>

      {listMeta.totalPages > 1 ? (
        <nav
          className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-muted"
          aria-label="Reviews pagination"
        >
          <p>
            Page {listMeta.page} of {listMeta.totalPages}
            <span className="text-muted"> · {listMeta.total} total</span>
          </p>
          <div className="flex items-center gap-4">
            {listMeta.page > 1 ? (
              <Link
                href={
                  listMeta.page === 2
                    ? "/admin/reviews"
                    : `/admin/reviews?page=${listMeta.page - 1}`
                }
                className={`${adminTertiaryButtonClass} ${adminFocusRing} text-ink hover:text-terracotta`}
              >
                Previous
              </Link>
            ) : (
              <span className="font-semibold text-muted/50">Previous</span>
            )}
            {listMeta.page < listMeta.totalPages ? (
              <Link
                href={`/admin/reviews?page=${listMeta.page + 1}`}
                className={`${adminTertiaryButtonClass} ${adminFocusRing} text-ink hover:text-terracotta`}
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
