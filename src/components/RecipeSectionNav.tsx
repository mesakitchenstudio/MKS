"use client";

import { useEffect, useMemo, useState } from "react";
import { recipeContentShellClass } from "@/components/RecipeContentShell";

const LINKS = [
  { id: "recipe-cooking", label: "Recipe" },
  { id: "recipe-learn", label: "Learn" },
  { id: "watch-method", label: "Video" },
  { id: "recipe-comments", label: "Reviews" },
] as const;

export function RecipeSectionNav({ hasVideo, hasLearn }: { hasVideo: boolean; hasLearn: boolean }) {
  const items = useMemo(
    () =>
      LINKS.filter((link) => {
        if (link.id === "watch-method" && !hasVideo) return false;
        if (link.id === "recipe-learn" && !hasLearn) return false;
        return true;
      }),
    [hasLearn, hasVideo],
  );

  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => Boolean(element));
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-35% 0px -50% 0px", threshold: [0, 0.15, 0.35] },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [items]);

  if (items.length < 3) return null;

  return (
    <nav
      aria-label="Recipe sections"
      className="no-print sticky top-[4.5rem] z-30 border-b border-line/70 bg-[var(--cream)]/95 py-2 backdrop-blur-sm"
    >
      <ul className={`flex flex-wrap gap-x-4 gap-y-1 text-sm ${recipeContentShellClass}`}>
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? "true" : undefined}
                className={`font-semibold transition-colors hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta ${
                  active ? "text-terracotta" : "text-muted"
                }`}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
