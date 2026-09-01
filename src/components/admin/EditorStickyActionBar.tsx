"use client";

import Link from "next/link";
import { adminFocusRing, adminPrimaryButtonClass, adminSecondaryButtonClass } from "@/lib/admin-ui";

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

  const documentState = isDirty && !saved ? "Unsaved changes" : saved ? "Saved" : "Saved";

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-[var(--cream)]/95 px-4 py-2 backdrop-blur-sm md:px-6"
      role="region"
      aria-label="Recipe editor actions"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted">
          {documentState}
          <span className="mx-2 text-line">·</span>
          {isPublished ? "Published" : "Draft"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {previewHref ? (
            <Link
              href={previewHref}
              target="_blank"
              rel="noreferrer"
              className={`${adminSecondaryButtonClass} ${adminFocusRing} h-9 px-4 text-sm`}
            >
              Preview
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onPublish}
            className={`${adminPrimaryButtonClass} ${adminFocusRing} h-9 px-4 text-sm`}
          >
            {publishLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
