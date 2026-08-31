"use client";

import { useId, useState } from "react";
import { adminFocusRing, adminSecondaryButtonClass, adminTertiaryButtonClass } from "@/lib/admin-ui";

const COLLAPSE_AFTER = 12;

export function TagsChipEditor({
  value,
  onChange,
  disabled,
  onOptimize,
  optimizeBusy,
  optimizeProposal,
  optimizeLabel = "✦ Suggest tags",
  onApplyOptimize,
  onDismissOptimize,
  onTryAnotherOptimize,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  onOptimize?: () => void;
  optimizeBusy?: boolean;
  optimizeProposal?: string[] | null;
  optimizeLabel?: string;
  onApplyOptimize?: () => void;
  onDismissOptimize?: () => void;
  onTryAnotherOptimize?: () => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);

  const tags = value.map((tag) => String(tag ?? "").trim()).filter(Boolean);
  const hiddenCount = Math.max(0, tags.length - COLLAPSE_AFTER);
  const visible = expanded || hiddenCount === 0 ? tags : tags.slice(0, COLLAPSE_AFTER);

  function addTag(raw: string) {
    const next = raw.trim();
    if (!next) return;
    const exists = tags.some((tag) => tag.toLowerCase() === next.toLowerCase());
    if (exists) {
      setDraft("");
      return;
    }
    onChange([...tags, next]);
    setDraft("");
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {visible.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="inline-flex max-w-full items-center gap-1 rounded-sm border border-line bg-cream/40 px-2 py-1 text-sm text-ink"
          >
            <span className="truncate">{tag}</span>
            <button
              type="button"
              className={`${adminTertiaryButtonClass} px-1 py-0 text-xs`}
              aria-label={`Remove tag ${tag}`}
              disabled={disabled}
              onClick={() => removeTag(tags.indexOf(tag) === -1 ? index : tags.indexOf(tag))}
            >
              ×
            </button>
          </span>
        ))}
        {!expanded && hiddenCount > 0 ? (
          <button
            type="button"
            className={`${adminTertiaryButtonClass} ${adminFocusRing}`}
            onClick={() => setExpanded(true)}
          >
            + {hiddenCount} more
          </button>
        ) : null}
        {expanded && hiddenCount > 0 ? (
          <button
            type="button"
            className={`${adminTertiaryButtonClass} ${adminFocusRing}`}
            onClick={() => setExpanded(false)}
          >
            Show less
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={inputId}>
          Add tag
        </label>
        <input
          id={inputId}
          type="text"
          value={draft}
          disabled={disabled}
          placeholder="Add tag"
          className="h-9 min-w-[10rem] flex-1 rounded-sm border border-line bg-paper px-3 text-sm outline-none focus:border-olive focus:ring-2 focus:ring-olive/15"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addTag(draft.replace(/,/g, ""));
            }
            if (event.key === "Backspace" && !draft && tags.length) {
              removeTag(tags.length - 1);
            }
          }}
        />
        <button
          type="button"
          className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
          disabled={disabled || !draft.trim()}
          onClick={() => addTag(draft)}
        >
          + Add tag
        </button>
        {onOptimize ? (
          <button
            type="button"
            className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
            disabled={disabled || optimizeBusy}
            onClick={onOptimize}
          >
            {optimizeBusy ? "Generating…" : optimizeLabel}
          </button>
        ) : null}
      </div>

      {optimizeProposal ? (
        <div className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-3" role="status">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive">
            AI suggestion — review
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {optimizeProposal.map((tag) => (
              <span
                key={tag}
                className="rounded-sm border border-line bg-paper px-2 py-1 text-sm text-ink"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
              onClick={onApplyOptimize}
            >
              Use suggestion
            </button>
            {onTryAnotherOptimize ? (
              <button
                type="button"
                className={`${adminTertiaryButtonClass} ${adminFocusRing}`}
                disabled={optimizeBusy}
                onClick={onTryAnotherOptimize}
              >
                Try another
              </button>
            ) : null}
            <button
              type="button"
              className={`${adminTertiaryButtonClass} ${adminFocusRing}`}
              onClick={onDismissOptimize}
            >
              Keep current
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
