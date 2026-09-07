"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

const focusRing =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

/**
 * Watch-page Recipe bridge — fires videos_recipe_click on intentional click only.
 * Navigation is never gated on analytics.
 */
export function PublicWatchRecipeCta({
  recipeSlug,
  recipeTitle,
  videoId,
  videoTitle,
  videoFormat,
}: {
  recipeSlug: string;
  recipeTitle: string;
  videoId: string;
  videoTitle: string;
  videoFormat: string;
}) {
  function onRecipeClick() {
    trackEvent("videos_recipe_click", {
      video_id: videoId,
      video_title: videoTitle,
      placement: "watch_page",
      source: videoFormat,
      recipe_slug: recipeSlug,
      recipe_title: recipeTitle,
    });
  }

  return (
    <section
      className="mt-10 border border-line bg-sand/40 px-5 py-6 md:px-7 md:py-7"
      aria-labelledby="cook-recipe-heading"
    >
      <p
        id="cook-recipe-heading"
        className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive"
      >
        Cook this recipe
      </p>
      <h2 className="mt-2 font-serif text-2xl leading-tight text-ink md:text-[1.75rem]">
        {recipeTitle}
      </h2>
      <p className="mt-2 max-w-xl text-base leading-7 text-muted">
        Get the full ingredients, instructions and cooking steps.
      </p>
      <p className="mt-5">
        <Link
          href={`/recipes/${recipeSlug}`}
          onClick={onRecipeClick}
          className={`inline-flex items-center border border-terracotta bg-terracotta px-4 py-2.5 text-sm font-semibold text-paper transition hover:border-terracotta-dark hover:bg-terracotta-dark ${focusRing}`}
        >
          View recipe
          <span className="sr-only">: {recipeTitle}</span>
        </Link>
      </p>
    </section>
  );
}
