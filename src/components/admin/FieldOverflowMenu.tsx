"use client";

import { useEffect, useId, useRef, useState } from "react";
import { adminFocusRing, adminTertiaryButtonClass } from "@/lib/admin-ui";
import {
  isFieldLocked,
  resolveFieldReviewState,
  type FieldReviewState,
} from "@/lib/ai-recipe/field-state";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import type { FieldAiIntent } from "@/lib/ai-recipe/field-ai-registry";

export function FieldOverflowMenu({
  path,
  label,
  aiMeta,
  canRunAi,
  aiLabel,
  onRunAi,
  onLock,
  onUnlock,
  onConfirm,
}: {
  path: string;
  label: string;
  aiMeta?: RecipeAiMeta | null;
  canRunAi?: boolean;
  aiLabel?: string;
  onRunAi?: (intent: FieldAiIntent) => void;
  onLock?: () => void;
  onUnlock?: () => void;
  onConfirm?: () => void;
}) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const reviewState: FieldReviewState = resolveFieldReviewState(path, aiMeta ?? null);
  const locked = isFieldLocked(path, aiMeta ?? null);

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

  const hasActions =
    (canRunAi && onRunAi) || onLock || onUnlock || (onConfirm && reviewState === "unreviewed");

  if (!hasActions && !locked) return null;

  return (
    <div ref={rootRef} className="relative inline-flex items-center gap-1.5">
      {locked ? (
        <span
          className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted"
          title="Field locked — AI will not change this value"
        >
          Locked
        </span>
      ) : null}
      {hasActions ? (
        <>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={`Field actions for ${label}`}
            className={`${adminTertiaryButtonClass} ${adminFocusRing} px-1.5 py-0.5 text-xs leading-none`}
            onClick={() => setOpen((value) => !value)}
          >
            ⋯
          </button>
          {open ? (
            <div
              id={menuId}
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] border border-line bg-paper py-1 shadow-sm"
            >
              {canRunAi && onRunAi && !locked ? (
                <button
                  type="button"
                  role="menuitem"
                  className={`flex w-full px-3 py-2 text-left text-sm font-semibold hover:bg-cream hover:text-terracotta ${adminFocusRing}`}
                  onClick={() => {
                    setOpen(false);
                    onRunAi("generate");
                  }}
                >
                  {aiLabel ?? "✦ Generate"}
                </button>
              ) : null}
              {onConfirm && reviewState === "unreviewed" && !locked ? (
                <button
                  type="button"
                  role="menuitem"
                  className={`flex w-full px-3 py-2 text-left text-sm font-semibold hover:bg-cream hover:text-olive ${adminFocusRing}`}
                  onClick={() => {
                    setOpen(false);
                    onConfirm();
                  }}
                >
                  Confirm field
                </button>
              ) : null}
              {locked && onUnlock ? (
                <button
                  type="button"
                  role="menuitem"
                  className={`flex w-full px-3 py-2 text-left text-sm font-semibold hover:bg-cream hover:text-terracotta ${adminFocusRing}`}
                  onClick={() => {
                    setOpen(false);
                    onUnlock();
                  }}
                >
                  Unlock field
                </button>
              ) : null}
              {!locked && onLock ? (
                <button
                  type="button"
                  role="menuitem"
                  className={`flex w-full px-3 py-2 text-left text-sm font-semibold hover:bg-cream hover:text-terracotta ${adminFocusRing}`}
                  onClick={() => {
                    setOpen(false);
                    onLock();
                  }}
                >
                  Lock field
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
