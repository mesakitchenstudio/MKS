"use client";

import { site } from "@/data/site";
import { trackVideoEvent } from "@/lib/video-analytics";

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
        rel="noreferrer"
        onClick={() =>
          trackVideoEvent("youtube_subscribe_click", {
            recipeSlug,
            recipeName,
            source: "subscribe",
          })
        }
        className="mt-5 inline-block rounded-full bg-olive px-6 py-3 text-sm font-semibold text-paper hover:bg-olive-dark"
      >
        Subscribe on YouTube
      </a>
    </section>
  );
}
