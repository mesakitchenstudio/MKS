"use client";

import { forwardRef } from "react";
import { adminFocusRing } from "@/lib/admin-ui";

export type RecipeEditorSectionLink = {
  id: string;
  label: string;
  /** Required fields currently unsatisfied in this section. */
  missingCount?: number;
  missingLabels?: string[];
  /** Populated AI/inferred/estimated fields that may need review. */
  reviewCount?: number;
};

export const RecipeEditorSectionNav = forwardRef<
  HTMLElement,
  {
    sections: RecipeEditorSectionLink[];
    stickyTop: number;
    scrollMarginTop: number;
    onNavigate: (sectionId: string) => void;
    onNavigateToMissing?: (sectionId: string) => void;
    activeSectionId?: string;
    compact?: boolean;
  }
>(function RecipeEditorSectionNav(
  {
    sections,
    stickyTop,
    scrollMarginTop,
    onNavigate,
    onNavigateToMissing,
    activeSectionId,
    compact = false,
  },
  ref,
) {
  if (!sections.length) return null;

  return (
    <nav
      ref={ref}
      aria-label="On this recipe"
      className={`sticky z-40 -mx-5 border-b border-line/70 bg-[var(--cream)]/95 px-5 backdrop-blur-sm md:-mx-6 md:px-6 ${
        compact ? "mb-4 py-1.5" : "mb-6 py-2"
      }`}
      style={{ top: stickyTop, scrollMarginTop }}
    >
      <p
        className={`mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive ${
          compact ? "sr-only" : ""
        }`}
      >
        On this recipe
      </p>
      <ul className="-mx-1 flex list-none gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((section) => {
          const isActive = activeSectionId === section.id;
          const missing = section.missingCount ?? 0;
          const review = section.reviewCount ?? 0;
          const complete = missing === 0;
          const missingSummary =
            missing > 0 && section.missingLabels?.length
              ? section.missingLabels.join(", ")
              : undefined;
          const missingTitle = missingSummary
            ? `Missing required: ${missingSummary}. Click to jump to the first missing field.`
            : missing > 0
              ? `${missing} required field${missing === 1 ? "" : "s"} missing. Click to jump to the first missing field.`
              : undefined;
          const missingAriaLabel = missingSummary
            ? `${missing} required field${missing === 1 ? "" : "s"} missing in ${section.label}: ${missingSummary}. Go to first missing field.`
            : `${missing} required field${missing === 1 ? "" : "s"} missing in ${section.label}. Go to first missing field.`;

          return (
            <li key={section.id} className="shrink-0">
              <div
                className={`inline-flex max-w-full items-center rounded-sm ${
                  isActive ? "bg-paper/60" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => onNavigate(section.id)}
                  aria-current={isActive ? "location" : undefined}
                  className={`rounded-sm px-2.5 py-1.5 text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none hover:bg-paper hover:text-terracotta ${adminFocusRing} ${
                    isActive
                      ? "text-terracotta underline decoration-terracotta decoration-2 underline-offset-[0.35rem]"
                      : "text-muted"
                  }`}
                >
                  {section.label}
                  {complete ? (
                    <span className="ml-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-olive/80">
                      ✓
                    </span>
                  ) : null}
                </button>
                {!complete ? (
                  <button
                    type="button"
                    onClick={() =>
                      (onNavigateToMissing ?? onNavigate)(section.id)
                    }
                    title={missingTitle}
                    aria-label={missingAriaLabel}
                    className={`rounded-sm px-1.5 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-terracotta underline-offset-2 transition-colors duration-150 motion-reduce:transition-none hover:bg-terracotta/10 hover:text-terracotta hover:underline ${adminFocusRing}`}
                  >
                    {missing} missing
                  </button>
                ) : null}
                {review > 0 ? (
                  <span className="px-1.5 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted">
                    {review} review
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
});
