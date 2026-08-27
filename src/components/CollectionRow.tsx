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
}: {
  title: string;
  description?: string;
  href?: string;
  viewMoreLabel?: string;
  recipes: Recipe[];
}) {
  if (!recipes.length) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <div className="mb-6 flex items-end justify-between gap-4">
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
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {recipes.map((recipe) => (
          <RecipeGridCard key={recipe.slug} recipe={recipe} />
        ))}
      </div>
    </section>
  );
}
