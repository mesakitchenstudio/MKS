import type { Metadata } from "next";
import { RecipeDiscovery } from "@/components/RecipeDiscovery";
import { RecipesCategoryBrowse } from "@/components/RecipesCategoryBrowse";
import { megaMenu } from "@/data/categories";
import { homepageCollectionSlugMap, homepageCollectionTitles } from "@/data/homepage";
import { site } from "@/data/site";
import {
  PRIMARY_BROWSE_GROUPS,
  applyDiscoveryFilters,
  browsableCategoriesWithCounts,
  parseDiscoveryParams,
} from "@/lib/recipe-discovery";
import { getAllCategories, getAllRecipes } from "@/lib/recipes";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = parseDiscoveryParams(await searchParams);
  const collectionTitles = homepageCollectionTitles();
  const title = params.collection
    ? `${collectionTitles[params.collection] ?? "Recipes"} | ${site.name}`
    : params.q
      ? `Search: ${params.q} | ${site.name}`
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
  const [recipes, categories] = await Promise.all([getAllRecipes(), getAllCategories()]);
  const collectionMap = homepageCollectionSlugMap();
  const filtered = applyDiscoveryFilters(recipes, params, collectionMap);
  const preferredOrder = megaMenu
    .filter((group) => group.label === "Desserts" || group.label === "Course")
    .flatMap((group) => [...group.slugs]);
  const browseItems = browsableCategoriesWithCounts(categories, recipes, preferredOrder, {
    groups: PRIMARY_BROWSE_GROUPS,
  });
  const categoryLabels = Object.fromEntries(
    categories.map((category) => [category.slug, category.name]),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <h1 className="font-serif text-5xl">Recipes</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Tested recipes for everyday cooking, baking, drinks, sides, and the table.
      </p>

      <RecipesCategoryBrowse
        items={browseItems}
        activeCategory={params.category}
        currentParams={params}
      />

      <section
        className="mt-8 border-t border-line pt-8 md:mt-10 md:pt-9"
        aria-labelledby="all-recipes-heading"
      >
        <h2 id="all-recipes-heading" className="font-serif text-[1.75rem] text-ink md:text-[1.85rem]">
          All recipes
        </h2>
        <RecipeDiscovery
          recipes={filtered}
          params={params}
          collectionTitles={homepageCollectionTitles()}
          categoryLabels={categoryLabels}
        />
      </section>
    </div>
  );
}
