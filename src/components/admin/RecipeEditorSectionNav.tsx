"use client";

import { forwardRef } from "react";
import { adminFocusRing } from "@/lib/admin-ui";

export type RecipeEditorSectionLink = {
  id: string;
  label: string;
  /** Required fields currently unsatisfied in this section. */
  missingCount?: number;
  missingLabels?: string[];
  /** Populated AI content awaiting staff review. */
  reviewCount?: number;
  reviewLabels?: string[];
};

export const RecipeEditorSectionNav = forwardRef<
  HTMLElement,
  {
    sections: RecipeEditorSectionLink[];
    stickyTop: number;
    scrollMarginTop: number;
    onNavigate: (sectionId: string) => void;
    onNavigateToMissing?: (sectionId: string) => void;
    onNavigateToReview?: (sectionId: string) => void;
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
    onNavigateToReview,
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
          const missingSummary =
            missing > 0 && section.missingLabels?.length
              ? section.missingLabels.join(", ")
              : undefined;
          const reviewSummary =
            review > 0 && section.reviewLabels?.length
              ? section.reviewLabels.join(", ")
              : undefined;
          const missingTitle = missingSummary
            ? `Missing required: ${missingSummary}. Click to jump to the first missing field.`
            : missing > 0
              ? `${missing} required field${missing === 1 ? "" : "s"} missing. Click to jump to the first missing field.`
              : undefined;
          const reviewTitle = reviewSummary
            ? `Needs review: ${reviewSummary}. Click to jump to the first review item.`
            : review > 0
              ? `${review} field${review === 1 ? "" : "s"} need review. Click to jump to the first review item.`
              : undefined;

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
                </button>
                {missing > 0 ? (
                  <button
                    type="button"
                    onClick={() => (onNavigateToMissing ?? onNavigate)(section.id)}
                    title={missingTitle}
                    aria-label={
                      missingSummary
                        ? `${missing} required missing in ${section.label}: ${missingSummary}`
                        : `${missing} required missing in ${section.label}`
                    }
                    className={`rounded-sm px-1.5 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-terracotta underline-offset-2 transition-colors duration-150 motion-reduce:transition-none hover:bg-terracotta/10 hover:text-terracotta hover:underline ${adminFocusRing}`}
                  >
                    {missing} missing
                  </button>
                ) : null}
                {review > 0 ? (
                  <button
                    type="button"
                    onClick={() => (onNavigateToReview ?? onNavigate)(section.id)}
                    title={reviewTitle}
                    aria-label={
                      reviewSummary
                        ? `${review} need review in ${section.label}: ${reviewSummary}`
                        : `${review} need review in ${section.label}`
                    }
                    className={`rounded-sm px-1.5 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted underline-offset-2 transition-colors duration-150 motion-reduce:transition-none hover:bg-cream hover:text-ink hover:underline ${adminFocusRing}`}
                  >
                    {review} review
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
});
