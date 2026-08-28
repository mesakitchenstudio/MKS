"use client";

import { forwardRef } from "react";
import { adminFocusRing } from "@/lib/admin-ui";

export type RecipeEditorSectionLink = {
  id: string;
  label: string;
};

export const RecipeEditorSectionNav = forwardRef<
  HTMLElement,
  {
    sections: RecipeEditorSectionLink[];
    stickyTop: number;
    scrollMarginTop: number;
    onNavigate: (sectionId: string) => void;
    activeSectionId?: string;
    compact?: boolean;
  }
>(function RecipeEditorSectionNav(
  { sections, stickyTop, scrollMarginTop, onNavigate, activeSectionId, compact = false },
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
          return (
            <li key={section.id} className="shrink-0">
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
            </li>
          );
        })}
      </ul>
    </nav>
  );
});
