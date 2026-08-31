"use client";

import { JumpToRecipeLink } from "@/components/JumpToRecipeLink";
import { useRecipeVideoOptional } from "@/components/youtube/RecipeVideoContext";
import { trackEvent } from "@/lib/analytics";

export function RecipeHeroActions({
  slug,
  title,
}: {
  slug: string;
  title: string;
}) {
  const video = useRecipeVideoOptional();

  function watchVideo() {
    if (!video) return;
    video.activate({ source: "recipe_top_watch" });
    video.scrollToVideo();
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <JumpToRecipeLink slug={slug} title={title} />
      {video ? (
        <button
          type="button"
          onClick={watchVideo}
          className="no-print rounded-full border border-olive bg-paper px-4 py-2 text-sm font-semibold text-olive hover:border-olive-dark hover:text-olive-dark"
        >
          Watch the video
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => {
          trackEvent("recipe_print", {
            recipe_slug: slug,
            recipe_title: title,
          });
          window.print();
        }}
        className="no-print text-sm font-semibold text-muted underline-offset-2 hover:text-terracotta hover:underline"
      >
        Print
      </button>
    </div>
  );
}
