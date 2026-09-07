"use client";

import Link from "next/link";
import type { PublicVideoCard as PublicVideoCardType } from "@/lib/public-videos/types";
import { trackEvent } from "@/lib/analytics";
import { VideoThumbnail } from "@/components/youtube/VideoThumbnail";

const focusRing =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function PublicFeaturedVideo({ video }: { video: PublicVideoCardType }) {
  const watchHref = `/videos/${video.videoId}`;
  const watchLabel = video.durationDisplay
    ? `Watch ${video.title}, ${video.durationDisplay}`
    : `Watch ${video.title}`;

  function trackFeaturedClick() {
    trackEvent("videos_featured_click", {
      video_id: video.videoId,
      video_title: video.title,
      placement: "featured",
      source: video.format,
      recipe_slug: video.recipeSlug,
      recipe_title: video.recipeTitle,
    });
  }

  function trackRecipeClick() {
    trackEvent("videos_recipe_click", {
      video_id: video.videoId,
      video_title: video.title,
      placement: "featured",
      source: video.format,
      recipe_slug: video.recipeSlug,
      recipe_title: video.recipeTitle,
    });
  }

  return (
    <section
      className="mt-10 border-t border-line pt-10 md:mt-12 md:pt-12"
      aria-labelledby="featured-video-title"
    >
      <div className="relative grid gap-6 md:grid-cols-2 md:items-center md:gap-10">
        <Link
          href={watchHref}
          aria-label={watchLabel}
          onClick={trackFeaturedClick}
          className={`absolute inset-0 z-0 ${focusRing}`}
        />

        <div className="pointer-events-none relative z-10">
          <div className="group/thumb relative">
            <VideoThumbnail
              src={video.thumbnailUrl}
              alt=""
              showPlay
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
            />
            {video.durationDisplay ? (
              <span className="absolute bottom-3 right-3 rounded bg-ink/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-paper">
                <span className="sr-only">Duration </span>
                {video.durationDisplay}
              </span>
            ) : null}
          </div>
        </div>

        <div className="relative z-10">
          <div className="pointer-events-none">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
              Featured video
            </p>
            <h2
              id="featured-video-title"
              className="mt-2 font-serif text-[1.75rem] leading-tight text-ink md:text-[1.95rem]"
            >
              {video.title}
            </h2>
            {video.excerpt ? (
              <p className="mt-3 max-w-md text-base leading-7 text-muted">{video.excerpt}</p>
            ) : null}
          </div>

          <div className="relative z-20 mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={watchHref}
              onClick={trackFeaturedClick}
              className={`inline-flex items-center border border-terracotta bg-terracotta px-4 py-2.5 text-sm font-semibold text-paper transition hover:border-terracotta-dark hover:bg-terracotta-dark ${focusRing}`}
            >
              Watch video
            </Link>
            {video.recipeSlug && video.recipeTitle ? (
              <Link
                href={`/recipes/${video.recipeSlug}`}
                onClick={trackRecipeClick}
                className={`inline-flex items-center border border-line bg-paper px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-terracotta hover:text-terracotta ${focusRing}`}
              >
                View recipe
                <span className="sr-only">: {video.recipeTitle}</span>
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
