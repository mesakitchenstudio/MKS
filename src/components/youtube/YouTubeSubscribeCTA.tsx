"use client";

import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";

export function YouTubeSubscribeCTA({
  recipeSlug,
  recipeName,
}: {
  recipeSlug?: string;
  recipeName?: string;
}) {
  const subscribeUrl = `${site.social.youtube}?sub_confirmation=1`;

  return (
    <section className="mt-12 border border-line bg-cream/40 px-6 py-8 text-center md:px-10">
      <h2 className="font-serif text-2xl text-ink md:text-3xl">Cook with Mesa every week</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
        New step-by-step recipes from our kitchen.
      </p>
      <a
        href={subscribeUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          trackEvent("recipe_youtube_subscribe_click", {
            recipe_slug: recipeSlug,
            recipe_title: recipeName,
            source: "subscribe",
          });
        }}
        className="mt-5 inline-block rounded-full bg-olive px-6 py-3 text-sm font-semibold text-paper hover:bg-olive-dark"
      >
        Subscribe on YouTube
      </a>
    </section>
  );
}
