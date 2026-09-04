"use client";

import { useEffect, useId, useRef, useState } from "react";
import { deleteReviewAction } from "@/app/admin/actions";
import { PendingSubmitButton } from "@/components/admin/PendingSubmitButton";
import { adminFocusRing } from "@/lib/admin-ui";

export function RemoveReviewButton({
  id,
  authorName,
  recipeTitle,
}: {
  id: string;
  authorName: string;
  recipeTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`inline-flex min-h-11 items-center text-sm font-semibold text-muted transition-colors hover:text-terracotta sm:min-h-9 ${adminFocusRing}`}
        aria-label={`Remove review by ${authorName} on ${recipeTitle}`}
        onClick={() => setOpen(true)}
      >
        Remove review
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md border border-line bg-paper p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id={titleId} className="font-serif text-2xl text-ink">
              Remove review?
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              This permanently removes the review by {authorName} on {recipeTitle}, including any
              replies. This cannot be undone.
            </p>
            <form action={deleteReviewAction} className="mt-6 flex flex-wrap items-center gap-3">
              <input type="hidden" name="id" value={id} />
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setOpen(false)}
                className={`rounded-full border border-line px-5 py-2 text-sm font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
              >
                Cancel
              </button>
              <PendingSubmitButton
                pendingLabel="Removing…"
                className="rounded-full bg-terracotta px-5 py-2 text-sm font-semibold text-paper hover:bg-terracotta-dark disabled:hover:bg-terracotta"
              >
                Remove review
              </PendingSubmitButton>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
