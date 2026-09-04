"use client";

import Link from "next/link";
import {
  adminCompactPrimaryButtonClass,
  adminCompactSecondaryButtonClass,
  adminFocusRing,
} from "@/lib/admin-ui";

export function EditorStickyActionBar({
  visible,
  isDirty,
  saved,
  isPublished,
  publishLabel,
  previewHref,
  onPublish,
}: {
  visible: boolean;
  isDirty: boolean;
  saved: boolean;
  isPublished: boolean;
  publishLabel: string;
  previewHref?: string;
  onPublish: () => void;
}) {
  if (!visible) return null;

  const isUnsaved = isDirty && !saved;
  const documentState = isUnsaved ? "Unsaved" : "Saved";

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line/80 bg-[var(--cream)] px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-6"
      role="region"
      aria-label="Recipe editor actions"
    >
      <div className="mx-auto flex max-w-[77.5rem] flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="min-w-0 text-xs font-semibold text-muted">
          <span className={isUnsaved ? "text-terracotta" : "text-muted"}>{documentState}</span>
          <span className="mx-1.5 text-line" aria-hidden>
            ·
          </span>
          <span>{isPublished ? "Published" : "Draft"}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {previewHref ? (
            <Link
              href={previewHref}
              target="_blank"
              rel="noreferrer"
              className={`${adminCompactSecondaryButtonClass} ${adminFocusRing}`}
            >
              Preview
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onPublish}
            className={`${adminCompactPrimaryButtonClass} ${adminFocusRing}`}
          >
            {publishLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
