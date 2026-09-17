import Image from "next/image";
import Link from "next/link";
import { AdSlot } from "@/components/ads/AdSlot";
import { CollectionRow } from "@/components/CollectionRow";
import { JsonLd } from "@/components/JsonLd";
import { RecipeContentShell } from "@/components/RecipeContentShell";
import { RecipeCookingWorkspace } from "@/components/RecipeCard";
import { RecipeLearnSection } from "@/components/RecipeLearnSection";
import { RecipePageHero } from "@/components/RecipePageHero";
import { RecipeReviews } from "@/components/RecipeReviews";
import { RecipeQuestionsSection } from "@/components/recipe/RecipeQuestionsSection";
import { RecipeSectionNav } from "@/components/RecipeSectionNav";
import { SetCurrentRecipe } from "@/components/RecipeFloatTools";
import { RecipeContinuedViewing } from "@/components/youtube/RecipeContinuedViewing";
import { RecipeFooterSubscribe } from "@/components/youtube/RecipeCompactSubscribe";
import { RecipeVideoExperience } from "@/components/youtube/RecipeVideoExperience";
import { RecipeWatchMethod } from "@/components/youtube/RecipeWatchMethod";
import { isSitePrivate } from "@/lib/flags";
import { fieldValueHasContent, formatPublicExtraFieldValue } from "@/lib/field-content";
import { publicExtrasForPage, readerExtraLabel } from "@/lib/recipe-timing";
import type { Recipe } from "@/data/types";
import type { RecipeReviewData } from "@/lib/recipe-reviews";
import type { PublicRecipe } from "@/lib/recipes";
import { publicRecipeId } from "@/lib/recipes";
import { recipeJsonLd } from "@/lib/schema";
import type { RecipeSeriesLink } from "@/lib/series-types";
import type { StudioLessonSummary } from "@/lib/studio-types";
import type { WatchNextRecommendation } from "@/lib/youtube-data/watch-next";
import type { ResolvedRecipeYoutube } from "@/data/youtube-types";
import type { StageVideoHelp } from "@/lib/recipe-stage-video-help";

export type RecipeDetailMode = "public" | "preview";

export type RecipeDetailViewProps = {
  mode?: RecipeDetailMode;
  recipe: PublicRecipe;
  seriesLinks: RecipeSeriesLink[];
  reviewData: RecipeReviewData;
  youtube: ResolvedRecipeYoutube | null;
  watchNext: WatchNextRecommendation | null;
  related: Recipe[];
  studioLessons: StudioLessonSummary[];
  initialStageVideoHelp: Record<string, StageVideoHelp>;
  defaultName?: string;
  defaultEmail?: string;
  verifiedTargetReviewId?: string | null;
  shoppingListEnabled?: boolean;
  mealPlannerEnabled?: boolean;
  /** Roadmap #9 — server-derived gate; never NEXT_PUBLIC. */
  recipeQaEnabled?: boolean;
  /** Roadmap #10 — server-derived gate; never NEXT_PUBLIC. */
  stepTimestampsEnabled?: boolean;
  /** groupIndex:itemIndex → Ingredient slug for indexable SEO links (public only). */
  ingredientSeoLinks?: Record<string, string>;
};

export function RecipeDetailView({
  mode = "public",
  recipe,
  seriesLinks,
  reviewData,
  youtube,
  watchNext,
  related,
  studioLessons,
  initialStageVideoHelp,
  defaultName = "",
  defaultEmail = "",
  verifiedTargetReviewId = null,
  shoppingListEnabled = false,
  mealPlannerEnabled = false,
  recipeQaEnabled = false,
  stepTimestampsEnabled = false,
  ingredientSeoLinks = {},
}: RecipeDetailViewProps) {
  const preview = mode === "preview";
  const visibleExtrasList = publicExtrasForPage(recipe).filter((field) =>
    fieldValueHasContent(field.value, field.kind),
  );
  const hasLearn =
    Boolean(recipe.whyItWorks.trim()) ||
    recipe.keyIngredients.length > 0 ||
    recipe.tips.length > 0 ||
    studioLessons.length > 0;

  const article = (
    <>
      <RecipePageHero
        recipe={recipe}
        seriesLinks={seriesLinks}
        reviewData={reviewData}
        videoDuration={youtube?.duration}
        preview={preview}
      />

      <RecipeSectionNav hasVideo={Boolean(youtube)} hasLearn={hasLearn} />

      <RecipeCookingWorkspace
        recipe={recipe}
        youtube={youtube}
        initialStageVideoHelp={initialStageVideoHelp}
        shoppingListEnabled={shoppingListEnabled}
        mealPlannerEnabled={mealPlannerEnabled && !preview}
        ingredientSeoLinks={preview ? {} : ingredientSeoLinks}
        stepTimestampsEnabled={stepTimestampsEnabled}
      />

      {preview ? null : (
        <AdSlot
          placement="recipe_detail_mid"
          pathname={`/recipes/${recipe.slug}`}
          sitePrivate={isSitePrivate()}
        />
      )}

      <RecipeContentShell className="pb-6">
        <RecipeLearnSection
          whyItWorks={recipe.whyItWorks}
          keyIngredients={recipe.keyIngredients}
          tips={recipe.tips}
          studioLessons={studioLessons}
        />

        {youtube ? <RecipeWatchMethod /> : null}

        {youtube || seriesLinks.length ? (
          <RecipeContinuedViewing
            watchNext={watchNext}
            seriesLinks={seriesLinks}
            recipeSlug={recipe.slug}
            recipeName={recipe.title}
            sourceVideoId={youtube?.videoId}
          />
        ) : null}

        {recipe.faqs.length ? (
          <section id="faqs" className="no-print mt-8 scroll-mt-24">
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
          <section className="no-print mt-8">
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

        <RecipeReviews
          slug={recipe.slug}
          title={recipe.title}
          initial={reviewData}
          defaultName={defaultName}
          defaultEmail={defaultEmail}
          targetReviewId={verifiedTargetReviewId}
          interactionDisabled={preview}
        />

        {recipeQaEnabled && !preview && recipe.id?.trim() ? (
          <RecipeQuestionsSection
            recipeId={recipe.id.trim()}
            recipeSlug={recipe.slug}
            recipeTitle={recipe.title}
          />
        ) : null}

        {!youtube && !preview ? (
          <RecipeFooterSubscribe recipeSlug={recipe.slug} recipeName={recipe.title} />
        ) : null}

        {recipe.categories.length ? (
          <p className="no-print mt-4 text-sm text-muted">
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
      </RecipeContentShell>

      {preview ? null : (
        <AdSlot
          placement="recipe_detail_after_recipe"
          pathname={`/recipes/${recipe.slug}`}
          sitePrivate={isSitePrivate()}
        />
      )}

      <div className="no-print">
        <CollectionRow title="More from the studio" recipes={related} compactDiscovery />
      </div>
    </>
  );

  return (
    <article className="min-w-0">
      {preview ? null : (
        <SetCurrentRecipe
          slug={recipe.slug}
          title={recipe.title}
          id={publicRecipeId(recipe)}
          image={recipe.image}
          imageAlt={recipe.imageAlt}
        />
      )}
      {preview ? null : <JsonLd data={recipeJsonLd(recipe, reviewData.stats)} />}
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
