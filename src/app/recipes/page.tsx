import type { Metadata } from "next";
import { RecipeDiscovery } from "@/components/RecipeDiscovery";
import { homepageCollectionSlugMap, homepageCollectionTitles } from "@/data/homepage";
import { getDb } from "@/lib/db";
import {
  findPublishedRecipeIdsByIngredientFilter,
  hasActiveIngredientFilter,
  isIngredientDiscoveryEnabled,
  loadPublicIngredientFilterOptions,
  loadPublishedRecipeIngredientSlugMembership,
} from "@/lib/ingredient-discovery";
import { isCookWithWhatYouHaveEnabled } from "@/lib/cook-with-what-you-have";
import {
  applyDiscoveryFilters,
  getIngredientFilterSelection,
  isDiscoveryListingNoIndex,
  parseDiscoveryParams,
} from "@/lib/recipe-discovery";
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
    robots: isDiscoveryListingNoIndex(params) ? { index: false, follow: true } : undefined,
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

  const gateOn = isIngredientDiscoveryEnabled();
  const cwywOn = isCookWithWhatYouHaveEnabled();
  let ingredientOptions: Awaited<ReturnType<typeof loadPublicIngredientFilterOptions>> = [];
  let ingredientMembership: Record<string, string[]> = {};
  let ingredientMatchedRecipeIds: Set<string> | null = null;

  if (gateOn) {
    const db = getDb();
    ingredientOptions = await loadPublicIngredientFilterOptions(db);
    const selection = getIngredientFilterSelection(params);
    if (hasActiveIngredientFilter(selection) && ingredientOptions.length > 0) {
      ingredientMatchedRecipeIds = await findPublishedRecipeIdsByIngredientFilter(db, selection);
      ingredientMembership = await loadPublishedRecipeIngredientSlugMembership(db);
    } else if (ingredientOptions.length > 0) {
      ingredientMembership = await loadPublishedRecipeIngredientSlugMembership(db);
    }
  }

  const filtered = applyDiscoveryFilters(recipes, params, collectionMap, {
    ingredientMatchedRecipeIds: gateOn ? ingredientMatchedRecipeIds : null,
  });

  const ingredientNames = Object.fromEntries(
    ingredientOptions.map((option) => [option.slug, option.name]),
  );

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
          allRecipes={recipes}
          params={params}
          collectionTitles={homepageCollectionTitles()}
          ingredientDiscoveryEnabled={gateOn && ingredientOptions.length > 0}
          cookWithWhatYouHaveEnabled={cwywOn}
          ingredientOptions={ingredientOptions}
          ingredientNames={ingredientNames}
          ingredientMembership={ingredientMembership}
        />
      </section>
    </div>
  );
}
