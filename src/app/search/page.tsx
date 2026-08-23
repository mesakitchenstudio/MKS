import type { Metadata } from "next";
import { SearchResults } from "@/components/SearchResults";
import { getAllRecipes } from "@/lib/recipes";

export const metadata: Metadata = {
  title: "Search",
  description: "Search Mesa Kitchen Studio recipes by name, ingredient, or category.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const recipes = await getAllRecipes();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <h1 className="font-serif text-5xl">Search</h1>
      <p className="mt-3 max-w-xl text-muted">
        Look up a dish, an ingredient, or a vibe — lemon, weeknight, focaccia.
      </p>
      <div className="mt-8">
        <SearchResults initialQuery={q} recipes={recipes} />
      </div>
    </div>
  );
}
