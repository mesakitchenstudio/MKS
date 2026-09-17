"use client";

import type { MouseEvent } from "react";
import { formatTimestampInput } from "@/lib/youtube-metadata-editor";
import { formatVideoTimestampAccessible } from "@/lib/step-video-timestamps";
import { trackVideoEvent } from "@/lib/video-analytics";
import { youtubeWatchUrlAt } from "@/lib/youtube";
import { useRecipeVideoOptional } from "./RecipeVideoContext";

/** True for modifier / non-primary activations that must keep native anchor behavior. */
export function isModifiedLinkActivation(event: {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
}): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  );
}

/**
 * Progressive-enhancement #10 per-step video timestamp control.
 * Real YouTube timestamp href + in-page seek via RecipeVideoContext when available.
 * Does not replace legacy VideoTimestampLink (Cooking Mode / chapter stepIndex links).
 */
export function RecipeStepVideoTimestampLink({
  seconds,
  videoId,
  recipeSlug,
  recipeName,
  videoTitle,
  stepNumber,
}: {
  seconds: number;
  videoId: string;
  recipeSlug?: string;
  recipeName?: string;
  videoTitle?: string;
  /** Visible 1-based step number when known. */
  stepNumber?: number;
}) {
  const ctx = useRecipeVideoOptional();
  const href = youtubeWatchUrlAt(videoId, seconds);
  if (!href || !Number.isFinite(seconds) || seconds < 0) return null;

  const clock = formatTimestampInput(seconds);
  const accessibleTime = formatVideoTimestampAccessible(seconds);
  const ariaLabel =
    stepNumber != null
      ? `Watch step ${stepNumber} in the video at ${accessibleTime}`
      : `Watch this step in the video at ${accessibleTime}`;

  return (
    <a
      href={href}
      className="no-print mt-1.5 inline-flex max-w-full items-baseline gap-1 text-xs font-semibold text-terracotta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
      aria-label={ariaLabel}
      data-testid="recipe-step-video-timestamp"
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (isModifiedLinkActivation(event)) return;
        if (!ctx) return;

        event.preventDefault();
        trackVideoEvent("recipe_video_timestamp_click", {
          recipeSlug,
          recipeName,
          videoId,
          videoTitle,
          source: "instruction_timestamp",
          timestamp: seconds,
          chapterLabel: `Watch at ${clock}`,
        });
        try {
          ctx.expandWatchMethod({
            start: seconds,
            source: "instruction_timestamp",
            scroll: true,
          });
        } catch {
          window.location.assign(href);
        }
      }}
    >
      Watch at {clock}
    </a>
  );
}
