import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { CollectionRow } from "@/components/CollectionRow";
import { JsonLd } from "@/components/JsonLd";
import { RecipeCookingWorkspace } from "@/components/RecipeCard";
import { RecipeLearnSection } from "@/components/RecipeLearnSection";
import { RecipePageHero } from "@/components/RecipePageHero";
import { RecipeReviews } from "@/components/RecipeReviews";
import { RecipeSectionNav } from "@/components/RecipeSectionNav";
import { SetCurrentRecipe } from "@/components/RecipeFloatTools";
import { RecipeContinuedViewing } from "@/components/youtube/RecipeContinuedViewing";
import { RecipeFooterSubscribe } from "@/components/youtube/RecipeCompactSubscribe";
import { RecipeVideoExperience } from "@/components/youtube/RecipeVideoExperience";
import { RecipeWatchMethod } from "@/components/youtube/RecipeWatchMethod";
import { site } from "@/data/site";
import { getAdminSession } from "@/lib/auth";
import { canManageRecipeReviewReplies, getRecipeReviewData } from "@/lib/recipe-reviews";
import { resolveRecipeYoutube, resolveRecipeYoutubeForDisplay } from "@/lib/recipe-youtube";
import { fieldValueHasContent, formatPublicExtraFieldValue } from "@/lib/field-content";
import { publicExtrasForPage, readerExtraLabel } from "@/lib/recipe-timing";
import { getContinuedViewingRecipeSlug, getRankedRelatedRecipes } from "@/lib/recipe-related";
import { recipeJsonLd } from "@/lib/schema";
import { formatGmtDisplay } from "@/lib/datetime";
import { getAllRecipes, getRecipeBySlug } from "@/lib/recipes";
import { getWatchNextRecommendation } from "@/lib/youtube-data/watch-next";
import { getSeriesLinksForRecipeSlug, getSeriesPeerRecipeSlugs } from "@/lib/series";

type Props = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 300;

export async function generateStaticParams() {
  const recipes = await getAllRecipes();
  return recipes.map((recipe) => ({ slug: recipe.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const recipe = await getRecipeBySlug(slug);
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

export default async function RecipePage({ params }: Props) {
  const { slug } = await params;
  const recipe = await getRecipeBySlug(slug);
  if (!recipe) notFound();

  const [seriesLinks, seriesPeerSlugs, session, admin] = await Promise.all([
    getSeriesLinksForRecipeSlug(recipe.slug),
    getSeriesPeerRecipeSlugs(recipe.slug),
    auth(),
    getAdminSession(),
  ]);

  const canStaffReply =
    Boolean(admin && canManageRecipeReviewReplies(admin.role)) ||
    Boolean(session?.staffRole && canManageRecipeReviewReplies(session.staffRole));
  const reviewData = await getRecipeReviewData(slug, {
    canStaffReply,
    email: session?.user?.email ?? null,
    userId: session?.user?.id ?? null,
  });

  const visibleExtrasList = publicExtrasForPage(recipe).filter((field) =>
    fieldValueHasContent(field.value, field.kind),
  );
  const updated = formatGmtDisplay(recipe.updatedAt);
  const hasLearn =
    Boolean(recipe.whyItWorks.trim()) ||
    recipe.keyIngredients.length > 0 ||
    recipe.tips.length > 0;

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

  const continuedSlug = getContinuedViewingRecipeSlug(watchNext, seriesLinks);
  const related = await getRankedRelatedRecipes(recipe, {
    seriesPeerSlugs,
    limit: 3,
    excludeSlugs: continuedSlug ? [continuedSlug] : [],
  });

  const article = (
    <>
      <RecipePageHero
        recipe={recipe}
        seriesLinks={seriesLinks}
        updated={updated}
        reviewData={reviewData}
      />

      <RecipeSectionNav hasVideo={Boolean(youtube)} hasLearn={hasLearn} />

      <RecipeCookingWorkspace recipe={recipe} youtube={youtube} />

      <div className="mx-auto max-w-[75rem] px-4 pb-8 md:px-6">
        <RecipeLearnSection
          whyItWorks={recipe.whyItWorks}
          keyIngredients={recipe.keyIngredients}
          tips={recipe.tips}
        />

        {youtube ? <RecipeWatchMethod /> : null}

        {recipe.faqs.length ? (
          <section id="faqs" className="mt-10 scroll-mt-24">
            <h2 className="font-serif text-2xl text-ink">Frequently asked</h2>
            <div className="mt-4 space-y-5">
              {recipe.faqs.map((faq) => (
                <div key={faq.question}>
                  <h3 className="font-semibold">{faq.question}</h3>
                  <p className="mt-1 leading-7 text-muted">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {visibleExtrasList.length ? (
          <section className="mt-8">
            {visibleExtrasList.map((field) => (
              <div key={field.key} id={`extra-${field.key}`} className="mt-8 scroll-mt-24 first:mt-0">
                <h2 className="font-serif text-2xl text-ink">
                  {readerExtraLabel(field.label, field.key)}
                </h2>
                <ExtraValue keyName={field.key} kind={field.kind} value={field.value} />
              </div>
            ))}
          </section>
        ) : null}

        {youtube || seriesLinks.length ? (
          <RecipeContinuedViewing
            watchNext={watchNext}
            seriesLinks={seriesLinks}
            recipeSlug={recipe.slug}
            recipeName={recipe.title}
            sourceVideoId={youtube?.videoId}
          />
        ) : null}

        <RecipeReviews
          slug={recipe.slug}
          title={recipe.title}
          initial={reviewData}
          defaultName={session?.user?.name ?? ""}
          defaultEmail={session?.user?.email ?? ""}
        />

        {!youtube ? (
          <RecipeFooterSubscribe recipeSlug={recipe.slug} recipeName={recipe.title} />
        ) : null}

        {recipe.categories.length ? (
          <p className="mt-4 text-sm text-muted">
            Filed under{" "}
            {recipe.categories.map((category, index) => (
              <span key={category}>
                {index > 0 ? " · " : ""}
                <Link
                  href={`/category/${category}`}
                  className="capitalize text-terracotta hover:underline"
                >
                  {category.replace(/-/g, " ")}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
      </div>

      <CollectionRow title="More from the studio" recipes={related} compactDiscovery />
    </>
  );

  return (
    <article className="min-w-0">
      <SetCurrentRecipe slug={recipe.slug} title={recipe.title} />
      <JsonLd data={recipeJsonLd(recipe, reviewData.stats)} />
      {youtube ? (
        <RecipeVideoExperience
          youtube={youtube}
          recipeSlug={recipe.slug}
          recipeName={recipe.title}
          watchNext={watchNext}
        >
          {article}
        </RecipeVideoExperience>
      ) : (
        article
      )}
    </article>
  );
}

function ExtraValue({
  keyName,
  kind,
  value,
}: {
  keyName: string;
  kind: string;
  value: unknown;
}) {
  if (value == null || value === "") return null;
  if (kind === "boolean") return <p className="mt-3 text-muted">{value ? "Yes" : "No"}</p>;
  if (kind === "image" && typeof value === "string") {
    return (
      <div className="relative mt-3 h-48 w-full overflow-hidden bg-sand">
        <Image src={value} alt="" fill className="object-cover" sizes="40vw" />
      </div>
    );
  }
  if ((kind === "gallery" || kind === "list" || kind === "tags") && Array.isArray(value)) {
    return (
      <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
        {value.map((item) => (
          <li key={String(item)}>{String(item)}</li>
        ))}
      </ul>
    );
  }
  return (
    <p className="mt-3 leading-7 text-muted">
      {formatPublicExtraFieldValue({ key: keyName, kind, value })}
    </p>
  );
}
