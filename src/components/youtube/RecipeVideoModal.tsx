"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { trackVideoEvent } from "@/lib/video-analytics";
import { RecipeVideoChapters } from "./RecipeVideoChapters";
import { WatchMethodModalActions } from "./RecipeCompactSubscribe";
import { useRecipeVideo } from "./RecipeVideoContext";
import { WatchNextPrompt } from "./WatchNextPrompt";
import { YouTubeEmbedFacade } from "./YouTubeEmbedFacade";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function RecipeVideoModal() {
  const {
    youtube,
    recipeSlug,
    recipeName,
    watchNext,
    expanded,
    active,
    startSeconds,
    collapseWatchMethod,
    onPlayStart,
    takeLastTrigger,
  } = useRecipeVideo();

  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [showWatchNext, setShowWatchNext] = useState(false);

  const closeModal = useCallback(() => {
    collapseWatchMethod();
    setShowWatchNext(false);
  }, [collapseWatchMethod]);

  useEffect(() => {
    if (!expanded) return;

    previousFocus.current = takeLastTrigger() ?? (document.activeElement as HTMLElement | null);
    closeRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus?.();
    };
  }, [closeModal, expanded, takeLastTrigger]);

  if (!expanded) return null;

  return (
    <div
      className="no-print fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-ink/70 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[100dvh] w-full max-w-4xl flex-col overflow-y-auto bg-paper shadow-[0_24px_64px_rgba(16,12,8,0.35)] sm:my-auto sm:max-h-[calc(100vh-2rem)] sm:rounded-sm sm:border sm:border-line/80"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={closeModal}
          aria-label="Close recipe video"
          className={`absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-line/80 bg-paper/95 text-xl font-semibold leading-none text-ink shadow-md transition-colors hover:bg-cream sm:right-3 sm:top-3 ${focusRing}`}
        >
          <span aria-hidden>×</span>
        </button>

        <div className="border-b border-line/60 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <p id={titleId} className="pr-12 font-serif text-lg text-ink sm:text-xl">
            Watch the method
          </p>
          {youtube.hook ? (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{youtube.hook}</p>
          ) : null}
        </div>

        <div className="px-4 py-4 sm:px-5">
          <div className="relative aspect-video overflow-hidden bg-ink">
            <YouTubeEmbedFacade
              key={active ? `${youtube.videoId}-${startSeconds}` : `${youtube.videoId}-poster`}
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

          <WatchMethodModalActions
            watchUrl={youtube.watchUrl}
            recipeSlug={recipeSlug}
            recipeName={recipeName}
            videoId={youtube.videoId}
            videoTitle={youtube.title}
            playlistUrl={youtube.playlistUrl}
            playlistLabel={youtube.playlistLabel}
            onWatchYouTube={() =>
              trackVideoEvent("recipe_video_watch_youtube_click", {
                recipeSlug,
                recipeName,
                videoId: youtube.videoId,
                videoTitle: youtube.title,
                source: "main_embed",
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
