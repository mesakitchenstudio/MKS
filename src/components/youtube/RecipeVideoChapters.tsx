"use client";

import { useEffect, useMemo, useState } from "react";
import type { RecipeYoutubeTimestamp } from "@/data/youtube-types";
import { formatChapterTime } from "@/lib/youtube-metadata-editor";
import { trackVideoEvent } from "@/lib/video-analytics";
import { useRecipeVideo } from "./RecipeVideoContext";

function normalizeChapters(timestamps: RecipeYoutubeTimestamp[] | undefined) {
  return [...(timestamps ?? [])]
    .filter((item) => item.label.trim() && item.time >= 0)
    .sort((a, b) => a.time - b.time);
}

export function RecipeVideoChapters() {
  const { youtube, recipeSlug, recipeName, activate, scrollToVideo } = useRecipeVideo();
  const initialChapters = useMemo(
    () => normalizeChapters(youtube.timestamps),
    [youtube.timestamps],
  );
  const [chapters, setChapters] = useState(initialChapters);

  useEffect(() => {
    setChapters(initialChapters);
  }, [initialChapters]);

  useEffect(() => {
    if (chapters.length || !youtube.videoId) return;

    let cancelled = false;
    fetch(`/api/youtube/chapters?videoId=${encodeURIComponent(youtube.videoId)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { timestamps?: RecipeYoutubeTimestamp[] } | null) => {
        if (cancelled || !data?.timestamps?.length) return;
        setChapters(normalizeChapters(data.timestamps));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [chapters.length, youtube.videoId]);

  if (!chapters.length) return null;

  return (
    <div className="mt-4">
      <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        Watch by step
      </h3>
      <ul className="mt-2 divide-y divide-line border border-line bg-paper">
        {chapters.map((chapter, index) => (
          <li key={`${chapter.time}-${chapter.label}-${index}`}>
            <button
              type="button"
              className="flex w-full items-baseline gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-cream/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-terracotta"
              onClick={() => {
                trackVideoEvent("recipe_video_timestamp_click", {
                  recipeSlug,
                  recipeName,
                  videoId: youtube.videoId,
                  videoTitle: youtube.title,
                  source: "main_embed_chapter",
                  timestamp: chapter.time,
                  chapterLabel: chapter.label,
                  chapterIndex: index,
                });
                activate({ start: chapter.time, source: "main_embed" });
                scrollToVideo();
              }}
            >
              <span className="shrink-0 tabular-nums text-xs font-semibold uppercase tracking-wide text-muted">
                {formatChapterTime(chapter.time)}
              </span>
              <span className="min-w-0 text-ink">{chapter.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
