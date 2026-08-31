import Link from "next/link";
import type { Recipe } from "@/data/types";
import { RecipeGridCard } from "./RecipeGridCard";

const linkFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function CollectionRow({
  title,
  description,
  href,
  viewMoreLabel = "View more",
  recipes,
  uniformCards = false,
}: {
  title: string;
  description?: string;
  href?: string;
  viewMoreLabel?: string;
  recipes: Recipe[];
  /** Consistent 4:3 cards for recipe-page related row. */
  uniformCards?: boolean;
}) {
  if (!recipes.length) return null;

  const gridClass =
    recipes.length >= 3
      ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
      : "grid gap-6 sm:grid-cols-2";

  return (
    <section className="mx-auto max-w-[75rem] px-4 py-8 md:px-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-ink md:text-4xl">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {href ? (
          <Link
            href={href}
            className={`shrink-0 text-sm font-semibold text-terracotta hover:text-terracotta-dark ${linkFocus}`}
          >
            {viewMoreLabel}
          </Link>
        ) : null}
      </div>
      <div className={gridClass}>
        {recipes.map((recipe) => (
          <RecipeGridCard
            key={recipe.slug}
            recipe={recipe}
            imageAspect={uniformCards ? "4/3" : "5/4"}
          />
        ))}
      </div>
    </section>
  );
}
