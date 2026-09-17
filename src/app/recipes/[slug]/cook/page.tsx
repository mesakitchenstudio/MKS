import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound, permanentRedirect } from "next/navigation";
import { CookingMode } from "@/components/cooking/CookingMode";
import { RecipeVideoExperience } from "@/components/youtube/RecipeVideoExperience";
import { site } from "@/data/site";
import { recipeInstructionStages } from "@/lib/recipe-instructions";
import { selectStageVideoHelp } from "@/lib/recipe-stage-video-help";
import { parseTimestampInput } from "@/lib/youtube-metadata-editor";
import { recipePublicPath, resolveActiveRedirect } from "@/lib/redirects";
import { isRecipeStepTimestampsEnabled } from "@/lib/flags";
import { getAllRecipes, getRecipeBySlug, publicRecipeId } from "@/lib/recipes";
import { resolveRecipeYoutube, resolveRecipeYoutubeForDisplay } from "@/lib/recipe-youtube";
import { getWatchNextRecommendation } from "@/lib/youtube-data/watch-next";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ servings?: string | string[] }>;
};

export const revalidate = 300;

export async function generateStaticParams() {
  const recipes = await getAllRecipes();
  return recipes.map((recipe) => ({ slug: recipe.slug }));
}

/**
 * Resolve published recipe by slug, or follow recipe redirects and land on /cook.
 * Does not load Revision / Audit / Publishing Readiness.
 */
async function loadRecipeOrRedirectCook(slug: string) {
  const recipe = await getRecipeBySlug(slug);
  if (recipe) return recipe;

  // Prefer mapping /recipes/old-slug → /recipes/new-slug/cook via existing Redirect rows.
  const recipeTarget = await resolveActiveRedirect(recipePublicPath(slug));
  if (recipeTarget) {
    permanentRedirect(`${recipeTarget}/cook`);
  }

  // If a future redirect was stored for the cook path itself, honor it.
  const cookTarget = await resolveActiveRedirect(`${recipePublicPath(slug)}/cook`);
  if (cookTarget) permanentRedirect(cookTarget);

  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const recipe = await loadRecipeOrRedirectCook(slug);
  if (!recipe) return { title: "Cooking Mode", robots: { index: false, follow: false } };

  return {
    title: `Cooking Mode · ${recipe.title}`,
    description: `Step-by-step Cooking Mode for ${recipe.title}.`,
    alternates: { canonical: `/recipes/${recipe.slug}` },
    robots: { index: false, follow: true },
    openGraph: {
      title: `Cooking Mode · ${recipe.title} | ${site.name}`,
      description: recipe.excerpt,
      url: `${site.url}/recipes/${recipe.slug}/cook`,
      images: [recipe.image],
      type: "article",
      siteName: site.name,
    },
  };
}

function parseServingsParam(raw: string | string[] | undefined): number | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(99, Math.round(n));
}

export default async function RecipeCookPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const recipe = await loadRecipeOrRedirectCook(slug);
  if (!recipe) notFound();

  const recipeId = publicRecipeId(recipe);
  const initialServings = parseServingsParam(sp.servings);

  const baseYoutube = resolveRecipeYoutube(recipe);
  if (baseYoutube && !(baseYoutube.timestamps?.length ?? 0)) {
    await connection();
  }
  const youtube = await resolveRecipeYoutubeForDisplay(recipe);
  const watchNext = youtube
    ? await getWatchNextRecommendation({
        currentVideoId: youtube.videoId,
        currentRecipeSlug: recipe.slug,
        currentCategories: recipe.categories,
        curatedRelated: youtube.relatedVideos,
      })
    : null;

  const stageVideoHelp = youtube
    ? selectStageVideoHelp(
        recipeInstructionStages(recipe),
        youtube.timestamps,
        youtube.stageAlignments,
        recipe.instructions,
        youtube.duration ? parseTimestampInput(youtube.duration) ?? undefined : undefined,
      )
    : {};

  const body = (
    <CookingMode
      recipe={recipe}
      recipeId={recipeId}
      youtube={youtube}
      stageVideoHelp={stageVideoHelp}
      initialServings={initialServings}
      stepTimestampsEnabled={isRecipeStepTimestampsEnabled()}
    />
  );

  if (!youtube) return body;

  return (
    <RecipeVideoExperience
      youtube={youtube}
      recipeSlug={recipe.slug}
      recipeName={recipe.title}
      watchNext={watchNext}
    >
      {body}
    </RecipeVideoExperience>
  );
}
