"use client";

import { useEffect, useId, useRef, useState } from "react";
import { deleteTypeAction } from "@/app/admin/actions";
import { adminFocusRing } from "@/lib/admin-ui";

export function DeleteTypeButton({
  id,
  name,
  recipeCount,
}: {
  id: string;
  name: string;
  recipeCount: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (recipeCount > 0) {
    return null;
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <form ref={formRef} action={deleteTypeAction}>
        <input type="hidden" name="id" value={id} />
      </form>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`More actions for ${name}`}
        className={`${adminFocusRing} inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-base leading-none tracking-tight text-muted/70 transition-colors duration-150 motion-reduce:transition-none hover:bg-cream hover:text-ink sm:min-h-8 sm:min-w-8 sm:text-sm`}
        onClick={() => setOpen((value) => !value)}
      >
        ⋯
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] border border-line bg-paper py-1 shadow-sm"
        >
          <button
            type="button"
            role="menuitem"
            className={`flex w-full px-3 py-2.5 text-left text-sm font-semibold text-terracotta hover:bg-cream sm:py-2 ${adminFocusRing}`}
            onClick={() => {
              setOpen(false);
              if (
                window.confirm(
                  `Delete “${name}”?\n\nThis Recipe Type currently has no recipes. Deleting it removes this template and its field configuration. Other Recipe Types are unaffected.\n\nThis cannot be undone.`,
                )
              ) {
                formRef.current?.requestSubmit();
              }
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
