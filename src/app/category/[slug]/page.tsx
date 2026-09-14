import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollectionCard } from "@/components/series/CollectionCard";
import { JsonLd } from "@/components/JsonLd";
import { RecipeGridCard } from "@/components/RecipeGridCard";
import { site } from "@/data/site";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumb-jsonld";
import {
  categoryItemListJsonLd,
  categoryMetaDescription,
  categoryPublicPath,
  isCategoryIndexable,
} from "@/lib/category-seo";
import { getAllCategories, getCategoryBySlug, getRecipesByCategory } from "@/lib/recipes";
import { listPublishedSeriesCardsForCategory } from "@/lib/series";

type Props = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 300;

export async function generateStaticParams() {
  const categories = await getAllCategories();
  return categories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category" };

  const recipes = await getRecipesByCategory(slug);
  const description = categoryMetaDescription(category.description);
  const thin = !isCategoryIndexable(recipes.length);
  const path = categoryPublicPath(category.slug);

  return {
    title: category.name,
    description,
    alternates: { canonical: path },
    ...(thin ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: `${category.name} | ${site.name}`,
      description,
      url: `${site.url}${path}`,
      siteName: site.name,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${category.name} | ${site.name}`,
      description,
    },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const [recipes, relatedCollections] = await Promise.all([
    getRecipesByCategory(slug),
    listPublishedSeriesCardsForCategory(slug),
  ]);

  const showItemList = recipes.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", url: "/" },
          { name: "Recipes", url: "/recipes" },
          { name: category.name, url: categoryPublicPath(category.slug) },
        ])}
      />
      {showItemList ? (
        <JsonLd
          data={categoryItemListJsonLd({
            name: category.name,
            description: category.description,
            slug: category.slug,
            recipes: recipes.map((recipe) => ({ title: recipe.title, slug: recipe.slug })),
          })}
        />
      ) : null}
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
        {category.group}
      </p>
      <h1 className="mt-2 font-serif text-5xl">{category.name}</h1>
      <p className="mt-3 max-w-2xl text-muted">{category.description}</p>
      {recipes.length ? (
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <RecipeGridCard key={recipe.slug} recipe={recipe} />
          ))}
        </div>
      ) : (
        <p className="mt-12 text-muted">Recipes for this category are coming soon.</p>
      )}

      {relatedCollections.length > 0 ? (
        <section className="mt-14" aria-labelledby="category-collections-heading">
          <h2 id="category-collections-heading" className="font-serif text-3xl text-ink">
            Explore collections
          </h2>
          <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {relatedCollections.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} titleAs="h3" />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
