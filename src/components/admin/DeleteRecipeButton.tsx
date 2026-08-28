"use client";

import { useEffect, useId, useRef, useState } from "react";
import { deleteRecipeAction } from "@/app/admin/actions";
import { PendingSubmitButton } from "@/components/admin/PendingSubmitButton";
import { adminFocusRing } from "@/lib/admin-ui";

export function DeleteRecipeButton({
  recipeId,
  recipeTitle,
}: {
  recipeId: string;
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
        className={`text-sm font-semibold text-muted transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
        onClick={() => setOpen(true)}
      >
        Delete
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
              Delete recipe?
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              This permanently deletes <span className="font-semibold text-ink">{recipeTitle}</span>.
              The recipe and its admin data will be removed. This cannot be undone.
            </p>
            <form action={deleteRecipeAction} className="mt-6 flex flex-wrap items-center gap-3">
              <input type="hidden" name="id" value={recipeId} />
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setOpen(false)}
                className={`rounded-full border border-line px-5 py-2 text-sm font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
              >
                Cancel
              </button>
              <PendingSubmitButton
                pendingLabel="Deleting…"
                className="rounded-full bg-terracotta px-5 py-2 text-sm font-semibold text-paper hover:bg-terracotta-dark disabled:hover:bg-terracotta"
              >
                Delete recipe
              </PendingSubmitButton>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
