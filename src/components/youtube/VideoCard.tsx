"use client";

import Link from "next/link";
import type { ResolvedVideoItem } from "@/lib/videos-page";
import type { VideoAnalyticsSource } from "@/lib/video-analytics";
import { trackVideoEvent } from "@/lib/video-analytics";
import { VideoThumbnail } from "./VideoThumbnail";

const focusRing =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function VideoCard({
  video,
  priority = false,
  analyticsSource,
  analyticsRecipe,
}: {
  video: ResolvedVideoItem;
  priority?: boolean;
  analyticsSource?: VideoAnalyticsSource;
  analyticsRecipe?: { slug: string; name: string; sourceVideoId?: string };
}) {
  const playable = Boolean(video.watchUrl);
  const watchLabel = `Watch “${video.title}” on YouTube`;

  function handleWatch() {
    if (!video.watchUrl) return;
    if (analyticsSource === "related_videos") {
      trackVideoEvent("recipe_related_video_click", {
        source: "related_videos",
        videoId: analyticsRecipe?.sourceVideoId || video.videoId,
        videoTitle: video.title,
        relatedVideoId: video.videoId,
        recipeSlug: analyticsRecipe?.slug,
        recipeName: analyticsRecipe?.name,
        targetRecipeId: video.recipeSlug,
      });
    } else if (analyticsSource === "videos_page") {
      trackVideoEvent("videos_page_video_click", {
        source: "videos_page",
        videoId: video.videoId,
        videoTitle: video.title,
        recipeSlug: video.recipeSlug,
        recipeName: video.recipeTitle,
      });
    }
    window.open(video.watchUrl, "_blank", "noopener,noreferrer");
  }

  const thumbnail = (
    <VideoThumbnail
      src={video.thumbnail}
      alt={video.thumbnailAlt}
      showPlay={playable}
      priority={priority}
    />
  );

  return (
    <article className="group/card">
      {playable ? (
        <button
          type="button"
          onClick={handleWatch}
          aria-label={watchLabel}
          className={`group/thumb block w-full text-left ${focusRing}`}
        >
          {thumbnail}
        </button>
      ) : (
        <div className="group/thumb">{thumbnail}</div>
      )}

      {video.category ? (
        <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
          {video.category}
        </p>
      ) : null}

      {playable ? (
        <h3 className="mt-1 font-serif text-xl leading-tight text-ink">
          <button
            type="button"
            onClick={handleWatch}
            className={`line-clamp-2 text-left transition hover:text-terracotta group-hover/card:text-terracotta ${focusRing}`}
          >
            {video.title}
          </button>
        </h3>
      ) : (
        <h3 className="mt-1 line-clamp-2 font-serif text-xl leading-tight text-ink">{video.title}</h3>
      )}

      {video.duration || video.recipeSlug ? (
        <p className="mt-2 text-xs leading-5 text-muted">
          {video.duration ? <span>{video.duration}</span> : null}
          {video.duration && video.recipeSlug ? <span aria-hidden> · </span> : null}
          {video.recipeSlug ? (
            <Link
              href={`/recipes/${video.recipeSlug}`}
              aria-label={`View ${video.recipeTitle ?? video.title} recipe`}
              className={`text-muted underline-offset-2 transition hover:text-terracotta hover:underline ${focusRing}`}
            >
              View recipe →
            </Link>
          ) : null}
        </p>
      ) : null}
    </article>
  );
}
