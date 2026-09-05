import Link from "next/link";
import { buildRecipesUrl } from "@/lib/recipe-discovery";
import {
  PRIMARY_CATEGORY_LABELS,
  PRIMARY_CATEGORY_SLUGS,
} from "@/lib/recipe-primary-taxonomy";

const linkFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function HomepageBrowseCategories() {
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
            {PRIMARY_CATEGORY_SLUGS.map((slug) => (
              <li key={slug} className="min-w-0 border-t border-line">
                <Link
                  href={buildRecipesUrl({ category: slug })}
                  className={`inline-flex min-h-11 max-w-full items-center py-2 text-terracotta hover:text-terracotta-dark ${linkFocus}`}
                >
                  <span className="min-w-0">{PRIMARY_CATEGORY_LABELS[slug]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
