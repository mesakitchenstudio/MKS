"use client";

import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";

const subscribeUrl = `${site.social.youtube}?sub_confirmation=1`;

const linkFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

/** Primary subscribe CTA in the Watch the method section. */
export function WatchMethodSubscribe({
  recipeSlug,
  recipeName,
  videoId,
  className = "",
}: {
  recipeSlug?: string;
  recipeName?: string;
  videoId?: string;
  className?: string;
}) {
  return (
    <div className={`no-print ${className}`}>
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        Like learning this way?
      </p>
      <p className="mt-1 text-sm leading-6 text-muted">
        Get new Mesa recipes and cooking techniques every week.
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
            video_id: videoId,
            source: "watch_method_subscribe",
          })
        }
        className={`mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-olive hover:text-terracotta hover:underline ${linkFocus}`}
      >
        Subscribe on YouTube →
      </a>
    </div>
  );
}

/** One-line footer subscribe for recipes without a video section. */
export function RecipeFooterSubscribe({
  recipeSlug,
  recipeName,
}: {
  recipeSlug: string;
  recipeName: string;
}) {
  return (
    <p className="no-print mt-4 text-sm text-muted">
      Cook with Mesa every week ·{" "}
      <a
        href={subscribeUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Subscribe to Mesa Kitchen Studio on YouTube"
        onClick={() =>
          trackEvent("recipe_youtube_subscribe_click", {
            recipe_slug: recipeSlug,
            recipe_title: recipeName,
            source: "recipe_end_subscribe",
          })
        }
        className={`font-semibold text-olive hover:text-terracotta hover:underline ${linkFocus}`}
      >
        Subscribe on YouTube →
      </a>
    </p>
  );
}
