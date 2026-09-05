import type { Recipe } from "@/data/types";
import { RecipeGridCard } from "./RecipeGridCard";

/**
 * Curated exact-3 encore: one lead + two supporting (asymmetric editorial).
 * Semantics unchanged — omit when not exactly three recipes.
 */
export function HomepageFromKitchenSection({
  title,
  recipes,
}: {
  title: string;
  recipes: Recipe[];
}) {
  if (recipes.length !== 3) return null;

  const [lead, supportA, supportB] = recipes;

  return (
    <section
      className="border-y border-line bg-cream/40"
      aria-labelledby="from-kitchen-heading"
    >
      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-14">
        <h2 id="from-kitchen-heading" className="mb-8 font-serif text-3xl md:text-4xl">
          {title}
        </h2>
        <div className="grid min-w-0 grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-10">
          <div className="min-w-0">
            <RecipeGridCard recipe={lead} large imageAspect="4/3" excerptLines={2} />
          </div>
          <div className="grid min-w-0 gap-8 sm:grid-cols-2 lg:grid-cols-1 lg:gap-8">
            <RecipeGridCard recipe={supportA} excerptLines={2} />
            <RecipeGridCard recipe={supportB} excerptLines={2} />
          </div>
        </div>
      </div>
    </section>
  );
}
