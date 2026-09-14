import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CookWithWhatYouHaveClient } from "@/components/CookWithWhatYouHave";
import { site } from "@/data/site";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumb-jsonld";
import {
  buildCwyhMatchesForCatalog,
  CWYH_PATH,
  isCookWithWhatYouHaveEnabled,
  isCwyhListingNoIndex,
  loadCwyhIngredientRowsForRecipes,
  parseHaveParam,
  resolveCwyhPantry,
} from "@/lib/cook-with-what-you-have";
import { getDb } from "@/lib/db";
import { getAllRecipes } from "@/lib/recipes";
import { isShoppingListEnabled } from "@/lib/shopping-list";

const CWYH_DESCRIPTION =
  "Tell Mesa what ingredients you have and we'll show you the recipes you're closest to making.";

export const revalidate = 300;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  if (!isCookWithWhatYouHaveEnabled()) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const raw = await searchParams;
  const haveSlugs = parseHaveParam(raw.have);
  const noindex = isCwyhListingNoIndex(haveSlugs);

  return {
    title: "Cook With What You Have",
    description: CWYH_DESCRIPTION,
    alternates: { canonical: CWYH_PATH },
    robots: noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: `Cook With What You Have | ${site.name}`,
      description: CWYH_DESCRIPTION,
      url: `${site.url}${CWYH_PATH}`,
      siteName: site.name,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `Cook With What You Have | ${site.name}`,
      description: CWYH_DESCRIPTION,
    },
  };
}

export default async function CookWithWhatYouHavePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isCookWithWhatYouHaveEnabled()) {
    notFound();
  }

  const raw = await searchParams;
  const requestedSlugs = parseHaveParam(raw.have);
  const db = getDb();
  const { slugs: haveSlugs, ingredientIds, options } = await resolveCwyhPantry(
    db,
    requestedSlugs,
  );

  const recipes = await getAllRecipes();
  let groups: Awaited<ReturnType<typeof buildCwyhMatchesForCatalog>>["groups"] = [];
  let exactCount = 0;
  let nearCount = 0;
  let resultCount = 0;
  const recipesById: Record<string, (typeof recipes)[number]> = {};

  if (haveSlugs.length > 0 && ingredientIds.length > 0) {
    for (const recipe of recipes) {
      const id = recipe.id?.trim();
      if (id) recipesById[id] = recipe;
    }
    const recipeIds = Object.keys(recipesById);
    const ingredientRows = await loadCwyhIngredientRowsForRecipes(db, recipeIds);
    const scored = buildCwyhMatchesForCatalog({
      pantryIngredientIds: ingredientIds,
      recipes,
      ingredientRows,
    });
    groups = scored.groups;
    exactCount = scored.exactCount;
    nearCount = scored.nearCount;
    resultCount = scored.matches.length;
  }

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", url: "/" },
    { name: "Cook With What You Have", url: CWYH_PATH },
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 pb-16 md:px-6 md:pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <header>
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          Recipe finder
        </p>
        <h1 className="mt-2 font-serif text-4xl text-ink md:text-5xl">
          Cook With What You Have
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted md:mt-5">
          {CWYH_DESCRIPTION}
        </p>
      </header>

      <CookWithWhatYouHaveClient
        options={options}
        urlHaveSlugs={haveSlugs}
        groups={groups}
        exactCount={exactCount}
        nearCount={nearCount}
        resultCount={resultCount}
        recipesById={recipesById}
        shoppingListEnabled={isShoppingListEnabled()}
      />
    </div>
  );
}
