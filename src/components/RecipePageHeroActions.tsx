"use client";

import { useRecipeVideoOptional } from "@/components/youtube/RecipeVideoContext";
import { trackEvent } from "@/lib/analytics";

export function RecipePageHeroActions({
  slug,
  title,
}: {
  slug: string;
  title: string;
}) {
  const video = useRecipeVideoOptional();

  function startCooking() {
    trackEvent("recipe_start_cooking_click", {
      recipe_slug: slug,
      recipe_title: title,
    });
    const target = document.getElementById("recipe-cooking");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function watchMethod() {
    if (video) {
      video.expandWatchMethod({ source: "recipe_top_watch" });
      return;
    }
    document.getElementById("watch-method")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={startCooking}
        className="no-print rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-paper hover:bg-terracotta-dark"
      >
        Start cooking
      </button>
      {video ? (
        <button
          type="button"
          onClick={watchMethod}
          className="no-print rounded-full border border-olive px-4 py-2.5 text-sm font-semibold text-olive hover:bg-olive/5"
        >
          Watch the method
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => {
          trackEvent("recipe_print", { recipe_slug: slug, recipe_title: title });
          window.print();
        }}
        className="no-print text-sm font-semibold text-muted underline-offset-2 hover:text-terracotta hover:underline"
      >
        Print
      </button>
    </div>
  );
}
