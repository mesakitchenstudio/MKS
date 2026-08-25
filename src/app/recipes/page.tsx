import type { Metadata } from "next";
import { RecipeFilters } from "@/components/RecipeFilters";
import { site } from "@/data/site";
import { getAllRecipes } from "@/lib/recipes";

export const metadata: Metadata = {
  title: "All recipes",
  description: `Browse every ${site.name} recipe — cakes, dinners, breads, and more.`,
  alternates: { canonical: "/recipes" },
};

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const recipes = await getAllRecipes();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
        The catalog
      </p>
      <h1 className="mt-2 font-serif text-5xl">All recipes</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Filter by course or method. Every recipe is written with grams where they matter
        and notes for the next time you make it.
      </p>
      <div className="mt-10">
        <RecipeFilters recipes={recipes} />
      </div>
    </div>
  );
}
