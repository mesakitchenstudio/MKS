import type { Metadata } from "next";
import { RecipeDiscovery } from "@/components/RecipeDiscovery";
import { homepageCollectionSlugMap, homepageCollectionTitles } from "@/data/homepage";
import { applyDiscoveryFilters, parseDiscoveryParams } from "@/lib/recipe-discovery";
import { pageTitleSegment } from "@/lib/page-title";
import { getAllRecipes } from "@/lib/recipes";

export const revalidate = 300;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = parseDiscoveryParams(await searchParams);
  const collectionTitles = homepageCollectionTitles();
  const title = params.collection
    ? pageTitleSegment(collectionTitles[params.collection] ?? "Recipes")
    : params.q
      ? pageTitleSegment(`Search: ${params.q}`)
      : "Recipes";

  return {
    title,
    description:
      "Tested recipes for everyday cooking, baking, drinks, sides, and the table.",
    alternates: { canonical: "/recipes" },
    robots: params.q || params.category || params.collection ? { index: false } : undefined,
  };
}

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = parseDiscoveryParams(raw);
  const recipes = await getAllRecipes();
  const collectionMap = homepageCollectionSlugMap();
  const filtered = applyDiscoveryFilters(recipes, params, collectionMap);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <header>
        <h1 className="font-serif text-5xl text-ink">Recipes</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
          Recipes tested in the Mesa kitchen, from everyday meals to weekend baking.
        </p>
      </header>

      <section className="mt-8 border-t border-line pt-7 md:mt-9 md:pt-8" aria-label="Recipe discovery">
        <RecipeDiscovery
          recipes={filtered}
          params={params}
          collectionTitles={homepageCollectionTitles()}
        />
      </section>
    </div>
  );
}
