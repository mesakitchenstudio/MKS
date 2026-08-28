import Link from "next/link";
import { RemoveReviewButton } from "@/components/admin/RemoveReviewButton";
import { ReviewRepliesSection } from "@/components/admin/ReviewRepliesSection";
import { canAccess } from "@/lib/admin-access";
import { adminFocusRing } from "@/lib/admin-ui";
import {
  AdminFlashStatus,
  REVIEW_REMOVED_PARAMS,
} from "@/lib/admin-transient-feedback";
import { requireAccess } from "@/lib/auth";
import { formatAdminDate } from "@/lib/datetime";
import { formatReviewRating, listReviewsForAdmin } from "@/lib/recipe-reviews";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string; error?: string; page?: string }>;
}) {
  const admin = await requireAccess("content");
  const canOpenMembers = canAccess(admin.role, "members");
  const { removed, error, page: pageParam } = await searchParams;
  const requestedPage = Number.parseInt(pageParam || "1", 10);
  const { reviews, page, totalPages, total } = await listReviewsForAdmin({
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
  });

  return (
    <div>
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        Community
      </p>
      <h1 className="mt-2 font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
        Reviews
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Moderate member notes on recipes. Removing a review also removes its replies.
      </p>

      <AdminFlashStatus active={Boolean(removed)} clearParams={REVIEW_REMOVED_PARAMS}>
        Review removed.
      </AdminFlashStatus>
      {error ? (
        <p className="mt-4 text-sm text-terracotta" role="alert">
          Could not remove that item. It may already be gone.
        </p>
      ) : null}

      {reviews.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No reviews to moderate.</p>
      ) : (
        <>
          <ul className="mt-8 divide-y divide-line border border-line bg-paper">
            {reviews.map((review) => {
              const ratingLabel = formatReviewRating(review.rating);
              const recipeHref = review.recipeId
                ? `/admin/recipes/${review.recipeId}`
                : `/recipes/${review.recipeSlug}`;
              const memberHref =
                canOpenMembers && review.userId ? `/admin/members/${review.userId}` : null;

              return (
                <li key={review.id} className="p-5 md:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <Link
                          href={recipeHref}
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
                        <p className="mt-1 text-xs text-muted">
                          {formatAdminDate(review.createdAt)}
                        </p>
                      </div>

                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-ink/90">
                        {review.body}
                      </p>

                      <ReviewRepliesSection
                        count={review.replyCount}
                        replies={review.replies.map((reply) => ({
                          id: reply.id,
                          authorName: reply.authorName,
                          body: reply.body,
                          isStaff: reply.isStaff,
                          createdAt: reply.createdAt,
                        }))}
                      />
                    </div>

                    <div className="shrink-0">
                      <RemoveReviewButton
                        id={review.id}
                        authorName={review.authorName}
                        recipeTitle={review.recipeTitle}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 ? (
            <nav
              className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-muted"
              aria-label="Reviews pagination"
            >
              <p>
                Page {page} of {totalPages}
                <span className="text-muted"> · {total} total</span>
              </p>
              <div className="flex items-center gap-4">
                {page > 1 ? (
                  <Link
                    href={page === 2 ? "/admin/reviews" : `/admin/reviews?page=${page - 1}`}
                    className={`font-semibold text-ink hover:text-terracotta ${adminFocusRing}`}
                  >
                    Previous
                  </Link>
                ) : (
                  <span className="font-semibold text-muted/50">Previous</span>
                )}
                {page < totalPages ? (
                  <Link
                    href={`/admin/reviews?page=${page + 1}`}
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
      )}
    </div>
  );
}
