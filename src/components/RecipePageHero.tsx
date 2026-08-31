"use client";

import Image from "next/image";
import type { RecipeReviewData } from "@/lib/recipe-reviews";
import type { RecipeSeriesLink } from "@/lib/series-types";
import { RecipeRatingSummary } from "@/components/RecipeRatingSummary";
import { RecipeSeriesContext } from "@/components/series/RecipeSeriesContext";
import { ShareButtons } from "@/components/ShareButtons";
import { RecipeAtAGlanceFacts } from "@/components/RecipeAtAGlanceFacts";
import { RecipePageHeroActions } from "@/components/RecipePageHeroActions";
import { recipeContentShellClass } from "@/components/RecipeContentShell";
import { resolveRecipeDishIdentity } from "@/lib/recipe-dish-identity";
import type { Recipe } from "@/data/types";
import type { ExtraField } from "@/lib/recipe-map";

export function RecipePageHero({
  recipe,
  seriesLinks,
  updated,
  reviewData,
  videoDuration,
}: {
  recipe: Recipe & { extras?: ExtraField[] };
  seriesLinks: RecipeSeriesLink[];
  updated: string;
  reviewData: RecipeReviewData;
  videoDuration?: string;
}) {
  const dishIdentity = resolveRecipeDishIdentity(recipe);

  return (
    <header className={`${recipeContentShellClass} py-5 md:pt-6 md:pb-3 lg:pt-5 lg:pb-2`}>
      <p className="recipe-print-brand mb-2 hidden text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink print:block">
        Mesa Kitchen Studio
      </p>
      <div className="lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start lg:gap-10 xl:gap-12">
        <div className="min-w-0 order-1 lg:order-none">
          {seriesLinks.length ? (
            <div className="no-print mb-1.5">
              <RecipeSeriesContext links={seriesLinks} />
            </div>
          ) : null}

          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
            {recipe.course}
          </p>

          {dishIdentity ? (
            <p className="mt-1 font-serif text-xl leading-snug text-ink/90 md:text-[1.35rem]">
              {dishIdentity}
            </p>
          ) : null}

          <h1
            className={`font-serif leading-tight text-ink md:text-[2rem] lg:text-[2.125rem] xl:text-[2.375rem] ${
              dishIdentity ? "mt-1 text-[1.65rem] md:text-[1.85rem] lg:text-[2rem] xl:text-[2.15rem]" : "mt-1 text-3xl"
            }`}
          >
            {recipe.title}
          </h1>

          {recipe.excerpt ? (
            <p className="no-print mt-2 max-w-2xl text-base leading-7 text-ink/90 md:text-[1.05rem]">
              {recipe.excerpt}
            </p>
          ) : null}

          <div className="no-print">
            <RecipeRatingSummary slug={recipe.slug} initial={reviewData.stats} />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Updated {updated}</p>
            <ShareButtons title={recipe.title} slug={recipe.slug} />
          </div>

          <RecipeAtAGlanceFacts recipe={recipe} className="mt-3 recipe-print-meta" />
          <RecipePageHeroActions
            slug={recipe.slug}
            title={recipe.title}
            videoDuration={videoDuration}
          />
        </div>

        <figure className="recipe-hero-figure no-print order-2 mt-4 lg:order-none lg:mt-0">
          <div className="border border-line bg-paper p-1">
            <div className="relative aspect-video w-full overflow-hidden bg-sand lg:aspect-[5/4]">
              <Image
                src={recipe.image}
                alt={recipe.imageAlt}
                fill
                priority
                sizes="(min-width: 1024px) 42vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </figure>
      </div>
    </header>
  );
}
