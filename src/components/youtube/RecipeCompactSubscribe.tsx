"use client";

import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";
import { trackVideoEvent } from "@/lib/video-analytics";

const subscribeUrl = `${site.social.youtube}?sub_confirmation=1`;

const linkFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

/** YouTube actions below the video modal player. */
export function WatchMethodModalActions({
  watchUrl,
  recipeSlug,
  recipeName,
  videoId,
  videoTitle,
  playlistUrl,
  playlistLabel,
  onWatchYouTube,
}: {
  watchUrl: string;
  recipeSlug: string;
  recipeName: string;
  videoId: string;
  videoTitle: string;
  playlistUrl?: string;
  playlistLabel?: string;
  onWatchYouTube?: () => void;
}) {
  return (
    <div className="no-print mt-3 border-t border-line/60 pt-3">
      <div className="flex flex-col items-center gap-2.5 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-3">
        <a
          href={subscribeUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Subscribe to Mesa Kitchen Studio on YouTube"
          onClick={() =>
            trackEvent("recipe_youtube_subscribe_click", {
              recipe_slug: recipeSlug,
              recipe_title: recipeName,
              video_id: videoId,
              source: "watch_method_subscribe",
            })
          }
          className={`inline-flex min-h-11 items-center justify-center rounded-sm bg-olive px-5 py-2.5 text-sm font-semibold text-paper hover:bg-olive-dark ${linkFocus}`}
        >
          Subscribe on YouTube
        </a>
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onWatchYouTube}
          className={`text-sm font-semibold text-muted hover:text-terracotta hover:underline ${linkFocus}`}
        >
          Watch on YouTube ↗
        </a>
      </div>
      <p className="mt-2 text-center text-xs leading-5 text-muted sm:text-sm">
        New recipes and kitchen techniques every week.
      </p>
      {playlistUrl && playlistLabel ? (
        <p className="mt-2 text-center">
          <a
            href={playlistUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackVideoEvent("recipe_youtube_playlist_click", {
                recipeSlug,
                recipeName,
                videoId,
                videoTitle,
                source: "main_embed",
              })
            }
            className={`text-xs font-semibold text-muted hover:text-olive hover:underline ${linkFocus}`}
          >
            View more {playlistLabel} →
          </a>
        </p>
      ) : null}
    </div>
  );
}

/** One-line footer subscribe for recipes without a video section. */
export function RecipeFooterSubscribe({
  recipeSlug,
  recipeName,
}: {
  recipeSlug: string;
  recipeName: string;
}) {
  return (
    <p className="no-print mt-4 text-sm text-muted">
      Cook with Mesa every week ·{" "}
      <a
        href={subscribeUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Subscribe to Mesa Kitchen Studio on YouTube"
        onClick={() =>
          trackEvent("recipe_youtube_subscribe_click", {
            recipe_slug: recipeSlug,
            recipe_title: recipeName,
            source: "recipe_end_subscribe",
          })
        }
        className={`font-semibold text-olive hover:text-terracotta hover:underline ${linkFocus}`}
      >
        Subscribe on YouTube →
      </a>
    </p>
  );
}
