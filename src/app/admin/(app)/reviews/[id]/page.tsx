import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminReviewDetail } from "@/components/admin/AdminReviewDetail";
import {
  AdminFlashStatus,
  REVIEW_REPLIED_PARAMS,
  REVIEW_REPLY_REMOVED_PARAMS,
} from "@/lib/admin-transient-feedback";
import { canAccess } from "@/lib/admin-access";
import { adminFocusRing } from "@/lib/admin-ui";
import { requireAccess } from "@/lib/auth";
import { getReviewForAdmin } from "@/lib/recipe-reviews";

export const dynamic = "force-dynamic";

export default async function AdminReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    replied?: string;
    replyRemoved?: string;
    error?: string;
    reply?: string;
  }>;
}) {
  const admin = await requireAccess("content");
  const canOpenMembers = canAccess(admin.role, "members");
  const { id } = await params;
  const { replied, replyRemoved, error, reply } = await searchParams;
  const review = await getReviewForAdmin(id);
  if (!review) notFound();
  const openReplyComposer = reply === "1";

  return (
    <div>
      <Link
        href="/admin/reviews"
        className={`text-sm font-semibold text-muted transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
      >
        ← Reviews
      </Link>

      <AdminFlashStatus active={Boolean(replied)} clearParams={REVIEW_REPLIED_PARAMS}>
        Reply posted.
      </AdminFlashStatus>
      <AdminFlashStatus
        active={Boolean(replyRemoved)}
        clearParams={REVIEW_REPLY_REMOVED_PARAMS}
      >
        Reply removed.
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

      <div className="mt-5">
        <AdminReviewDetail
          review={review}
          canOpenMembers={canOpenMembers}
          openReplyComposer={openReplyComposer}
        />
      </div>
    </div>
  );
}
