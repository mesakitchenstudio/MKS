"use client";

import { useEffect, useId, useRef, useState } from "react";
import { replyToReviewAction } from "@/app/admin/actions";
import { PendingSubmitButton } from "@/components/admin/PendingSubmitButton";
import { adminFocusRing, adminInputClass, adminPrimaryButtonClass } from "@/lib/admin-ui";

/** Reply + optional sibling actions (e.g. Remove review) for Admin → Reviews. */
export function AdminReviewReplyControls({
  reviewId,
  page,
  authorName,
  recipeTitle,
  unreplied,
  children,
}: {
  reviewId: string;
  page: number;
  authorName: string;
  recipeTitle: string;
  unreplied?: boolean;
  /** Shown beside Reply (typically Remove review). */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const panelId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    textareaRef.current?.focus();
  }, [open]);

  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        <button
          type="button"
          className={`inline-flex min-h-11 items-center text-sm font-semibold transition-colors sm:min-h-9 ${
            unreplied
              ? "text-terracotta hover:text-terracotta-dark"
              : "text-olive hover:text-olive-dark"
          } ${adminFocusRing}`}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`Reply to ${authorName} on ${recipeTitle}`}
          onClick={() => setOpen((value) => !value)}
        >
          Reply
        </button>
        {children}
      </div>

      {open ? (
        <form
          id={panelId}
          action={replyToReviewAction}
          className="w-full min-w-0 space-y-3 border-y border-line/80 bg-cream/30 py-4"
        >
          <input type="hidden" name="reviewId" value={reviewId} />
          <input type="hidden" name="page" value={String(page)} />
          <label htmlFor={labelId} className="grid gap-1.5 text-sm font-semibold text-ink">
            Your reply
            <textarea
              ref={textareaRef}
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
            <PendingSubmitButton pendingLabel="Posting…" className={adminPrimaryButtonClass}>
              Post reply
            </PendingSubmitButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={`inline-flex min-h-11 items-center text-sm font-semibold text-muted hover:text-ink sm:min-h-9 ${adminFocusRing}`}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
