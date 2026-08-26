"use client";

import { trackVideoEvent } from "@/lib/video-analytics";
import { useRecipeVideo } from "./RecipeVideoContext";

export function RecipeVideoCTA() {
  const { recipeName, recipeSlug, youtube, scrollToVideo, activate } = useRecipeVideo();

  return (
    <div className="mt-6 border border-line bg-cream/50 px-5 py-4">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
        Prefer watching?
      </p>
      <button
        type="button"
        onClick={() => {
          trackVideoEvent("recipe_video_cta_click", {
            recipeSlug,
            recipeName,
            videoId: youtube.videoId,
            videoTitle: youtube.title,
            source: "hero_cta",
          });
          activate({ source: "hero_cta" });
          scrollToVideo();
        }}
        className="mt-2 font-serif text-xl text-terracotta hover:underline"
      >
        Watch {recipeName} being made →
      </button>
      <p className="mt-2 text-sm leading-6 text-muted">{youtube.videoCtaDescription}</p>
    </div>
  );
}
