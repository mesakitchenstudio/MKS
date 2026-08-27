import Link from "next/link";
import type { Recipe } from "@/data/types";
import { RecipeGridCard } from "./RecipeGridCard";

const linkFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function HomepageLatestSection({
  title,
  href,
  viewMoreLabel = "View all",
  recipes,
}: {
  title: string;
  href: string;
  viewMoreLabel?: string;
  recipes: Recipe[];
}) {
  if (!recipes.length) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
      <div className="mb-8 flex items-end justify-between gap-4">
        <h2 className="font-serif text-3xl md:text-4xl">{title}</h2>
        <Link href={href} className={`text-sm font-semibold text-terracotta hover:text-terracotta-dark ${linkFocus}`}>
          {viewMoreLabel}
        </Link>
      </div>
      <div className="grid gap-8 md:grid-cols-2">
        {recipes.slice(0, 2).map((recipe) => (
          <RecipeGridCard key={recipe.slug} recipe={recipe} large />
        ))}
      </div>
      {recipes.length > 2 ? (
        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          {recipes.slice(2).map((recipe) => (
            <RecipeGridCard key={recipe.slug} recipe={recipe} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
