"use client";

import { formatChapterTime } from "@/lib/youtube-metadata-editor";
import { trackVideoEvent, type VideoAnalyticsSource } from "@/lib/video-analytics";
import { useRecipeVideo } from "./RecipeVideoContext";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export type RecipeVideoChaptersPlacement = "recipe_video_chapters" | "video_modal";

/**
 * Compact chapter navigation for the public recipe page / modal.
 * Returns null when the linked video has no usable chapter metadata.
 */
export function RecipeVideoChapters({
  placement = "recipe_video_chapters",
  collapsible = false,
}: {
  placement?: RecipeVideoChaptersPlacement;
  /** When true, hide the list behind a Chapters disclosure (modal). */
  collapsible?: boolean;
}) {
  const { youtube, recipeSlug, recipeName, expandWatchMethod, chapters } = useRecipeVideo();

  if (!chapters.length) return null;

  const list = (
    <ul
      className={
        placement === "recipe_video_chapters"
          ? "mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2"
          : "mt-2 space-y-0.5"
      }
    >
      {chapters.map((chapter, index) => (
        <li key={`${chapter.time}-${chapter.label}-${index}`}>
          <button
            type="button"
            className={`flex min-h-11 w-full items-baseline gap-2.5 rounded-sm px-1 py-2 text-left text-sm transition-colors hover:bg-cream/70 ${focusRing}`}
            onClick={(event) => {
              const source = placement as VideoAnalyticsSource;
              trackVideoEvent("recipe_video_timestamp_click", {
                recipeSlug,
                recipeName,
                videoId: youtube.videoId,
                videoTitle: youtube.title,
                source,
                timestamp: chapter.time,
                chapterLabel: chapter.label,
                chapterIndex: index,
              });
              expandWatchMethod({
                start: chapter.time,
                source,
                scroll: false,
                trigger: event.currentTarget,
              });
            }}
          >
            <span className="w-10 shrink-0 tabular-nums text-xs font-semibold text-muted sm:w-11">
              {formatChapterTime(chapter.time)}
            </span>
            <span className="min-w-0 leading-snug text-ink">{chapter.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  if (collapsible) {
    return (
      <details className="mt-3 group">
        <summary
          className={`cursor-pointer list-none text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive marker:content-none [&::-webkit-details-marker]:hidden ${focusRing} rounded-sm`}
        >
          <span className="inline-flex items-center gap-1.5">
            Chapters
            <span aria-hidden className="text-[0.7rem] font-normal normal-case tracking-normal text-muted transition group-open:rotate-180">
              ▾
            </span>
          </span>
        </summary>
        {list}
      </details>
    );
  }

  return (
    <div className="mt-3.5">
      <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        In this video
      </h3>
      {list}
    </div>
  );
}
