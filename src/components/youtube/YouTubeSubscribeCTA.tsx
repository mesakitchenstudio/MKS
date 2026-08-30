"use client";

import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";

type SubscribePlacement = "post_video_subscribe" | "end_of_recipe";

export function YouTubeSubscribeCTA({
  recipeSlug,
  recipeName,
  videoId,
  placement = "end_of_recipe",
}: {
  recipeSlug?: string;
  recipeName?: string;
  videoId?: string;
  /** Funnel placement — one physical click maps to one placement. */
  placement?: SubscribePlacement;
}) {
  const subscribeUrl = `${site.social.youtube}?sub_confirmation=1`;
  const isPostVideo = placement === "post_video_subscribe";

  return (
    <section
      className={
        isPostVideo
          ? "mt-8 border border-line bg-cream/50 px-5 py-7 text-center md:px-8"
          : "mt-12 border border-line bg-cream/40 px-6 py-8 text-center md:px-10"
      }
    >
      {isPostVideo ? (
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-olive">
          Cook with Mesa
        </p>
      ) : null}
      <h2
        className={
          isPostVideo
            ? "mt-2 font-serif text-2xl text-ink md:text-[1.75rem]"
            : "font-serif text-2xl text-ink md:text-3xl"
        }
      >
        {isPostVideo ? "Enjoy this recipe?" : "Cook with Mesa every week"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
        {isPostVideo
          ? "Get new step-by-step recipes and kitchen techniques from Mesa Kitchen Studio."
          : "New step-by-step recipes from our kitchen."}
      </p>
      <a
        href={subscribeUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          trackEvent("recipe_youtube_subscribe_click", {
            recipe_slug: recipeSlug,
            recipe_title: recipeName,
            video_id: videoId,
            source: placement,
          });
        }}
        className="mt-5 inline-block rounded-full bg-olive px-6 py-3 text-sm font-semibold text-paper hover:bg-olive-dark"
      >
        Subscribe on YouTube
      </a>
      {isPostVideo ? (
        <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-muted">
          Opens YouTube&apos;s subscribe confirmation — Mesa does not confirm the subscription.
        </p>
      ) : null}
    </section>
  );
}
