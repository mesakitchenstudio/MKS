"use client";

import { adminFocusRing, adminTertiaryButtonClass } from "@/lib/admin-ui";
import type { EditorIssue } from "@/lib/recipe-editor-navigation";

export function EditorIssueNavigator({
  issues,
  index,
  onPrevious,
  onNext,
  onClose,
  label,
}: {
  issues: EditorIssue[];
  index: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose?: () => void;
  label: string;
}) {
  if (!issues.length) return null;
  const current = issues[index];
  const total = issues.length;

  return (
    <div
      className="sticky z-30 -mx-5 flex flex-wrap items-center justify-between gap-2 border-b border-line/80 bg-paper/95 px-5 py-2 backdrop-blur-sm md:-mx-6 md:px-6"
      role="region"
      aria-label={`${label} navigation`}
      style={{ top: "var(--recipe-editor-issue-nav-top, 0px)" }}
    >
      <p className="min-w-0 flex-1 truncate text-xs text-muted">
        <span className="font-semibold text-ink">{current?.label ?? "Issue"}</span>
        {current ? (
          <span className="ml-2 uppercase tracking-[0.08em]">{current.kind === "missing" ? "Required" : "Review"}</span>
        ) : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${adminTertiaryButtonClass} ${adminFocusRing} text-xs`}
          disabled={index <= 0}
          onClick={onPrevious}
        >
          Previous
        </button>
        <span className="text-xs font-semibold tabular-nums text-muted">
          {index + 1} of {total}
        </span>
        <button
          type="button"
          className={`${adminTertiaryButtonClass} ${adminFocusRing} text-xs`}
          disabled={index >= total - 1}
          onClick={onNext}
        >
          Next
        </button>
        {onClose ? (
          <button type="button" className={`${adminTertiaryButtonClass} ${adminFocusRing} text-xs`} onClick={onClose}>
            Done
          </button>
        ) : null}
      </div>
    </div>
  );
}
