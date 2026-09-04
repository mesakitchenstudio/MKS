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
      className={`sticky z-50 -mx-5 w-auto border-b border-line/60 bg-[var(--cream)] px-5 md:-mx-6 md:px-6 ${
        compact ? "mb-3 py-1" : "mb-5 py-1.5"
      }`}
      style={{ top: stickyTop, scrollMarginTop }}
    >
      <p
        className={`mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive ${
          compact ? "sr-only" : ""
        }`}
      >
        On this recipe
      </p>
      <ul className="-mx-1 flex list-none gap-0.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              <div className="inline-flex max-w-full items-center">
                <button
                  type="button"
                  onClick={() => onNavigate(section.id)}
                  aria-current={isActive ? "location" : undefined}
                  className={`rounded-sm px-2 py-1.5 text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none hover:text-terracotta ${adminFocusRing} ${
                    isActive
                      ? "text-ink underline decoration-terracotta decoration-2 underline-offset-[0.35rem]"
                      : "text-ink/70"
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
                    className={`rounded-sm px-1 py-1.5 text-[0.65rem] font-semibold tabular-nums tracking-[0.04em] text-terracotta underline-offset-2 transition-colors duration-150 motion-reduce:transition-none hover:bg-terracotta/10 hover:underline ${adminFocusRing}`}
                  >
                    {missing}
                    <span className="sr-only"> missing</span>
                  </button>
                ) : null}
                {review > 0 ? (
                  <button
                    type="button"
                    onClick={() => (onNavigateToReview ?? onNavigate)(section.id)}
                    title={reviewTitle}
                    aria-label={
                      reviewSummary
                        ? `${section.label}, ${review} fields need review: ${reviewSummary}`
                        : `${section.label}, ${review} fields need review`
                    }
                    className={`rounded-sm px-1 py-1.5 text-[0.65rem] font-medium tabular-nums tracking-[0.04em] text-olive/80 underline-offset-2 transition-colors duration-150 motion-reduce:transition-none hover:bg-cream hover:text-ink hover:underline ${adminFocusRing}`}
                  >
                    {review}
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
