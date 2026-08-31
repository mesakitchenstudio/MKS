"use client";

import { adminFocusRing, adminSecondaryButtonClass, adminTertiaryButtonClass } from "@/lib/admin-ui";

function formatPreviewValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) return value.join(", ");
    return JSON.stringify(value, null, 2);
  }
  return JSON.stringify(value, null, 2);
}

export function FieldAiSuggestionPanel({
  currentValue,
  suggestion,
  busy,
  onUseSuggestion,
  onTryAnother,
  onKeepCurrent,
  suggestionLabel = "AI suggestion",
}: {
  currentValue: unknown;
  suggestion: unknown;
  busy?: boolean;
  onUseSuggestion: () => void;
  onTryAnother: () => void;
  onKeepCurrent: () => void;
  suggestionLabel?: string;
}) {
  const currentText = formatPreviewValue(currentValue);
  const suggestionText = formatPreviewValue(suggestion);

  return (
    <div
      className="mt-2 rounded-sm border border-olive/25 bg-olive/5 px-3 py-3"
      role="region"
      aria-label="AI field suggestion review"
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive">
        AI suggestion — review
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-muted">Current value</p>
          <div className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-sm border border-line bg-paper px-2 py-2 text-sm text-ink">
            {currentText || <span className="text-muted italic">Empty</span>}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted">{suggestionLabel}</p>
          <div className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-sm border border-olive/30 bg-paper px-2 py-2 text-sm text-ink">
            {busy ? "Generating suggestion…" : suggestionText}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
          disabled={busy}
          onClick={onUseSuggestion}
        >
          Use suggestion
        </button>
        <button
          type="button"
          className={`${adminTertiaryButtonClass} ${adminFocusRing}`}
          disabled={busy}
          onClick={onTryAnother}
        >
          Try another
        </button>
        <button
          type="button"
          className={`${adminTertiaryButtonClass} ${adminFocusRing}`}
          disabled={busy}
          onClick={onKeepCurrent}
        >
          Keep current
        </button>
      </div>
    </div>
  );
}
