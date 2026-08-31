"use client";

import { adminFocusRing, adminTertiaryButtonClass } from "@/lib/admin-ui";

export function FieldAiActionButton({
  label = "✦ Generate",
  busyLabel = "✦ Generating…",
  busy,
  disabled,
  onClick,
}: {
  label?: string;
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${adminTertiaryButtonClass} ${adminFocusRing} text-xs`}
      disabled={disabled || busy}
      onClick={onClick}
    >
      {busy ? busyLabel : label}
    </button>
  );
}
