import Link from "next/link";
import type { Recipe } from "@/data/types";
import { RecipeGridCard } from "./RecipeGridCard";

const linkFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

function latestGridClass(count: number) {
  if (count >= 4) return "grid gap-8 sm:grid-cols-2 lg:grid-cols-4";
  if (count === 3) return "grid gap-8 sm:grid-cols-2 lg:grid-cols-3";
  if (count === 2) return "grid gap-8 sm:grid-cols-2";
  return "grid gap-8";
}

export function HomepageLatestSection({
  title,
  href,
  viewMoreLabel = "All recipes →",
  recipes,
}: {
  title: string;
  href: string;
  viewMoreLabel?: string;
  recipes: Recipe[];
}) {
  if (!recipes.length || recipes.length < 3) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-11 md:px-6 md:py-12" aria-labelledby="latest-recipes-heading">
      <div className="mb-8 flex items-end justify-between gap-4">
        <h2 id="latest-recipes-heading" className="font-serif text-3xl md:text-4xl">{title}</h2>
        <Link href={href} className={`text-sm font-semibold text-terracotta hover:text-terracotta-dark ${linkFocus}`}>
          {viewMoreLabel}
        </Link>
      </div>
      <div className={`${latestGridClass(recipes.length)} items-start`}>
        {recipes.map((recipe) => (
          <RecipeGridCard key={recipe.slug} recipe={recipe} />
        ))}
      </div>
    </section>
  );
}
