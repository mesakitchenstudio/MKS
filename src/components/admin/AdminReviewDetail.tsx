import Link from "next/link";
import { AdminReviewReplyControls } from "@/components/admin/AdminReviewReplyControls";
import { RemoveReviewButton } from "@/components/admin/RemoveReviewButton";
import { ReviewRepliesSection } from "@/components/admin/ReviewRepliesSection";
import { adminFocusRing } from "@/lib/admin-ui";
import { formatAdminDate } from "@/lib/datetime";
import {
  adminReviewRecipeHref,
  countStaffReviewReplies,
  formatReviewRating,
  formatReviewRatingAccessible,
  type AdminReviewListItem,
} from "@/lib/recipe-reviews";

function NeedsResponseIndicator() {
  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-olive">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-olive" aria-hidden />
      Needs response
    </p>
  );
}

/** Full review conversation for Admin → Reviews detail. */
export function AdminReviewDetail({
  review,
  canOpenMembers,
}: {
  review: AdminReviewListItem;
  canOpenMembers: boolean;
}) {
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
    <article>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <h1 className="min-w-0 break-words font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
          {review.recipeTitle}
        </h1>
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="text-sm tabular-nums text-muted">
            <span aria-hidden>★ {ratingLabel}</span>
            <span className="sr-only">{ratingAccessible}</span>
          </p>
          {needsResponse ? <NeedsResponseIndicator /> : null}
        </div>
      </div>

      {recipeLink ? (
        <p className="mt-2">
          <Link
            href={recipeLink.href}
            target={recipeLink.external ? "_blank" : undefined}
            rel={recipeLink.external ? "noreferrer" : undefined}
            className={`text-sm font-semibold text-muted hover:text-terracotta ${adminFocusRing}`}
          >
            View recipe
            {recipeLink.external ? <span aria-hidden> ↗</span> : null}
            {recipeLink.external ? (
              <span className="sr-only"> (opens in a new tab)</span>
            ) : null}
          </Link>
        </p>
      ) : null}

      <div className="mt-5 min-w-0">
        <p className="text-sm leading-5 text-ink">
          {memberHref ? (
            <Link
              href={memberHref}
              className={`font-semibold hover:text-terracotta ${adminFocusRing}`}
            >
              {review.authorName}
            </Link>
          ) : (
            <span className="font-semibold">{review.authorName}</span>
          )}
          <span className="text-muted"> · {formatAdminDate(review.createdAt)}</span>
        </p>
        {review.authorEmail ? (
          <p className="mt-0.5 break-all text-xs leading-4 text-muted/75">
            {review.authorEmail}
          </p>
        ) : null}
      </div>

      <p className="mt-8 whitespace-pre-wrap break-words text-base leading-7 text-ink">
        {review.body}
      </p>

      <section className="mt-10">
        {review.replyCount > 0 || review.replies.length > 0 ? (
          <>
            <h2 className="font-serif text-xl leading-snug text-ink">Replies</h2>
            <ReviewRepliesSection
              reviewId={review.id}
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
          </>
        ) : null}

        <AdminReviewReplyControls
          reviewId={review.id}
          authorName={review.authorName}
          recipeTitle={review.recipeTitle}
          staffReplyCount={staffReplyCount}
        />
      </section>

      <section className="mt-12 border-t border-line/80 pt-6" aria-labelledby="review-actions-heading">
        <h2 id="review-actions-heading" className="text-sm font-semibold text-ink">
          Review actions
        </h2>
        <div className="mt-3">
          <RemoveReviewButton
            id={review.id}
            authorName={review.authorName}
            recipeTitle={review.recipeTitle}
            variant="text"
          />
        </div>
      </section>
    </article>
  );
}
