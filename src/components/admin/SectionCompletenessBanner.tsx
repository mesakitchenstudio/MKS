"use client";

import { adminFocusRing, adminTertiaryButtonClass } from "@/lib/admin-ui";
import type { MissingRequiredField } from "@/lib/recipe-editor-completeness";

export function SectionCompletenessBanner({
  missing,
  onJumpToField,
  onGenerateField,
  canGenerateField,
}: {
  missing: MissingRequiredField[];
  onJumpToField: (key: string) => void;
  onGenerateField?: (path: string, key: string) => void;
  canGenerateField?: (key: string) => boolean;
}) {
  if (!missing.length) return null;

  return (
    <div
      className="mb-5 rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-3"
      role="status"
    >
      <p className="text-sm font-semibold text-ink">
        {missing.length} required field{missing.length === 1 ? "" : "s"} missing
      </p>
      <ul className="mt-2 space-y-1.5">
        {missing.map((row) => (
          <li key={row.path} className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              className={`font-semibold text-terracotta underline-offset-2 hover:underline ${adminFocusRing}`}
              onClick={() => onJumpToField(row.key)}
              aria-label={`Go to ${row.label}, required and missing`}
            >
              {row.label}
            </button>
            {onGenerateField && (!canGenerateField || canGenerateField(row.key)) ? (
              <button
                type="button"
                className={`${adminTertiaryButtonClass} ${adminFocusRing} text-xs`}
                onClick={() => onGenerateField(row.path, row.key)}
              >
                ✦ Generate
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
