"use client";

import Link from "next/link";
import type { PublicVideoCard } from "@/lib/public-videos/types";
import { trackEvent } from "@/lib/analytics";
import { VideoThumbnail } from "@/components/youtube/VideoThumbnail";

const focusRing =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function PublicVideoCard({
  video,
  priority = false,
  portrait = false,
}: {
  video: PublicVideoCard;
  priority?: boolean;
  portrait?: boolean;
}) {
  const watchHref = `/videos/${video.videoId}`;
  const watchLabel = video.durationDisplay
    ? `Watch ${video.title}, ${video.durationDisplay}`
    : `Watch ${video.title}`;

  function trackCardClick() {
    trackEvent("videos_card_click", {
      video_id: video.videoId,
      video_title: video.title,
      placement: portrait ? "shorts_grid" : "full_grid",
      source: video.format,
      recipe_slug: video.recipeSlug,
      recipe_title: video.recipeTitle,
    });
  }

  function trackRecipeClick() {
    trackEvent("videos_recipe_click", {
      video_id: video.videoId,
      video_title: video.title,
      placement: portrait ? "shorts_grid" : "full_grid",
      source: video.format,
      recipe_slug: video.recipeSlug,
      recipe_title: video.recipeTitle,
    });
  }

  return (
    <article className="group/card flex h-full flex-col">
      <Link
        href={watchHref}
        aria-label={watchLabel}
        onClick={trackCardClick}
        className={`group/thumb block ${focusRing}`}
      >
        <div className="relative">
          <VideoThumbnail
            src={video.thumbnailUrl}
            alt=""
            showPlay
            priority={priority}
            aspectClassName={portrait ? "aspect-[9/16]" : "aspect-video"}
            sizes={
              portrait
                ? "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            }
          />
          {video.durationDisplay ? (
            <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-ink/80 px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums text-paper">
              <span className="sr-only">Duration </span>
              {video.durationDisplay}
            </span>
          ) : null}
        </div>
        <h3 className="mt-3 line-clamp-3 font-serif text-xl leading-tight text-ink transition group-hover/card:text-terracotta md:text-[1.15rem] md:leading-snug">
          {video.title}
        </h3>
      </Link>

      {video.recipeSlug && video.recipeTitle ? (
        <p className="mt-auto pt-2 text-sm leading-6 text-muted">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-olive">
            Recipe
          </span>
          <br />
          <Link
            href={`/recipes/${video.recipeSlug}`}
            onClick={trackRecipeClick}
            className={`text-ink underline-offset-2 transition hover:text-terracotta hover:underline ${focusRing}`}
          >
            {video.recipeTitle} →
          </Link>
        </p>
      ) : null}
    </article>
  );
}
