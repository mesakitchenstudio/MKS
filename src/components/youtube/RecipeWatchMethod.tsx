"use client";

import { useState } from "react";
import { trackVideoEvent } from "@/lib/video-analytics";
import { useRecipeVideo } from "./RecipeVideoContext";
import { RecipeVideoChapters } from "./RecipeVideoChapters";
import { WatchNextPrompt } from "./WatchNextPrompt";
import { YouTubeEmbedFacade } from "./YouTubeEmbedFacade";
import { RecipeCompactSubscribe } from "./RecipeCompactSubscribe";

export function RecipeWatchMethod() {
  const {
    youtube,
    recipeSlug,
    recipeName,
    watchNext,
    active,
    playing,
    docked,
    expanded,
    startSeconds,
    onPlayStart,
    mainAnchorRef,
    expandWatchMethod,
    activate,
    videoInteracted,
  } = useRecipeVideo();

  const [showWatchNext, setShowWatchNext] = useState(false);
  const miniPlayer = playing && !docked && expanded;

  function openExpanded() {
    expandWatchMethod({ source: "recipe_top_watch" });
  }

  function startPlayback() {
    expandWatchMethod({ source: "recipe_top_watch", scroll: false });
    activate({ source: "recipe_top_watch" });
  }

  return (
    <section
      ref={mainAnchorRef}
      id="watch-method"
      className="mt-8 scroll-mt-24"
      aria-label="Watch the method"
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        Watch the method
      </p>

      {!expanded ? (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-sand sm:w-48">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={youtube.thumbnail} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <p className="font-serif text-lg leading-snug text-ink">{youtube.title}</p>
            {youtube.duration ? <p className="mt-1 text-sm text-muted">{youtube.duration}</p> : null}
            {youtube.hook ? <p className="mt-2 line-clamp-2 text-sm text-muted">{youtube.hook}</p> : null}
            <button
              type="button"
              onClick={openExpanded}
              className="no-print mt-3 self-start rounded-full border border-olive px-4 py-2 text-sm font-semibold text-olive hover:bg-olive/5"
            >
              Watch step by step
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-base leading-7 text-muted">{youtube.hook}</p>

          {miniPlayer ? <div className="mt-4 aspect-video" aria-hidden /> : null}

          <div
            className={
              miniPlayer
                ? "fixed bottom-20 right-4 z-[45] aspect-video w-[min(100vw-2rem,16rem)] overflow-hidden border border-line bg-sand shadow-[0_16px_40px_rgba(42,34,24,0.22)] sm:bottom-24 sm:right-6 sm:w-[17.5rem]"
                : "mt-4 aspect-video overflow-hidden border border-line bg-sand"
            }
          >
            <YouTubeEmbedFacade
              key={active ? `${youtube.videoId}-${startSeconds}` : youtube.videoId}
              videoId={youtube.videoId}
              title={youtube.title}
              thumbnail={youtube.thumbnail}
              duration={youtube.duration}
              startSeconds={active ? startSeconds : 0}
              forceLoad={active}
              onPlayStart={onPlayStart}
              onNearComplete={() => watchNext && setShowWatchNext(true)}
              analytics={{
                recipeSlug,
                recipeName,
                videoTitle: youtube.title,
              }}
            />
          </div>

          {!active ? (
            <button
              type="button"
              onClick={startPlayback}
              className="no-print mt-3 text-sm font-semibold text-terracotta hover:underline"
            >
              Load and play video
            </button>
          ) : null}

          {showWatchNext && watchNext ? (
            <WatchNextPrompt
              next={watchNext}
              recipeSlug={recipeSlug}
              recipeName={recipeName}
              sourceVideoId={youtube.videoId}
            />
          ) : null}

          <RecipeVideoChapters />

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <a
              href={youtube.watchUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                trackVideoEvent("recipe_video_watch_youtube_click", {
                  recipeSlug,
                  recipeName,
                  videoId: youtube.videoId,
                  videoTitle: youtube.title,
                  source: "main_embed",
                })
              }
              className="text-sm font-semibold text-terracotta hover:underline"
            >
              Watch on YouTube →
            </a>
            {youtube.playlistUrl && youtube.playlistLabel ? (
              <a
                href={youtube.playlistUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-olive hover:text-terracotta hover:underline"
              >
                View more {youtube.playlistLabel} →
              </a>
            ) : null}
          </div>

          {videoInteracted ? (
            <RecipeCompactSubscribe
              recipeSlug={recipeSlug}
              recipeName={recipeName}
              videoId={youtube.videoId}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
