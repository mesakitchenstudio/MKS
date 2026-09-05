import Link from "next/link";
import { buildRecipesUrl } from "@/lib/recipe-discovery";
import {
  PRIMARY_CATEGORY_LABELS,
  PRIMARY_CATEGORY_SLUGS,
  type PrimaryCategorySlug,
} from "@/lib/recipe-primary-taxonomy";

const linkFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function HomepageBrowseCategories({
  categoryCounts,
}: {
  /** In-memory counts from homepage recipes; omit a slug to hide the count. */
  categoryCounts?: Partial<Record<PrimaryCategorySlug, number>>;
}) {
  return (
    <section className="border-y border-line bg-paper" aria-labelledby="browse-recipes-heading">
      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-14">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          Browse the table
        </p>
        <h2 id="browse-recipes-heading" className="mt-2 font-serif text-2xl md:text-3xl">
          Browse recipes
        </h2>
        <nav className="mt-6 max-w-3xl min-w-0" aria-label="Recipe categories">
          <ul className="grid grid-cols-2 gap-x-6 text-sm font-semibold text-ink sm:grid-cols-3 md:grid-cols-4 md:gap-x-8">
            {PRIMARY_CATEGORY_SLUGS.map((slug) => {
              const count = categoryCounts?.[slug];
              const showCount = typeof count === "number" && count > 0;
              return (
                <li key={slug} className="min-w-0 border-t border-line">
                  <Link
                    href={buildRecipesUrl({ category: slug })}
                    className={`inline-flex min-h-11 max-w-full items-baseline gap-x-2 py-2 text-terracotta hover:text-terracotta-dark ${linkFocus}`}
                  >
                    <span className="min-w-0">{PRIMARY_CATEGORY_LABELS[slug]}</span>
                    {showCount ? (
                      <span className="shrink-0 text-[0.7rem] font-semibold tabular-nums tracking-wide text-muted">
                        {count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </section>
  );
}
