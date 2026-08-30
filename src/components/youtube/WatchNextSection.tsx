"use client";

import Image from "next/image";
import Link from "next/link";
import type { WatchNextRecommendation } from "@/lib/youtube-data/watch-next-select";
import { trackVideoEvent } from "@/lib/video-analytics";

export function WatchNextSection({
  next,
  recipeSlug,
  recipeName,
  sourceVideoId,
}: {
  next: WatchNextRecommendation;
  recipeSlug: string;
  recipeName: string;
  sourceVideoId: string;
}) {
  const mesaHref = next.recipeSlug ? `/recipes/${next.recipeSlug}#studio-video` : null;

  function trackWatchNext() {
    trackVideoEvent("recipe_related_video_click", {
      recipeSlug,
      recipeName,
      videoId: sourceVideoId,
      videoTitle: next.title,
      relatedVideoId: next.videoId,
      targetRecipeSlug: next.recipeSlug,
      source: "watch_next_section",
    });
  }

  return (
    <section className="mt-8 border border-line bg-sand/40 px-4 py-5 sm:px-5">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">Watch next</p>
      <p className="mt-1 text-sm text-muted">Continue cooking with Mesa</p>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative aspect-video w-full shrink-0 overflow-hidden border border-line bg-sand sm:w-44">
          <Image
            src={next.thumbnailUrl}
            alt=""
            fill
            sizes="(min-width: 640px) 11rem, 100vw"
            className="object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-xl leading-snug text-ink">{next.title}</h3>
          {next.durationDisplay ? (
            <p className="mt-1 text-xs text-muted">{next.durationDisplay}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            {mesaHref ? (
              <Link
                href={mesaHref}
                onClick={trackWatchNext}
                className="inline-flex min-h-11 items-center justify-center rounded-sm bg-olive px-4 py-2.5 text-sm font-semibold text-paper hover:bg-olive-dark"
              >
                Watch next
              </Link>
            ) : (
              <a
                href={next.watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={trackWatchNext}
                className="inline-flex min-h-11 items-center justify-center rounded-sm bg-olive px-4 py-2.5 text-sm font-semibold text-paper hover:bg-olive-dark"
              >
                Watch next
              </a>
            )}
            {mesaHref ? (
              <Link
                href={`/recipes/${next.recipeSlug}`}
                onClick={trackWatchNext}
                className="inline-flex min-h-11 items-center justify-center rounded-sm border border-line bg-paper px-4 py-2.5 text-sm font-semibold text-ink hover:border-olive hover:text-olive"
              >
                View recipe
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
