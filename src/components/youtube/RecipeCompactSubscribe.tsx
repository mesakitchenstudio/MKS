"use client";

import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";

const subscribeUrl = `${site.social.youtube}?sub_confirmation=1`;

const linkFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

/** Compact left-aligned subscribe hint in collapsed Watch the method. */
export function WatchMethodSubscribeInline({
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

/** Centered conversion stage below the loaded video embed. */
export function WatchMethodSubscribeStage({
  recipeSlug,
  recipeName,
  videoId,
}: {
  recipeSlug?: string;
  recipeName?: string;
  videoId?: string;
}) {
  return (
    <div className="no-print mx-auto mt-6 max-w-xl px-2 py-2 text-center sm:px-4 sm:py-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        Like learning this way?
      </p>
      <p className="mt-2 font-serif text-xl text-ink">Cook with Mesa every week.</p>
      <p className="mt-2 text-sm leading-6 text-muted">
        New recipes, techniques and step-by-step videos.
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
        className={`mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-sm bg-olive px-6 py-2.5 text-sm font-semibold text-paper hover:bg-olive-dark sm:w-auto ${linkFocus}`}
      >
        Subscribe on YouTube →
      </a>
      <p className="mt-2 text-xs text-muted">Opens YouTube&apos;s subscription confirmation.</p>
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
