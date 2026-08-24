import type { RecipeTocItem } from "@/lib/recipe-sections";

export function RecipeTableOfContents({ items }: { items: RecipeTocItem[] }) {
  if (items.length < 2) return null;

  return (
    <nav aria-label="Table of contents" className="mt-10 scroll-mt-24 border border-line bg-paper p-6">
      <h2 className="font-serif text-2xl text-ink">Table of Contents</h2>
      <ul className="mt-4 space-y-2 text-sm leading-6">
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className="font-semibold text-terracotta hover:underline">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
