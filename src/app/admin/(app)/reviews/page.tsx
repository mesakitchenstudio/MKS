import {
  AdminFlashStatus,
  REVIEW_REMOVED_PARAMS,
} from "@/lib/admin-transient-feedback";
import { AdminReviewsIndex } from "@/components/admin/AdminReviewsIndex";
import { requireAccess } from "@/lib/auth";
import { listReviewsForAdmin } from "@/lib/recipe-reviews";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    removed?: string;
    error?: string;
    page?: string;
  }>;
}) {
  await requireAccess("content");
  const { removed, error, page: pageParam } = await searchParams;
  const requestedPage = Number.parseInt(pageParam || "1", 10);
  const { reviews, page, totalPages, total } = await listReviewsForAdmin({
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
  });

  return (
    <div>
      <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
        Reviews
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Read and respond to member reviews on Mesa recipes.
      </p>

      <AdminFlashStatus active={Boolean(removed)} clearParams={REVIEW_REMOVED_PARAMS}>
        Review removed.
      </AdminFlashStatus>
      {error ? (
        <p className="mt-4 text-sm text-terracotta" role="alert">
          Could not remove that item. It may already be gone.
        </p>
      ) : null}

      <AdminReviewsIndex
        initialReviews={reviews}
        page={page}
        totalPages={totalPages}
        total={total}
      />
    </div>
  );
}
