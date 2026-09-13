"use client";

import { useId, useRef, useState } from "react";
import {
  adminCompactSecondaryButtonClass,
  adminFocusRing,
  adminSecondaryButtonClass,
} from "@/lib/admin-ui";
import { getAdminDocTopicById } from "@/lib/admin-documentation";
import { AdminDocumentationDrawer } from "@/components/admin/AdminDocumentationDrawer";

export function AdminDocumentationButton({
  topicId,
  compact = false,
  className = "",
  initialSectionId,
  quiet = false,
  label = "Documentation",
  allowDocumentationCenterNavigation = true,
}: {
  topicId: string;
  compact?: boolean;
  className?: string;
  /** Open the drawer scrolled to this section id when present. */
  initialSectionId?: string;
  /** Quiet section-help affordance (e.g. “?” next to a Recipe Editor section). */
  quiet?: boolean;
  label?: string;
  /**
   * When false, hide “Open Documentation Center” (real navigation).
   * Use on dirty editors without leave-page guards (Recipe Editor).
   */
  allowDocumentationCenterNavigation?: boolean;
}) {
  const topic = getAdminDocTopicById(topicId);
  const [open, setOpen] = useState(false);
  const [sectionId, setSectionId] = useState<string | undefined>(initialSectionId);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const labelledBy = useId();

  if (!topic) return null;

  const buttonClass = quiet
    ? `inline-flex h-6 w-6 items-center justify-center rounded-sm text-xs font-semibold text-muted hover:bg-cream hover:text-ink`
    : compact
      ? adminCompactSecondaryButtonClass
      : adminSecondaryButtonClass;

  const ariaLabel = quiet
    ? `Documentation: ${initialSectionId ? `${topic.title} — ${initialSectionId}` : topic.title}`
    : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={labelledBy}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={quiet ? "Documentation" : undefined}
        onClick={() => {
          setSectionId(initialSectionId);
          setOpen(true);
        }}
        className={`${buttonClass} ${adminFocusRing} ${className}`.trim()}
      >
        {quiet ? "?" : label}
      </button>
      {open ? (
        <AdminDocumentationDrawer
          key={`${topic.id}:${sectionId ?? ""}`}
          topic={topic}
          open={open}
          onClose={() => setOpen(false)}
          returnFocusRef={triggerRef}
          initialSectionId={sectionId}
          allowDocumentationCenterNavigation={allowDocumentationCenterNavigation}
        />
      ) : null}
    </>
  );
}
