"use client";

import { useState } from "react";
import { trackVideoEvent } from "@/lib/video-analytics";
import { useRecipeVideo } from "./RecipeVideoContext";
import { RecipeVideoChapters } from "./RecipeVideoChapters";
import { WatchNextPrompt } from "./WatchNextPrompt";
import { YouTubeEmbedFacade } from "./YouTubeEmbedFacade";
import {
  WatchMethodSubscribeInline,
  WatchMethodSubscribeStage,
} from "./RecipeCompactSubscribe";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

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
    floatingDismissed,
    startSeconds,
    onPlayStart,
    mainAnchorRef,
    expandWatchMethod,
    collapseWatchMethod,
    onCloseFloating,
  } = useRecipeVideo();

  const [showWatchNext, setShowWatchNext] = useState(false);
  const miniPlayer = playing && !docked && expanded && !floatingDismissed;
  const panelId = "watch-method-panel";

  function openExpanded() {
    expandWatchMethod({ source: "recipe_top_watch" });
  }

  function collapseVideo() {
    collapseWatchMethod();
    setShowWatchNext(false);
  }

  return (
    <section
      ref={mainAnchorRef}
      id="watch-method"
      className="mt-6 scroll-mt-24"
      aria-label="Watch the method"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
          Watch the method
        </p>
        {expanded ? (
          <button
            type="button"
            aria-expanded={true}
            aria-controls={panelId}
            aria-label="Collapse recipe video"
            onClick={collapseVideo}
            className={`no-print shrink-0 text-sm font-semibold text-muted hover:text-terracotta ${focusRing}`}
          >
            Collapse video ↑
          </button>
        ) : null}
      </div>

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
              aria-expanded={false}
              aria-controls={panelId}
              aria-label="Expand recipe video"
              onClick={openExpanded}
              className={`no-print mt-3 self-start rounded-full border border-olive px-4 py-2 text-sm font-semibold text-olive hover:bg-olive/5 ${focusRing}`}
            >
              Watch step by step
            </button>
            <WatchMethodSubscribeInline
              recipeSlug={recipeSlug}
              recipeName={recipeName}
              videoId={youtube.videoId}
              className="mt-4"
            />
          </div>
        </div>
      ) : (
        <div id={panelId} className="mt-3">
          <p className="text-base leading-7 text-muted">{youtube.hook}</p>

          <div className="mx-auto mt-3 max-w-3xl">
            {miniPlayer ? <div className="aspect-video" aria-hidden /> : null}

            <div
              className={
                miniPlayer
                  ? "fixed bottom-20 right-4 z-[45] aspect-video w-[min(100vw-2rem,16rem)] overflow-hidden border border-line bg-sand shadow-[0_16px_40px_rgba(42,34,24,0.22)] sm:bottom-24 sm:right-6 sm:w-[17.5rem]"
                  : "relative aspect-video overflow-hidden border border-line bg-sand"
              }
            >
              {miniPlayer ? (
                <button
                  type="button"
                  aria-label="Close video"
                  title="Close video"
                  onClick={onCloseFloating}
                  className={`no-print absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-paper/95 text-lg font-semibold leading-none text-ink shadow-md transition-colors hover:bg-cream ${focusRing}`}
                >
                  <span aria-hidden>×</span>
                </button>
              ) : null}
              <YouTubeEmbedFacade
                key={
                  active
                    ? `${youtube.videoId}-${startSeconds}`
                    : `${youtube.videoId}-poster`
                }
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

            {showWatchNext && watchNext ? (
              <WatchNextPrompt
                next={watchNext}
                recipeSlug={recipeSlug}
                recipeName={recipeName}
                sourceVideoId={youtube.videoId}
              />
            ) : null}

            <RecipeVideoChapters />

            <div className="mt-4 text-center">
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
              {youtube.playlistUrl && youtube.playlistLabel ? (
                <p className="mt-2">
                  <a
                    href={youtube.playlistUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-xs font-semibold text-muted hover:text-olive hover:underline ${focusRing}`}
                  >
                    View more {youtube.playlistLabel} →
                  </a>
                </p>
              ) : null}
            </div>

            <WatchMethodSubscribeStage
              recipeSlug={recipeSlug}
              recipeName={recipeName}
              videoId={youtube.videoId}
            />
          </div>
        </div>
      )}
    </section>
  );
}
