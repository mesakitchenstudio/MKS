"use client";

import { useEffect, useId, useRef, useState } from "react";
import { replyToReviewAction } from "@/app/admin/actions";
import { PendingSubmitButton } from "@/components/admin/PendingSubmitButton";
import {
  adminFocusRing,
  adminInputClass,
  adminPrimaryButtonClass,
  adminTertiaryButtonClass,
} from "@/lib/admin-ui";

/** Reply composer for Admin → Reviews (detail trigger or index inline panel). */
export function AdminReviewReplyControls({
  reviewId,
  authorName,
  recipeTitle,
  staffReplyCount = 0,
  initialOpen = false,
  page = 1,
  variant = "detail",
  open: openProp,
  onDismiss,
}: {
  reviewId: string;
  authorName: string;
  recipeTitle: string;
  /** Staff Mesa replies only — drives Reply vs Add another reply. */
  staffReplyCount?: number;
  /** Open composer on mount (detail deep-link). */
  initialOpen?: boolean;
  /** Index page number preserved after posting from the ledger. */
  page?: number;
  /**
   * `detail` — Reply / Add another reply trigger + composer.
   * `inline` — composer only; parent owns open state (index excerpt expand).
   */
  variant?: "detail" | "inline";
  open?: boolean;
  onDismiss?: () => void;
}) {
  const [internalOpen, setInternalOpen] = useState(initialOpen);
  const open = variant === "inline" ? Boolean(openProp) : internalOpen;
  const labelId = useId();
  const panelId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const replyLabel = staffReplyCount > 0 ? "Add another reply" : "Reply";

  useEffect(() => {
    if (!open) return;
    textareaRef.current?.focus();
  }, [open]);

  function closeComposer() {
    if (variant === "inline") {
      onDismiss?.();
      return;
    }
    setInternalOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  const form = open ? (
    <form
      id={panelId}
      action={replyToReviewAction}
      className="w-full min-w-0 space-y-3 border-y border-line/80 bg-cream/30 py-4"
    >
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="page" value={String(page)} />
      {variant === "inline" ? <input type="hidden" name="returnTo" value="index" /> : null}
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
        <PendingSubmitButton
          pendingLabel="Posting…"
          className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
        >
          Post reply
        </PendingSubmitButton>
        <button
          type="button"
          onClick={closeComposer}
          className={`${adminTertiaryButtonClass} ${adminFocusRing}`}
        >
          Cancel
        </button>
      </div>
    </form>
  ) : null;

  if (variant === "inline") {
    return open ? <div className="space-y-3">{form}</div> : null;
  }

  return (
    <div className="mt-6 space-y-3">
      <div>
        <button
          ref={triggerRef}
          type="button"
          className={`${adminTertiaryButtonClass} ${adminFocusRing} text-olive hover:text-olive-dark`}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${replyLabel} to ${authorName} on ${recipeTitle}`}
          onClick={() => setInternalOpen((value) => !value)}
        >
          {replyLabel}
        </button>
      </div>
      {form}
    </div>
  );
}
