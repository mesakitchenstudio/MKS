"use client";

import { useRef } from "react";
import { trackVideoEvent } from "@/lib/video-analytics";
import { useRecipeVideo } from "./RecipeVideoContext";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function RecipeWatchMethod() {
  const { youtube, recipeSlug, recipeName, mainAnchorRef, expandWatchMethod } = useRecipeVideo();
  const watchButtonRef = useRef<HTMLButtonElement>(null);

  function openModal(trigger?: HTMLElement | null) {
    expandWatchMethod({
      source: "recipe_top_watch",
      scroll: false,
      trigger: trigger ?? watchButtonRef.current,
    });
  }

  return (
    <section
      ref={mainAnchorRef}
      id="watch-method"
      className="mt-5 scroll-mt-24 border-t border-line/70 pt-4"
      aria-label="Watch the method"
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        Watch the method
      </p>

      <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative aspect-video w-full shrink-0 overflow-hidden border border-line/60 bg-sand sm:w-[16rem]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={youtube.thumbnail} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1 sm:py-0.5">
          <p className="font-serif text-lg leading-snug text-ink">{youtube.title}</p>
          {youtube.duration ? <p className="mt-0.5 text-sm text-muted">{youtube.duration}</p> : null}
          {youtube.hook ? (
            <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted">{youtube.hook}</p>
          ) : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              ref={watchButtonRef}
              type="button"
              aria-haspopup="dialog"
              aria-label="Watch recipe method video"
              onClick={(event) => openModal(event.currentTarget)}
              className={`no-print rounded-full border border-olive px-4 py-2 text-sm font-semibold text-olive hover:bg-olive/5 ${focusRing}`}
            >
              Watch method
            </button>
            <a
              href={youtube.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                trackVideoEvent("recipe_video_watch_youtube_click", {
                  recipeSlug,
                  recipeName,
                  videoId: youtube.videoId,
                  videoTitle: youtube.title,
                  source: "main_embed",
                })
              }
              className={`text-sm font-semibold text-muted hover:text-terracotta hover:underline ${focusRing}`}
            >
              Watch on YouTube ↗
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
