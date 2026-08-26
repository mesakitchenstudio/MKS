"use client";

import type { RecipeYoutubeRelatedVideo } from "@/data/youtube-types";
import { trackVideoEvent } from "@/lib/video-analytics";
import { VideoCard } from "./VideoCard";

export function RelatedYouTubeVideos({
  videos,
  recipeSlug,
  recipeName,
}: {
  videos: RecipeYoutubeRelatedVideo[];
  recipeSlug: string;
  recipeName: string;
}) {
  if (!videos.length) return null;

  const shown = videos.slice(0, 3);

  return (
    <section className="mt-14 scroll-mt-24 border-t border-line pt-12">
      <h2 className="font-serif text-3xl text-ink">Keep cooking with us</h2>
      <p className="mt-2 text-sm text-muted">More videos that pair well with this recipe.</p>
      <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((video) => (
          <li key={video.videoId}>
            <VideoCard
              video={video}
              onClick={() => {
                trackVideoEvent("related_youtube_video_click", {
                  recipeSlug,
                  recipeName,
                  videoId: video.videoId,
                  videoTitle: video.title,
                  source: "related_videos",
                });
                window.open(video.url, "_blank", "noopener,noreferrer");
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
