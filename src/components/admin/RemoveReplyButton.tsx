"use client";

import { useEffect, useId, useRef, useState } from "react";
import { deleteReviewReplyAction } from "@/app/admin/actions";
import { PendingSubmitButton } from "@/components/admin/PendingSubmitButton";
import {
  adminDangerButtonClass,
  adminFocusRing,
  adminIconButtonClass,
  adminSecondaryButtonClass,
} from "@/lib/admin-ui";

const menuItemClass = `flex w-full px-3 py-2.5 text-left text-sm font-semibold text-terracotta hover:bg-cream sm:py-2 ${adminFocusRing}`;

/** Remove reply — quiet reply-local overflow + confirm modal. */
export function RemoveReplyButton({ id, authorName }: { id: string; authorName: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const titleId = useId();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!confirmOpen) return;
    cancelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirmOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        aria-label={`More actions for reply by ${authorName}`}
        className={`${adminFocusRing} ${adminIconButtonClass}`}
        onClick={() => setMenuOpen((value) => !value)}
      >
        ⋯
      </button>

      {menuOpen ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] border border-line bg-paper py-1 shadow-sm"
        >
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => {
              setMenuOpen(false);
              setConfirmOpen(true);
            }}
          >
            Remove reply
          </button>
        </div>
      ) : null}

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
          role="presentation"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md border border-line bg-paper p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id={titleId} className="font-serif text-2xl text-ink">
              Remove reply?
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              This permanently removes the reply by {authorName}. This cannot be undone.
            </p>
            <form
              action={deleteReviewReplyAction}
              className="mt-6 flex flex-wrap items-center gap-3"
            >
              <input type="hidden" name="id" value={id} />
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setConfirmOpen(false)}
                className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
              >
                Cancel
              </button>
              <PendingSubmitButton
                pendingLabel="Removing…"
                className={`${adminDangerButtonClass} ${adminFocusRing} min-h-11 border border-terracotta/40 bg-paper px-4 sm:min-h-10`}
              >
                Remove reply
              </PendingSubmitButton>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
