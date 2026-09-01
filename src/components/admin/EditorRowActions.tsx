"use client";

import { useEffect, useId, useRef, useState } from "react";
import { adminFocusRing, adminTertiaryButtonClass } from "@/lib/admin-ui";

export function EditorRowActions({
  itemLabel,
  onMoveUp,
  onMoveDown,
  onRemove,
  onDuplicate,
  upDisabled,
  downDisabled,
  showRemove = true,
  showReorder = true,
}: {
  itemLabel: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
  onDuplicate?: () => void;
  upDisabled?: boolean;
  downDisabled?: boolean;
  showRemove?: boolean;
  showReorder?: boolean;
}) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
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

  const canReorder = showReorder && onMoveUp && onMoveDown && !(upDisabled && downDisabled);
  const hasMenu = canReorder || (showRemove && onRemove) || onDuplicate;
  if (!hasMenu) return null;

  return (
    <div ref={rootRef} className="relative shrink-0 self-start">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Actions for ${itemLabel}`}
        className={`${adminTertiaryButtonClass} ${adminFocusRing} px-2 py-1 text-sm leading-none`}
        onClick={() => setOpen((value) => !value)}
      >
        ⋯
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[10rem] border border-line bg-paper py-1 shadow-sm"
        >
          {canReorder ? (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={upDisabled}
                className={`flex w-full px-3 py-2 text-left text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 hover:bg-cream hover:text-terracotta ${adminFocusRing}`}
                onClick={() => {
                  setOpen(false);
                  onMoveUp();
                }}
              >
                Move up
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={downDisabled}
                className={`flex w-full px-3 py-2 text-left text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 hover:bg-cream hover:text-terracotta ${adminFocusRing}`}
                onClick={() => {
                  setOpen(false);
                  onMoveDown();
                }}
              >
                Move down
              </button>
            </>
          ) : null}
          {onDuplicate ? (
            <button
              type="button"
              role="menuitem"
              className={`flex w-full px-3 py-2 text-left text-sm font-semibold hover:bg-cream hover:text-terracotta ${adminFocusRing}`}
              onClick={() => {
                setOpen(false);
                onDuplicate();
              }}
            >
              Duplicate
            </button>
          ) : null}
          {showRemove && onRemove ? (
            <button
              type="button"
              role="menuitem"
              className={`flex w-full px-3 py-2 text-left text-sm font-semibold text-terracotta hover:bg-terracotta/5 ${adminFocusRing}`}
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Visual drag affordance (reorder via overflow menu — no DnD library). */
export function EditorDragHandle({ label }: { label: string }) {
  return (
    <span
      className="inline-flex shrink-0 cursor-grab select-none px-1 text-muted/70"
      aria-hidden
      title={`Reorder ${label}`}
    >
      ☰
    </span>
  );
}
