import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { RecipeDetailView } from "@/components/recipe/RecipeDetailView";
import { site } from "@/data/site";
import { loadRecipeDetailPresentation } from "@/lib/recipe-detail-presentation";
import { recipePublicPath, resolveActiveRedirect } from "@/lib/redirects";
import { getAllRecipes, getRecipeBySlug } from "@/lib/recipes";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ review?: string | string[] }>;
};

export const revalidate = 300;

export async function generateStaticParams() {
  const recipes = await getAllRecipes();
  return recipes.map((recipe) => ({ slug: recipe.slug }));
}

async function loadRecipeOrRedirect(slug: string) {
  const recipe = await getRecipeBySlug(slug);
  if (recipe) return recipe;
  const target = await resolveActiveRedirect(recipePublicPath(slug));
  if (target) permanentRedirect(target);
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const recipe = await loadRecipeOrRedirect(slug);
  if (!recipe) return { title: "Recipe" };

  return {
    title: recipe.title,
    description: recipe.excerpt,
    alternates: { canonical: `/recipes/${recipe.slug}` },
    openGraph: {
      title: `${recipe.title} | ${site.name}`,
      description: recipe.excerpt,
      url: `${site.url}/recipes/${recipe.slug}`,
      images: [recipe.image],
      type: "article",
      siteName: site.name,
    },
    twitter: {
      card: "summary_large_image",
      title: `${recipe.title} | ${site.name}`,
      description: recipe.excerpt,
      images: [recipe.image],
    },
  };
}

export default async function RecipePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { review: reviewParam } = await searchParams;
  const targetReviewId = Array.isArray(reviewParam)
    ? reviewParam[0]?.trim() || null
    : reviewParam?.trim() || null;
  const recipe = await loadRecipeOrRedirect(slug);
  if (!recipe) notFound();

  const detail = await loadRecipeDetailPresentation(recipe, {
    reviewQuery: targetReviewId,
  });

  return <RecipeDetailView mode="public" {...detail} />;
}
