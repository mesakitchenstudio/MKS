"use client";

import type { MouseEvent } from "react";
import { RecipeCookEntry } from "@/components/cooking/RecipeCookEntry";
import { useRecipeVideoOptional } from "@/components/youtube/RecipeVideoContext";
import { trackEvent } from "@/lib/analytics";
import type { Recipe } from "@/data/types";

export function RecipePageHeroActions({
  slug,
  title,
  videoDuration,
  recipeId,
  recipeForCook,
}: {
  slug: string;
  title: string;
  videoDuration?: string;
  recipeId: string;
  recipeForCook: Pick<Recipe, "slug" | "title" | "servings" | "ingredients" | "instructions">;
}) {
  const video = useRecipeVideoOptional();

  function jumpToRecipe() {
    trackEvent("recipe_start_cooking_click", {
      recipe_slug: slug,
      recipe_title: title,
    });
    const target = document.getElementById("recipe-cooking");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function watchMethod(event: MouseEvent<HTMLButtonElement>) {
    if (video) {
      video.expandWatchMethod({
        source: "recipe_top_watch",
        scroll: false,
        trigger: event.currentTarget,
      });
      return;
    }
    document.getElementById("watch-method")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const watchLabel = videoDuration?.trim()
    ? `Watch the method · ${videoDuration.trim()}`
    : "Watch the method";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={jumpToRecipe}
        aria-label="Jump to recipe — go to ingredients and steps"
        className="no-print rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-paper hover:bg-terracotta-dark"
      >
        Jump to recipe
      </button>
      <RecipeCookEntry recipe={recipeForCook} recipeId={recipeId} />
      {video ? (
        <button
          type="button"
          onClick={watchMethod}
          aria-label={
            videoDuration?.trim()
              ? `Watch the method, ${videoDuration.trim()}`
              : "Watch the method — open video"
          }
          className="no-print rounded-full border border-olive px-4 py-2.5 text-sm font-semibold text-olive hover:bg-olive/5"
        >
          {watchLabel}
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
