import type { Recipe } from "@/data/types";
import { RecipeGridCard } from "./RecipeGridCard";

export function HomepageFromKitchenSection({
  title,
  recipes,
}: {
  title: string;
  recipes: Recipe[];
}) {
  if (recipes.length !== 3) return null;

  return (
    <section
      className="border-y border-line bg-cream/40"
      aria-labelledby="from-kitchen-heading"
    >
      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-14">
        <h2 id="from-kitchen-heading" className="mb-8 font-serif text-3xl md:text-4xl">
          {title}
        </h2>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <RecipeGridCard key={recipe.slug} recipe={recipe} />
          ))}
        </div>
      </div>
    </section>
  );
}
