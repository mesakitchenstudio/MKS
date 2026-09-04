"use client";

import { adminFocusRing } from "@/lib/admin-ui";

export function FieldAiActionButton({
  label = "✦ Generate",
  busyLabel = "✦ Generating…",
  busy,
  disabled,
  emphasized = false,
  onClick,
}: {
  label?: string;
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  /** When true (needs human review), keep Improve more visible. */
  emphasized?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${adminFocusRing} rounded-sm px-1 py-0.5 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 ${
        emphasized
          ? "text-muted hover:text-terracotta"
          : "text-muted/45 hover:text-muted focus-visible:text-muted group-focus-within/field:text-muted"
      }`}
      disabled={disabled || busy}
      onClick={onClick}
    >
      {busy ? busyLabel : label}
    </button>
  );
}
