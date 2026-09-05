"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { deleteReviewsAction } from "@/app/admin/actions";
import { AdminReviewReplyControls } from "@/components/admin/AdminReviewReplyControls";
import { RemoveReviewButton } from "@/components/admin/RemoveReviewButton";
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
    // Match Recipes index / View site: leave admin in a new tab while SITE_PRIVATE.
    // Plain <a> preserves query+hash for the public review deep link.
    return (
      <a
        href={publicHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`${adminFocusRing} ${titleClass} underline decoration-line/70 underline-offset-[3px] hover:text-terracotta hover:decoration-terracotta`}
        aria-label={`View ${review.authorName}'s review on ${review.recipeTitle} (opens in a new tab)`}
      >
        {review.recipeTitle}
        <span className="ml-1 font-sans text-sm font-normal text-muted no-underline" aria-hidden>
          ↗
        </span>
      </a>
    );
  }

  return <span className={titleClass}>{review.recipeTitle}</span>;
}

function ReviewExcerptControl({
  review,
  expanded,
  onToggle,
  selectionMode,
}: {
  review: LiveReview;
  expanded: boolean;
  onToggle: () => void;
  selectionMode: boolean;
}) {
  if (selectionMode) {
    return (
      <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted">{review.body}</p>
    );
  }

  const staffReplyCount = countStaffReviewReplies(review.replies);
  const action = staffReplyCount > 0 ? "Add another reply" : "Reply";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`${action} to ${review.authorName} on ${review.recipeTitle}`}
      className={`mt-1 line-clamp-2 w-full min-w-0 rounded-sm text-left text-sm leading-5 text-muted transition-colors hover:text-ink ${adminFocusRing}`}
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
  selectionMode,
  selected,
  onToggleSelected,
}: {
  review: LiveReview;
  page: number;
  expanded: boolean;
  onToggleComposer: () => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelected: (checked: boolean) => void;
}) {
  const staffReplyCount = countStaffReviewReplies(review.replies);
  const reviewerType = formatAdminReviewerType(review.userId);
  const colSpan = 7;

  return (
    <Fragment>
      <tr className="border-b border-line/80 last:border-b-0">
        {selectionMode ? (
          <td className="w-10 py-3.5 pr-2 align-top">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={selected}
              onChange={(event) => onToggleSelected(event.target.checked)}
              aria-label={`Select review by ${review.authorName} on ${review.recipeTitle}`}
            />
          </td>
        ) : null}
        <td className="min-w-0 py-3.5 pr-3 align-top">
          <div className="min-w-0">
            <RecipeNameLink review={review} />
            <ReviewExcerptControl
              review={review}
              expanded={expanded}
              onToggle={onToggleComposer}
              selectionMode={selectionMode}
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
        <td className="whitespace-nowrap py-3.5 pr-2 align-top text-sm text-muted">
          {formatAdminDate(review.createdAt)}
        </td>
        <td className="w-11 py-3.5 align-top">
          {!selectionMode ? (
            <RemoveReviewButton
              id={review.id}
              authorName={review.authorName}
              recipeTitle={review.recipeTitle}
              variant="overflow"
            />
          ) : null}
        </td>
      </tr>
      {expanded && !selectionMode ? (
        <tr className="border-b border-line/80">
          <td colSpan={colSpan} className="px-0 pb-4 pt-0 align-top">
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
  selectionMode,
  selected,
  onToggleSelected,
}: {
  review: LiveReview;
  page: number;
  expanded: boolean;
  onToggleComposer: () => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelected: (checked: boolean) => void;
}) {
  const staffReplyCount = countStaffReviewReplies(review.replies);
  const reviewerType = formatAdminReviewerType(review.userId);

  return (
    <li className="border-b border-line/80 py-4 last:border-b-0">
      <div className="flex min-w-0 items-start gap-3">
        {selectionMode ? (
          <input
            type="checkbox"
            className="mt-1.5 h-4 w-4 shrink-0"
            checked={selected}
            onChange={(event) => onToggleSelected(event.target.checked)}
            aria-label={`Select review by ${review.authorName} on ${review.recipeTitle}`}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <RecipeNameLink review={review} />
            </div>
            <div className="flex shrink-0 items-start gap-1">
              <RatingCell rating={review.rating} />
              {!selectionMode ? (
                <RemoveReviewButton
                  id={review.id}
                  authorName={review.authorName}
                  recipeTitle={review.recipeTitle}
                  variant="overflow"
                />
              ) : null}
            </div>
          </div>
          <ReviewExcerptControl
            review={review}
            expanded={expanded}
            onToggle={onToggleComposer}
            selectionMode={selectionMode}
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
          {expanded && !selectionMode ? (
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
        </div>
      </div>
    </li>
  );
}

/** Compact Reviews triage index with live polling, inline reply, and bulk selection. */
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
  const router = useRouter();
  const [reviews, setReviews] = useState(initialReviews);
  const [listMeta, setListMeta] = useState({ page, totalPages, total });
  const [listSignature, setListSignature] = useState(() =>
    adminReviewsListSignature(initialReviews),
  );
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkPending, startBulk] = useTransition();
  const pageRef = useRef(page);
  const sigRef = useRef(listSignature);
  const [trackedPage, setTrackedPage] = useState(page);

  if (page !== trackedPage) {
    setTrackedPage(page);
    setReviews(initialReviews);
    setListMeta({ page, totalPages, total });
    setListSignature(adminReviewsListSignature(initialReviews));
    setExpandedReviewId(null);
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkError(null);
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
        const nextReviews = payload.reviews || [];
        const signature = adminReviewsListSignature(nextReviews);
        if (signature === sigRef.current) return;
        sigRef.current = signature;
        setListSignature(signature);
        setReviews(nextReviews);
        setListMeta({
          page: payload.page,
          totalPages: payload.totalPages,
          total: payload.total,
        });
        const liveIds = new Set(nextReviews.map((review) => review.id));
        setSelectedIds((current) => {
          if (!current.size) return current;
          const next = new Set([...current].filter((id) => liveIds.has(id)));
          return next.size === current.size ? current : next;
        });
        setExpandedReviewId((current) =>
          current && liveIds.has(current) ? current : null,
        );
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

  function setSelectionMode(next: boolean) {
    setSelectMode(next);
    setSelectedIds(new Set());
    setBulkError(null);
    setExpandedReviewId(null);
  }

  function toggleComposer(reviewId: string) {
    if (selectMode) return;
    setExpandedReviewId((current) => (current === reviewId ? null : reviewId));
  }

  function toggleOne(reviewId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(reviewId);
      else next.delete(reviewId);
      return next;
    });
  }

  function togglePage(checked: boolean) {
    setSelectedIds(checked ? new Set(reviews.map((review) => review.id)) : new Set());
  }

  function handleBulkDelete() {
    if (bulkPending || selectedIds.size === 0) return;
    const count = selectedIds.size;
    const noun = count === 1 ? "review" : "reviews";
    if (
      !window.confirm(
        `Remove ${count} selected ${noun}? ${
          count === 1 ? "Its replies" : "Their replies"
        } will also be removed. This cannot be undone.`,
      )
    ) {
      return;
    }

    const ids = [...selectedIds];
    startBulk(async () => {
      setBulkError(null);
      const result = await deleteReviewsAction(ids);
      if (!result.ok) {
        setBulkError("Could not remove the selected reviews. Try again.");
        return;
      }
      setSelectMode(false);
      setSelectedIds(new Set());
      setExpandedReviewId(null);
      router.push(`/admin/reviews?bulkRemoved=${result.deletedCount}`);
      router.refresh();
    });
  }

  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    reviews.length > 0 && reviews.every((review) => selectedIds.has(review.id));

  if (!reviews.length) {
    return <p className="mt-10 text-sm text-muted">No reviews yet.</p>;
  }

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {!selectMode ? (
          <button
            type="button"
            className={`inline-flex min-h-11 items-center text-sm font-semibold text-ink transition-colors hover:text-terracotta sm:min-h-9 ${adminFocusRing}`}
            onClick={() => setSelectionMode(true)}
            aria-pressed={false}
          >
            Select reviews
          </button>
        ) : (
          <button
            type="button"
            className={`inline-flex min-h-11 items-center text-sm font-semibold text-muted transition-colors hover:text-ink sm:min-h-9 ${adminFocusRing}`}
            onClick={() => setSelectionMode(false)}
            aria-pressed={true}
          >
            Cancel selection
          </button>
        )}
      </div>

      {selectMode ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" role="status">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-ink sm:min-h-9">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(event) => togglePage(event.target.checked)}
              aria-label="Select page"
            />
            <span className="font-semibold">Select page</span>
          </label>
          {selectedCount > 0 ? (
            <>
              <span className="text-muted">{selectedCount} selected</span>
              <button
                type="button"
                disabled={bulkPending}
                onClick={handleBulkDelete}
                className={`inline-flex min-h-11 items-center font-semibold text-terracotta transition-colors hover:text-terracotta-dark disabled:opacity-60 sm:min-h-9 ${adminFocusRing}`}
                aria-label={`Delete ${selectedCount} selected review${selectedCount === 1 ? "" : "s"}`}
              >
                {bulkPending ? "Deleting…" : "Delete selected"}
              </button>
            </>
          ) : (
            <span className="text-muted">Select reviews on this page</span>
          )}
          {bulkError ? <p className="w-full text-sm text-terracotta">{bulkError}</p> : null}
        </div>
      ) : null}

      <div className="mt-6 hidden min-w-0 xl:block">
        <table className="w-full table-fixed border-y border-line/80 text-left">
          <thead>
            <tr className={adminTableHeadClass}>
              {selectMode ? (
                <th scope="col" className="w-10 py-2.5 pr-2 font-medium">
                  <span className="sr-only">Select</span>
                </th>
              ) : null}
              <th scope="col" className="w-[30%] py-2.5 pr-3 font-medium">
                Review
              </th>
              <th scope="col" className="w-[13%] py-2.5 pr-3 font-medium">
                Reviewer
              </th>
              <th scope="col" className="w-[9%] py-2.5 pr-3 font-medium">
                Type
              </th>
              <th scope="col" className="w-[9%] py-2.5 pr-3 font-medium">
                Rating
              </th>
              <th scope="col" className="w-[14%] py-2.5 pr-3 font-medium">
                Response
              </th>
              <th scope="col" className="w-[14%] py-2.5 pr-2 font-medium">
                Date
              </th>
              <th scope="col" className="w-11 py-2.5 font-medium">
                <span className="sr-only">Actions</span>
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
                selectionMode={selectMode}
                selected={selectedIds.has(review.id)}
                onToggleSelected={(checked) => toggleOne(review.id, checked)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-6 divide-y divide-line/80 border-y border-line/80 xl:hidden">
        {reviews.map((review) => (
          <ReviewIndexMobileCard
            key={review.id}
            review={review}
            page={listMeta.page}
            expanded={expandedReviewId === review.id}
            onToggleComposer={() => toggleComposer(review.id)}
            selectionMode={selectMode}
            selected={selectedIds.has(review.id)}
            onToggleSelected={(checked) => toggleOne(review.id, checked)}
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
