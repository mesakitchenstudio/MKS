"use client";

import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";
import { useRecipeVideoOptional } from "@/components/youtube/RecipeVideoContext";

const subscribeUrl = `${site.social.youtube}?sub_confirmation=1`;

const linkFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

/** Inline subscribe link shown after the visitor expands or plays the video. */
export function RecipeCompactSubscribe({
  recipeSlug,
  recipeName,
  videoId,
}: {
  recipeSlug?: string;
  recipeName?: string;
  videoId?: string;
}) {
  return (
    <p className="no-print mt-4 text-sm text-muted">
      Enjoyed the method?{" "}
      <a
        href={subscribeUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Subscribe to Mesa Kitchen Studio on YouTube"
        onClick={() =>
          trackEvent("recipe_youtube_subscribe_click", {
            recipe_slug: recipeSlug,
            recipe_title: recipeName,
            video_id: videoId,
            source: "post_video_subscribe",
          })
        }
        className={`font-semibold text-olive hover:text-terracotta hover:underline ${linkFocus}`}
      >
        Subscribe to Mesa on YouTube →
      </a>
    </p>
  );
}

/** Compact card after Ratings when the visitor has not interacted with the video. */
export function RecipeEndSubscribe({
  recipeSlug,
  recipeName,
}: {
  recipeSlug: string;
  recipeName: string;
}) {
  const video = useRecipeVideoOptional();
  if (video?.videoInteracted) return null;

  return (
    <section
      aria-labelledby="recipe-subscribe-heading"
      className="no-print mt-8 border border-line bg-cream/40 px-4 py-5 sm:px-5"
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        Cook with Mesa
      </p>
      <h3 id="recipe-subscribe-heading" className="mt-2 font-serif text-xl leading-snug text-ink">
        New recipes, step by step
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        Follow Mesa Kitchen Studio on YouTube for new cooking videos and kitchen techniques every
        week.
      </p>
      <a
        href={subscribeUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Subscribe to Mesa Kitchen Studio on YouTube"
        onClick={() =>
          trackEvent("recipe_youtube_subscribe_click", {
            recipe_slug: recipeSlug,
            recipe_title: recipeName,
            source: "post_recipe_subscribe",
          })
        }
        className={`mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-sm bg-olive px-5 py-2.5 text-sm font-semibold text-paper hover:bg-olive-dark sm:w-auto ${linkFocus}`}
      >
        Subscribe on YouTube →
      </a>
    </section>
  );
}
