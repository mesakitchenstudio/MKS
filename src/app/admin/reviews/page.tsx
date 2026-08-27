import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteReviewAction, deleteReviewReplyAction } from "@/app/admin/actions";
import { canAccess } from "@/lib/admin-access";
import { adminFocusRing, adminLinkClass } from "@/lib/admin-ui";
import { getAdminSession } from "@/lib/auth";
import { formatLongDate } from "@/lib/datetime";
import { listReviewsForAdmin } from "@/lib/recipe-reviews";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string }>;
}) {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "content")) {
    redirect("/admin/login");
  }

  const { removed } = await searchParams;
  const reviews = await listReviewsForAdmin();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">Community</p>
        <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">Reviews</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Moderate member notes on recipes. Removing a review also removes its replies.
        </p>
      </div>

      {removed ? (
        <p className="rounded-sm border border-line bg-paper px-4 py-3 text-sm text-olive" role="status">
          Removed.
        </p>
      ) : null}

      {reviews.length === 0 ? (
        <p className="text-sm text-muted">No reviews yet.</p>
      ) : (
        <ul className="divide-y divide-line border border-line bg-paper">
          {reviews.map((review) => (
            <li key={review.id} className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-start">
              <div className="min-w-0 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-olive">
                  <Link href={`/recipes/${review.recipeSlug}`} className="hover:text-terracotta">
                    {review.recipeSlug}
                  </Link>
                  <span aria-hidden> · </span>
                  {review.rating}/5
                </p>
                <p className="font-medium text-ink">
                  {review.authorName}{" "}
                  <span className="font-normal text-muted">&lt;{review.authorEmail}&gt;</span>
                </p>
                <p className="text-sm leading-6 text-ink/90">{review.body}</p>
                <p className="text-xs text-muted">{formatLongDate(review.createdAt)}</p>
                {review.replies.length > 0 ? (
                  <ul className="mt-3 space-y-3 border-l border-line pl-4">
                    {review.replies.map((reply) => (
                      <li key={reply.id} className="space-y-1">
                        <p className="text-sm text-ink">
                          <span className="font-medium">{reply.authorName}</span>
                          {reply.isStaff ? (
                            <span className="text-muted"> · staff</span>
                          ) : null}
                        </p>
                        <p className="text-sm leading-6 text-ink/90">{reply.body}</p>
                        <form action={deleteReviewReplyAction}>
                          <input type="hidden" name="id" value={reply.id} />
                          <button
                            type="submit"
                            className={`${adminLinkClass} ${adminFocusRing} text-xs text-terracotta`}
                          >
                            Remove reply
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <form action={deleteReviewAction}>
                <input type="hidden" name="id" value={review.id} />
                <button
                  type="submit"
                  className={`${adminLinkClass} ${adminFocusRing} text-terracotta`}
                >
                  Remove review
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
