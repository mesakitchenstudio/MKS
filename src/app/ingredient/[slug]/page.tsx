import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { RecipeGridCard } from "@/components/RecipeGridCard";
import { site } from "@/data/site";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumb-jsonld";
import { getDb } from "@/lib/db";
import {
  getPublicIngredientLanding,
  ingredientItemListJsonLd,
  ingredientMetaDescription,
  ingredientPageTitleSegment,
  ingredientPublicPath,
  isIngredientPageIndexable,
  isIngredientSeoEnabled,
  listReachableIngredientSlugs,
} from "@/lib/ingredient-seo";
import { formatRecipeCount } from "@/lib/category-admin";
import { pageTitleSegment } from "@/lib/page-title";

type Props = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";
/**
 * Keep runtime params (Admin can create Ingredients after deploy).
 * Pair with `force-dynamic` so OFF-state empty `generateStaticParams` does not
 * attempt on-demand static generation — that path threw DYNAMIC_SERVER_USAGE
 * (HTTP 500) via root-layout cookies()/auth. SEO OFF still fail-closes via
 * `notFound()` / soft metadata below.
 */
export const dynamicParams = true;

export async function generateStaticParams() {
  if (!isIngredientSeoEnabled()) return [];
  try {
    const slugs = await listReachableIngredientSlugs(getDb());
    return slugs.map((slug) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Same gated soft-metadata pattern as shopping-list / CWYW (no DB when OFF).
  if (!isIngredientSeoEnabled()) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const { slug } = await params;
  const landing = await getPublicIngredientLanding(getDb(), slug);
  if (!landing) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const title = pageTitleSegment(ingredientPageTitleSegment(landing.ingredient.name));
  const description = ingredientMetaDescription(landing.ingredient.name);
  const path = ingredientPublicPath(landing.ingredient.slug);
  const thin = !isIngredientPageIndexable(landing.publishedRecipeCount);

  return {
    title,
    description,
    alternates: { canonical: path },
    ...(thin ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: `${ingredientPageTitleSegment(landing.ingredient.name)} | ${site.name}`,
      description,
      url: `${site.url}${path}`,
      siteName: site.name,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${ingredientPageTitleSegment(landing.ingredient.name)} | ${site.name}`,
      description,
    },
  };
}

export default async function IngredientSeoPage({ params }: Props) {
  if (!isIngredientSeoEnabled()) notFound();

  const { slug } = await params;
  const landing = await getPublicIngredientLanding(getDb(), slug);
  if (!landing) notFound();

  const heading = ingredientPageTitleSegment(landing.ingredient.name);
  const intro = ingredientMetaDescription(landing.ingredient.name);
  const path = ingredientPublicPath(landing.ingredient.slug);
  const count = landing.publishedRecipeCount;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", url: "/" },
          { name: "Recipes", url: "/recipes" },
          { name: heading, url: path },
        ])}
      />
      <JsonLd
        data={ingredientItemListJsonLd({
          name: landing.ingredient.name,
          slug: landing.ingredient.slug,
          description: intro,
          recipes: landing.recipes.map((recipe) => ({
            title: recipe.title,
            slug: recipe.slug,
          })),
        })}
      />

      <h1 className="font-serif text-5xl text-ink">{heading}</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-muted">{intro}</p>
      <p className="mt-4 text-sm text-muted" role="status">
        {formatRecipeCount(count)}
      </p>

      <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {landing.recipes.map((recipe) => (
          <RecipeGridCard key={recipe.slug} recipe={recipe} />
        ))}
      </div>
    </div>
  );
}
