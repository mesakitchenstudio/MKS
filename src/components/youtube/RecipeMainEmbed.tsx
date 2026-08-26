"use client";

import { useState } from "react";
import { trackVideoEvent } from "@/lib/video-analytics";
import { useRecipeVideo } from "./RecipeVideoContext";
import { WatchNextPrompt } from "./WatchNextPrompt";
import { YouTubeEmbedFacade } from "./YouTubeEmbedFacade";

export function RecipeMainEmbed() {
  const {
    youtube,
    recipeSlug,
    recipeName,
    active,
    playing,
    docked,
    startSeconds,
    onPlayStart,
    mainAnchorRef,
  } = useRecipeVideo();

  const [showWatchNext, setShowWatchNext] = useState(false);
  const miniPlayer = playing && !docked;
  const watchNext = youtube.relatedVideos?.[0];

  return (
    <div ref={mainAnchorRef} id="studio-video" className="mt-10 scroll-mt-24">
      <h2 className="font-serif text-3xl text-ink">Watch {recipeName} step by step</h2>
      <p className="mt-3 text-base leading-7 text-ink/90">{youtube.hook}</p>

      {miniPlayer ? <div className="mt-5 aspect-video" aria-hidden /> : null}

      <div
        className={
          miniPlayer
            ? "fixed bottom-20 right-4 z-[45] aspect-video w-[min(100vw-2rem,16rem)] overflow-hidden border border-line bg-sand shadow-[0_16px_40px_rgba(42,34,24,0.22)] sm:bottom-24 sm:right-6 sm:w-[17.5rem]"
            : "mt-5 aspect-video overflow-hidden border border-line bg-sand shadow-[0_8px_30px_rgba(42,34,24,0.08)]"
        }
        style={miniPlayer ? { paddingBottom: "env(safe-area-inset-bottom)" } : undefined}
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

      {showWatchNext && watchNext ? (
        <WatchNextPrompt next={watchNext} recipeSlug={recipeSlug} recipeName={recipeName} />
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <a
          href={youtube.watchUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() =>
            trackVideoEvent("recipe_video_cta_click", {
              recipeSlug,
              recipeName,
              videoId: youtube.videoId,
              videoTitle: youtube.title,
              source: "main_embed",
            })
          }
          className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-terracotta hover:underline"
        >
          <span aria-hidden>▶</span> Watch on YouTube
        </a>
        {youtube.playlistUrl && youtube.playlistLabel ? (
          <a
            href={youtube.playlistUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() =>
              trackVideoEvent("youtube_playlist_click", {
                recipeSlug,
                recipeName,
                videoId: youtube.videoId,
                videoTitle: youtube.title,
                source: "playlist",
              })
            }
            className="text-sm font-semibold text-olive hover:text-terracotta hover:underline"
          >
            View more {youtube.playlistLabel} →
          </a>
        ) : null}
      </div>
    </div>
  );
}
