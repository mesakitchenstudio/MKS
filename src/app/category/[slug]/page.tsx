import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecipeGridCard } from "@/components/RecipeGridCard";
import { categories } from "@/data/categories";
import { getCategoryBySlug, getRecipesByCategory } from "@/lib/recipes";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return categories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) return { title: "Category" };
  return { title: category.name, description: category.description };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) notFound();

  const recipes = getRecipesByCategory(slug);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
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
        <p className="mt-12 text-muted">We have not published a recipe in this collection yet.</p>
      )}
    </div>
  );
}
