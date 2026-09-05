"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  adminFocusRing,
  adminTableHeadClass,
  adminTertiaryButtonClass,
} from "@/lib/admin-ui";
import { formatAdminDate } from "@/lib/datetime";
import {
  adminReviewsListSignature,
  RECIPE_REVIEW_POLL_MS,
} from "@/lib/recipe-reviews-client";
import {
  adminReviewPublicAnchorHref,
  adminReviewReplyWorkflowHref,
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
    <span className="inline-flex items-center gap-1.5 text-xs text-olive">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-olive" aria-hidden />
      Needs response
    </span>
  );
}

function ResponseStatus({ replies }: { replies: { isStaff: boolean }[] }) {
  if (countStaffReviewReplies(replies) === 0) {
    return <NeedsResponseIndicator />;
  }
  return <span className="text-xs text-muted">Replied</span>;
}

function RatingCell({ rating }: { rating: number }) {
  return (
    <p className="text-sm tabular-nums text-muted">
      <span aria-hidden>★ {formatReviewRating(rating)}</span>
      <span className="sr-only">{formatReviewRatingAccessible(rating)}</span>
    </p>
  );
}

function ReviewTitleCell({ review }: { review: LiveReview }) {
  const publicHref = adminReviewPublicAnchorHref({
    recipeSlug: review.recipeSlug,
    recipeStatus: review.recipeStatus,
    reviewId: review.id,
  });
  const titleClass =
    "block break-words font-serif text-base leading-snug text-ink xl:text-base";
  const preview = (
    <span className="mt-1 line-clamp-2 block text-sm leading-5 text-muted">{review.body}</span>
  );

  if (publicHref) {
    return (
      <Link
        href={publicHref}
        target="_blank"
        rel="noreferrer"
        className={`block min-w-0 ${adminFocusRing}`}
        aria-label={`View ${review.authorName}'s review of ${review.recipeTitle} on the public recipe page`}
      >
        <span className={`${titleClass} hover:text-terracotta`}>
          {review.recipeTitle}
          <span className="ml-1 font-sans text-sm font-normal text-muted" aria-hidden>
            ↗
          </span>
        </span>
        <span className="sr-only"> (opens in a new tab)</span>
        {preview}
      </Link>
    );
  }

  return (
    <div className="min-w-0">
      <span className={titleClass}>{review.recipeTitle}</span>
      {preview}
    </div>
  );
}

function ResponseCell({ review }: { review: LiveReview }) {
  const href = adminReviewReplyWorkflowHref(review.id);
  const needs = countStaffReviewReplies(review.replies) === 0;
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center ${adminFocusRing} hover:opacity-90 sm:min-h-0`}
      aria-label={
        needs
          ? `Reply to ${review.authorName}'s review of ${review.recipeTitle}`
          : `Add another reply to ${review.authorName}'s review of ${review.recipeTitle}`
      }
    >
      <ResponseStatus replies={review.replies} />
    </Link>
  );
}

function ReviewIndexRow({ review }: { review: LiveReview }) {
  return (
    <tr className="border-b border-line/80 last:border-b-0">
      <td className="min-w-0 py-3.5 pr-4 align-top">
        <ReviewTitleCell review={review} />
      </td>
      <td className="max-w-[11rem] py-3.5 pr-4 align-top">
        <p className="truncate text-sm font-semibold text-ink">{review.authorName}</p>
      </td>
      <td className="whitespace-nowrap py-3.5 pr-4 align-top">
        <RatingCell rating={review.rating} />
      </td>
      <td className="py-3.5 pr-4 align-top">
        <ResponseCell review={review} />
      </td>
      <td className="whitespace-nowrap py-3.5 align-top text-sm text-muted">
        {formatAdminDate(review.createdAt)}
      </td>
    </tr>
  );
}

function ReviewIndexMobileCard({ review }: { review: LiveReview }) {
  const publicHref = adminReviewPublicAnchorHref({
    recipeSlug: review.recipeSlug,
    recipeStatus: review.recipeStatus,
    reviewId: review.id,
  });
  const replyHref = adminReviewReplyWorkflowHref(review.id);
  const needs = countStaffReviewReplies(review.replies) === 0;

  return (
    <li className="border-b border-line/80 py-4 last:border-b-0">
      <div className="flex min-w-0 items-start justify-between gap-3">
        {publicHref ? (
          <Link
            href={publicHref}
            target="_blank"
            rel="noreferrer"
            className={`min-w-0 flex-1 ${adminFocusRing}`}
            aria-label={`View ${review.authorName}'s review of ${review.recipeTitle} on the public recipe page`}
          >
            <span className="block break-words font-serif text-lg leading-snug text-ink hover:text-terracotta">
              {review.recipeTitle}
              <span className="ml-1 font-sans text-sm font-normal text-muted" aria-hidden>
                ↗
              </span>
            </span>
            <span className="sr-only"> (opens in a new tab)</span>
          </Link>
        ) : (
          <span className="min-w-0 flex-1 break-words font-serif text-lg leading-snug text-ink">
            {review.recipeTitle}
          </span>
        )}
        <RatingCell rating={review.rating} />
      </div>
      <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted">{review.body}</p>
      <p className="mt-2 text-sm text-ink">
        <span className="font-semibold">{review.authorName}</span>
        <span className="text-muted"> · {formatAdminDate(review.createdAt)}</span>
      </p>
      <div className="mt-2">
        <Link
          href={replyHref}
          className={`inline-flex min-h-11 items-center ${adminFocusRing} hover:opacity-90`}
          aria-label={
            needs
              ? `Reply to ${review.authorName}'s review of ${review.recipeTitle}`
              : `Add another reply to ${review.authorName}'s review of ${review.recipeTitle}`
          }
        >
          <ResponseStatus replies={review.replies} />
        </Link>
      </div>
    </li>
  );
}

/** Compact Reviews triage index with live list polling. */
export function AdminReviewsIndex({
  initialReviews,
  page,
  totalPages,
  total,
}: {
  initialReviews: LiveReview[];
  page: number;
  totalPages: number;
  total: number;
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
      <div className="mt-10 hidden min-w-0 xl:block">
        <table className="w-full table-fixed border-y border-line/80 text-left">
          <thead>
            <tr className={adminTableHeadClass}>
              <th scope="col" className="w-[42%] py-2.5 pr-4 font-medium">
                Review
              </th>
              <th scope="col" className="w-[18%] py-2.5 pr-4 font-medium">
                Reviewer
              </th>
              <th scope="col" className="w-[12%] py-2.5 pr-4 font-medium">
                Rating
              </th>
              <th scope="col" className="w-[16%] py-2.5 pr-4 font-medium">
                Response
              </th>
              <th scope="col" className="w-[12%] py-2.5 font-medium">
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((review) => (
              <ReviewIndexRow key={review.id} review={review} />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-10 divide-y divide-line/80 border-y border-line/80 xl:hidden">
        {reviews.map((review) => (
          <ReviewIndexMobileCard key={review.id} review={review} />
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
