"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { AdminReviewReplyControls } from "@/components/admin/AdminReviewReplyControls";
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
  countStaffReviewReplies,
  formatAdminReviewerType,
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

function RecipeNameLink({ review }: { review: LiveReview }) {
  const publicHref = adminReviewPublicAnchorHref({
    recipeSlug: review.recipeSlug,
    recipeStatus: review.recipeStatus,
    reviewId: review.id,
  });
  const titleClass = "break-words font-serif text-base leading-snug text-ink";

  if (publicHref) {
    return (
      <Link
        href={publicHref}
        target="_blank"
        rel="noreferrer"
        className={`${adminFocusRing} ${titleClass} hover:text-terracotta`}
        aria-label={`View ${review.authorName}'s review of ${review.recipeTitle} on the public recipe page`}
      >
        {review.recipeTitle}
        <span className="ml-1 font-sans text-sm font-normal text-muted" aria-hidden>
          ↗
        </span>
        <span className="sr-only"> (opens in a new tab)</span>
      </Link>
    );
  }

  return <span className={titleClass}>{review.recipeTitle}</span>;
}

function ReviewExcerptButton({
  review,
  expanded,
  onToggle,
}: {
  review: LiveReview;
  expanded: boolean;
  onToggle: () => void;
}) {
  const staffReplyCount = countStaffReviewReplies(review.replies);
  const action = staffReplyCount > 0 ? "Add another reply" : "Reply";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`${action} to ${review.authorName} on ${review.recipeTitle}`}
      className={`mt-1 line-clamp-2 w-full min-w-0 text-left text-sm leading-5 text-muted transition-colors hover:text-ink ${adminFocusRing} rounded-sm`}
    >
      {review.body}
    </button>
  );
}

function ReviewIndexRow({
  review,
  page,
  expanded,
  onToggleComposer,
}: {
  review: LiveReview;
  page: number;
  expanded: boolean;
  onToggleComposer: () => void;
}) {
  const staffReplyCount = countStaffReviewReplies(review.replies);
  const reviewerType = formatAdminReviewerType(review.userId);

  return (
    <Fragment>
      <tr className="border-b border-line/80 last:border-b-0">
        <td className="min-w-0 py-3.5 pr-3 align-top">
          <div className="min-w-0">
            <RecipeNameLink review={review} />
            <ReviewExcerptButton
              review={review}
              expanded={expanded}
              onToggle={onToggleComposer}
            />
          </div>
        </td>
        <td className="max-w-[9rem] py-3.5 pr-3 align-top">
          <p className="truncate text-sm font-semibold text-ink">{review.authorName}</p>
        </td>
        <td className="whitespace-nowrap py-3.5 pr-3 align-top text-sm text-muted">
          {reviewerType}
        </td>
        <td className="whitespace-nowrap py-3.5 pr-3 align-top">
          <RatingCell rating={review.rating} />
        </td>
        <td className="py-3.5 pr-3 align-top">
          <ResponseStatus replies={review.replies} />
        </td>
        <td className="whitespace-nowrap py-3.5 align-top text-sm text-muted">
          {formatAdminDate(review.createdAt)}
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-line/80">
          <td colSpan={6} className="px-0 pb-4 pt-0 align-top">
            <AdminReviewReplyControls
              variant="inline"
              open={expanded}
              onDismiss={onToggleComposer}
              reviewId={review.id}
              authorName={review.authorName}
              recipeTitle={review.recipeTitle}
              staffReplyCount={staffReplyCount}
              page={page}
            />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function ReviewIndexMobileCard({
  review,
  page,
  expanded,
  onToggleComposer,
}: {
  review: LiveReview;
  page: number;
  expanded: boolean;
  onToggleComposer: () => void;
}) {
  const staffReplyCount = countStaffReviewReplies(review.replies);
  const reviewerType = formatAdminReviewerType(review.userId);

  return (
    <li className="border-b border-line/80 py-4 last:border-b-0">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <RecipeNameLink review={review} />
        </div>
        <RatingCell rating={review.rating} />
      </div>
      <ReviewExcerptButton
        review={review}
        expanded={expanded}
        onToggle={onToggleComposer}
      />
      <p className="mt-2 text-sm text-ink">
        <span className="font-semibold">{review.authorName}</span>
        <span className="text-muted">
          {" "}
          · {reviewerType} · {formatAdminDate(review.createdAt)}
        </span>
      </p>
      <div className="mt-2">
        <ResponseStatus replies={review.replies} />
      </div>
      {expanded ? (
        <div className="mt-3">
          <AdminReviewReplyControls
            variant="inline"
            open={expanded}
            onDismiss={onToggleComposer}
            reviewId={review.id}
            authorName={review.authorName}
            recipeTitle={review.recipeTitle}
            staffReplyCount={staffReplyCount}
            page={page}
          />
        </div>
      ) : null}
    </li>
  );
}

/** Compact Reviews triage index with live list polling and inline reply. */
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
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const pageRef = useRef(page);
  const sigRef = useRef(listSignature);
  const [trackedPage, setTrackedPage] = useState(page);
  if (page !== trackedPage) {
    setTrackedPage(page);
    setReviews(initialReviews);
    setListMeta({ page, totalPages, total });
    setListSignature(adminReviewsListSignature(initialReviews));
    setExpandedReviewId(null);
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

  function toggleComposer(reviewId: string) {
    setExpandedReviewId((current) => (current === reviewId ? null : reviewId));
  }

  if (!reviews.length) {
    return <p className="mt-10 text-sm text-muted">No reviews yet.</p>;
  }

  return (
    <>
      <div className="mt-10 hidden min-w-0 xl:block">
        <table className="w-full table-fixed border-y border-line/80 text-left">
          <thead>
            <tr className={adminTableHeadClass}>
              <th scope="col" className="w-[34%] py-2.5 pr-3 font-medium">
                Review
              </th>
              <th scope="col" className="w-[14%] py-2.5 pr-3 font-medium">
                Reviewer
              </th>
              <th scope="col" className="w-[10%] py-2.5 pr-3 font-medium">
                Type
              </th>
              <th scope="col" className="w-[10%] py-2.5 pr-3 font-medium">
                Rating
              </th>
              <th scope="col" className="w-[16%] py-2.5 pr-3 font-medium">
                Response
              </th>
              <th scope="col" className="w-[16%] py-2.5 font-medium">
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((review) => (
              <ReviewIndexRow
                key={review.id}
                review={review}
                page={listMeta.page}
                expanded={expandedReviewId === review.id}
                onToggleComposer={() => toggleComposer(review.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-10 divide-y divide-line/80 border-y border-line/80 xl:hidden">
        {reviews.map((review) => (
          <ReviewIndexMobileCard
            key={review.id}
            review={review}
            page={listMeta.page}
            expanded={expandedReviewId === review.id}
            onToggleComposer={() => toggleComposer(review.id)}
          />
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
