"use client";

const LINKS = [
  { id: "recipe-cooking", label: "Recipe" },
  { id: "recipe-learn", label: "Learn" },
  { id: "watch-method", label: "Video" },
  { id: "recipe-comments", label: "Reviews" },
] as const;

export function RecipeSectionNav({ hasVideo, hasLearn }: { hasVideo: boolean; hasLearn: boolean }) {
  const items = LINKS.filter((link) => {
    if (link.id === "watch-method" && !hasVideo) return false;
    if (link.id === "recipe-learn" && !hasLearn) return false;
    return true;
  });

  if (items.length < 3) return null;

  return (
    <nav
      aria-label="Recipe sections"
      className="no-print sticky top-[4.5rem] z-30 -mx-4 border-b border-line/70 bg-[var(--cream)]/95 px-4 py-2 backdrop-blur-sm md:-mx-6 md:px-6"
    >
      <ul className="mx-auto flex max-w-[75rem] flex-wrap gap-x-4 gap-y-1 text-sm">
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className="font-semibold text-muted hover:text-terracotta">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
