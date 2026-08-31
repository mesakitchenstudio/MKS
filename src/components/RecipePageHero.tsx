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
import type { Recipe } from "@/data/types";
import type { ExtraField } from "@/lib/recipe-map";

export function RecipePageHero({
  recipe,
  seriesLinks,
  updated,
  reviewData,
}: {
  recipe: Recipe & { extras?: ExtraField[] };
  seriesLinks: RecipeSeriesLink[];
  updated: string;
  reviewData: RecipeReviewData;
}) {
  return (
    <header className={`${recipeContentShellClass} py-6 md:py-8`}>
      <div className="lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start lg:gap-10 xl:gap-12">
        <div className="min-w-0 order-1 lg:order-none">
          {seriesLinks.length ? (
            <div className="mb-2">
              <RecipeSeriesContext links={seriesLinks} />
            </div>
          ) : null}

          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
            {recipe.course}
          </p>

          <h1 className="mt-1 font-serif text-3xl leading-tight text-ink md:text-[2rem] lg:text-[2.125rem] xl:text-[2.375rem]">
            {recipe.title}
          </h1>

          {recipe.excerpt ? (
            <p className="mt-3 max-w-2xl text-base leading-7 text-ink/90 md:text-lg">{recipe.excerpt}</p>
          ) : null}

          <div className="mt-3">
            <RecipeRatingSummary slug={recipe.slug} initial={reviewData.stats} />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Updated {updated}</p>
            <ShareButtons title={recipe.title} slug={recipe.slug} />
          </div>

          <RecipeAtAGlanceFacts recipe={recipe} className="mt-4" />
          <RecipePageHeroActions slug={recipe.slug} title={recipe.title} />
        </div>

        <figure className="order-2 mt-5 overflow-hidden bg-sand lg:order-none lg:mt-0">
          <div className="relative aspect-video w-full lg:aspect-[5/4]">
            <Image
              src={recipe.image}
              alt={recipe.imageAlt}
              fill
              priority
              sizes="(min-width: 1024px) 42vw, 100vw"
              className="object-cover"
            />
          </div>
        </figure>
      </div>
    </header>
  );
}
