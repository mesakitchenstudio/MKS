import Link from "next/link";
import {
  buildRecipesUrl,
  type RecipeDiscoveryParams,
} from "@/lib/recipe-discovery";

const linkFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function RecipesCategoryBrowse({
  items,
  activeCategory,
  currentParams = {},
}: {
  items: { slug: string; name: string; count: number }[];
  activeCategory?: string;
  currentParams?: RecipeDiscoveryParams;
}) {
  if (!items.length) return null;

  return (
    <section className="mt-8 md:mt-10" aria-labelledby="browse-by-category-heading">
      <h2
        id="browse-by-category-heading"
        className="font-serif text-[1.75rem] text-ink md:text-[1.85rem]"
      >
        Browse by category
      </h2>
      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 md:grid-cols-4 lg:gap-x-8">
        {items.map((item) => {
          const selected = activeCategory === item.slug;
          const countLabel = item.count === 1 ? "1 recipe" : `${item.count} recipes`;
          return (
            <li key={item.slug}>
              <Link
                href={buildRecipesUrl({
                  ...currentParams,
                  category: item.slug,
                  collection: undefined,
                })}
                aria-current={selected ? "page" : undefined}
                aria-label={`${item.name}, ${countLabel}`}
                className={`group block ${linkFocus}`}
                scroll={false}
              >
                <span
                  className={`font-serif text-lg leading-snug transition-colors duration-150 md:text-xl ${
                    selected
                      ? "text-terracotta"
                      : "text-ink group-hover:text-terracotta group-focus-visible:text-terracotta"
                  }`}
                >
                  {item.name}
                </span>
                <span className="mt-0.5 block text-sm text-muted" aria-hidden>
                  {countLabel}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
