"use client";

import { useId, useState } from "react";
import { replyToReviewAction } from "@/app/admin/actions";
import { PendingSubmitButton } from "@/components/admin/PendingSubmitButton";
import { adminFocusRing, adminInputClass, adminPrimaryButtonClass } from "@/lib/admin-ui";

/** Reply + optional sibling actions (e.g. Remove review) for Admin → Reviews. */
export function AdminReviewReplyControls({
  reviewId,
  page,
  children,
}: {
  reviewId: string;
  page: number;
  /** Shown beside Reply (typically Remove review). */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const labelId = useId();

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {!open ? (
          <button
            type="button"
            className={`text-sm font-semibold text-olive transition-colors hover:text-olive-dark ${adminFocusRing}`}
            onClick={() => setOpen(true)}
          >
            Reply
          </button>
        ) : null}
        {children}
      </div>

      {open ? (
        <form
          action={replyToReviewAction}
          className="w-full min-w-0 space-y-3 border border-line bg-cream/40 p-4"
        >
          <input type="hidden" name="reviewId" value={reviewId} />
          <input type="hidden" name="page" value={String(page)} />
          <label htmlFor={labelId} className="grid gap-1.5 text-sm font-semibold text-ink">
            Your reply
            <textarea
              id={labelId}
              name="body"
              required
              minLength={3}
              maxLength={5000}
              rows={4}
              placeholder="Write a reply…"
              className={`${adminInputClass} h-auto min-h-[6rem] w-full max-w-full resize-y py-2.5 leading-6`}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <PendingSubmitButton
              pendingLabel="Posting…"
              className={adminPrimaryButtonClass}
            >
              Post reply
            </PendingSubmitButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={`text-sm font-semibold text-muted hover:text-ink ${adminFocusRing}`}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
