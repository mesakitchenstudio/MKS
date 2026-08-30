"use client";

import type { RecipeYoutubeRelatedVideo } from "@/data/youtube-types";
import { isSchemaVideoId } from "@/lib/recipe-youtube";
import type { ResolvedVideoItem } from "@/lib/videos-page";
import { VideoCard } from "./VideoCard";

function toResolvedVideo(video: RecipeYoutubeRelatedVideo): ResolvedVideoItem {
  const playable = isSchemaVideoId(video.videoId);
  return {
    id: video.videoId,
    title: video.title,
    category: video.label || video.category || "",
    thumbnail: video.thumbnail || video.thumbnailUrl,
    thumbnailAlt: video.title,
    watchUrl: playable ? video.url : undefined,
    videoId: playable ? video.videoId : undefined,
    duration: playable && video.duration && video.duration !== "—" ? video.duration : undefined,
  };
}

export function RelatedYouTubeVideos({
  videos,
  recipeSlug,
  recipeName,
  sourceVideoId,
}: {
  videos: RecipeYoutubeRelatedVideo[];
  recipeSlug: string;
  recipeName: string;
  sourceVideoId?: string;
}) {
  if (!videos.length) return null;

  const shown = videos.slice(0, 3).map(toResolvedVideo);

  return (
    <section className="mt-14 scroll-mt-24 border-t border-line pt-12">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">YouTube</p>
      <h2 className="mt-1 font-serif text-3xl text-ink">Keep Cooking With Us</h2>
      <p className="mt-2 text-sm text-muted">More videos that pair well with this recipe.</p>
      <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((video) => (
          <li key={video.id}>
            <VideoCard
              video={video}
              analyticsSource="related_videos"
              analyticsRecipe={{ slug: recipeSlug, name: recipeName, sourceVideoId }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
