import Link from "next/link";
import type { Recipe } from "@/data/types";
import { RecipeGridCard } from "./RecipeGridCard";

export function CollectionRow({
  title,
  href,
  recipes,
}: {
  title: string;
  href?: string;
  recipes: Recipe[];
}) {
  if (!recipes.length) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="font-serif text-3xl text-ink md:text-4xl">{title}</h2>
        {href ? (
          <Link
            href={href}
            className="text-sm font-semibold text-terracotta hover:text-terracotta-dark"
          >
            View more
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
