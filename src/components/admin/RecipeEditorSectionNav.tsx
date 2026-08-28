"use client";

import { adminFocusRing } from "@/lib/admin-ui";

export type RecipeEditorSectionLink = {
  id: string;
  label: string;
};

export function RecipeEditorSectionNav({
  sections,
  stickyTop,
  scrollMarginTop,
  onNavigate,
}: {
  sections: RecipeEditorSectionLink[];
  stickyTop: number;
  scrollMarginTop: number;
  onNavigate: (sectionId: string) => void;
}) {
  if (!sections.length) return null;

  return (
    <nav
      aria-label="On this recipe"
      className="sticky z-40 -mx-5 mb-6 border-b border-line/70 bg-[var(--cream)]/95 px-5 py-2 backdrop-blur-sm md:-mx-6 md:px-6"
      style={{ top: stickyTop, scrollMarginTop }}
    >
      <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        On this recipe
      </p>
      <ul className="-mx-1 flex list-none gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((section) => (
          <li key={section.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onNavigate(section.id)}
              className={`rounded-sm px-2.5 py-1.5 text-sm font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:bg-paper hover:text-terracotta ${adminFocusRing}`}
            >
              {section.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
