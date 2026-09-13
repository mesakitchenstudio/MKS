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
}: {
  topicId: string;
  compact?: boolean;
  className?: string;
}) {
  const topic = getAdminDocTopicById(topicId);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const labelledBy = useId();

  if (!topic) return null;

  const buttonClass = compact ? adminCompactSecondaryButtonClass : adminSecondaryButtonClass;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={labelledBy}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`${buttonClass} ${adminFocusRing} ${className}`.trim()}
      >
        Documentation
      </button>
      <AdminDocumentationDrawer
        topic={topic}
        open={open}
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
      />
    </>
  );
}
