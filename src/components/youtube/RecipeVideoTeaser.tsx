"use client";

import { useRecipeVideo } from "./RecipeVideoContext";

export function RecipeVideoTeaser() {
  const { recipeName, recipeSlug, youtube, scrollToVideo, activate } = useRecipeVideo();

  return (
    <section
      aria-label="Watch the method"
      className="mt-6 overflow-hidden border border-line bg-paper"
    >
      <p className="border-b border-line bg-cream/40 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        Watch the method
      </p>
      <button
        type="button"
        onClick={() => {
          activate({ source: "recipe_top_watch" });
          scrollToVideo();
        }}
        className="flex w-full flex-col text-left sm:flex-row sm:items-stretch"
      >
        <div className="relative aspect-video w-full shrink-0 bg-sand sm:w-44 md:w-52">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={youtube.thumbnail}
            alt=""
            className="h-full w-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-ink/15">
            <span className="rounded-full bg-paper/95 px-3 py-1.5 text-xs font-semibold text-terracotta">
              ▶ Play
            </span>
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3 sm:py-4">
          <p className="font-serif text-lg leading-snug text-ink">{youtube.title}</p>
          {youtube.duration ? (
            <p className="mt-1 text-sm text-muted">{youtube.duration}</p>
          ) : null}
          <p className="mt-2 text-sm font-semibold text-terracotta">Watch step by step →</p>
        </div>
      </button>
    </section>
  );
}
