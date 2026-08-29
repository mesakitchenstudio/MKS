import { AdminReviewsLiveFeed } from "@/components/admin/AdminReviewsLiveFeed";
import { canAccess } from "@/lib/admin-access";
import {
  AdminFlashStatus,
  REVIEW_REMOVED_PARAMS,
  REVIEW_REPLIED_PARAMS,
} from "@/lib/admin-transient-feedback";
import { requireAccess } from "@/lib/auth";
import { listReviewsForAdmin } from "@/lib/recipe-reviews";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    removed?: string;
    replied?: string;
    error?: string;
    page?: string;
  }>;
}) {
  const admin = await requireAccess("content");
  const canOpenMembers = canAccess(admin.role, "members");
  const { removed, replied, error, page: pageParam } = await searchParams;
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
        Moderate member conversations on recipes. Reply from here without opening the public
        recipe page. Removing a review also removes its replies.
      </p>

      <AdminFlashStatus active={Boolean(replied)} clearParams={REVIEW_REPLIED_PARAMS}>
        Reply posted.
      </AdminFlashStatus>
      <AdminFlashStatus active={Boolean(removed)} clearParams={REVIEW_REMOVED_PARAMS}>
        Review removed.
      </AdminFlashStatus>
      {error === "reply" ? (
        <p className="mt-4 text-sm text-terracotta" role="alert">
          Could not post that reply. Check the text and try again.
        </p>
      ) : error ? (
        <p className="mt-4 text-sm text-terracotta" role="alert">
          Could not remove that item. It may already be gone.
        </p>
      ) : null}

      <AdminReviewsLiveFeed
        initialReviews={reviews}
        page={page}
        totalPages={totalPages}
        total={total}
        canOpenMembers={canOpenMembers}
      />
    </div>
  );
}
