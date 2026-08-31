"use client";

import Image from "next/image";
import Link from "next/link";
import type { WatchNextRecommendation } from "@/lib/youtube-data/watch-next-select";
import type { RecipeSeriesLink } from "@/lib/series-types";
import { trackVideoEvent } from "@/lib/video-analytics";

function sameDestination(
  watchNext: WatchNextRecommendation | null,
  seriesLink: RecipeSeriesLink | null,
): boolean {
  if (!watchNext?.recipeSlug || !seriesLink?.nextItem?.recipeSlug) return false;
  return watchNext.recipeSlug === seriesLink.nextItem.recipeSlug;
}

export function RecipeContinuedViewing({
  watchNext,
  seriesLinks,
  recipeSlug,
  recipeName,
  sourceVideoId,
}: {
  watchNext: WatchNextRecommendation | null;
  seriesLinks: RecipeSeriesLink[];
  recipeSlug: string;
  recipeName: string;
  sourceVideoId?: string;
}) {
  const primarySeries = seriesLinks[0] ?? null;
  const seriesNext = primarySeries?.nextItem ?? null;
  const merged = watchNext && primarySeries && sameDestination(watchNext, primarySeries);

  if (merged && watchNext && primarySeries) {
    return (
      <ContinuedCard
        eyebrow={`Next in ${primarySeries.shortTitle || primarySeries.title}`}
        title={watchNext.title}
        thumbnailUrl={watchNext.thumbnailUrl}
        durationDisplay={watchNext.durationDisplay}
        recipeSlug={watchNext.recipeSlug}
        watchUrl={watchNext.watchUrl}
        nextVideoId={watchNext.videoId}
        recipeSlugCurrent={recipeSlug}
        recipeName={recipeName}
        sourceVideoId={sourceVideoId || ""}
        analyticsSource="series_next"
      />
    );
  }

  if (seriesNext?.recipeSlug) {
    return (
      <ContinuedCard
        eyebrow={`Next in ${primarySeries!.shortTitle || primarySeries!.title}`}
        title={seriesNext.title}
        thumbnailUrl={watchNext?.thumbnailUrl}
        durationDisplay={watchNext?.durationDisplay}
        recipeSlug={seriesNext.recipeSlug}
        watchUrl={
          seriesNext.youtubeVideoId
            ? `https://www.youtube.com/watch?v=${seriesNext.youtubeVideoId}`
            : watchNext?.watchUrl
        }
        nextVideoId={seriesNext.youtubeVideoId || watchNext?.videoId}
        recipeSlugCurrent={recipeSlug}
        recipeName={recipeName}
        sourceVideoId={sourceVideoId || ""}
        analyticsSource="series_next"
      />
    );
  }

  if (watchNext) {
    return (
      <ContinuedCard
        eyebrow="Watch next"
        title={watchNext.title}
        thumbnailUrl={watchNext.thumbnailUrl}
        durationDisplay={watchNext.durationDisplay}
        recipeSlug={watchNext.recipeSlug}
        watchUrl={watchNext.watchUrl}
        nextVideoId={watchNext.videoId}
        recipeSlugCurrent={recipeSlug}
        recipeName={recipeName}
        sourceVideoId={sourceVideoId || ""}
        analyticsSource="watch_next_section"
      />
    );
  }

  return null;
}

function ContinuedCard({
  eyebrow,
  title,
  thumbnailUrl,
  durationDisplay,
  recipeSlug,
  watchUrl,
  nextVideoId,
  recipeSlugCurrent,
  recipeName,
  sourceVideoId,
  analyticsSource,
}: {
  eyebrow: string;
  title: string;
  thumbnailUrl?: string;
  durationDisplay?: string;
  recipeSlug?: string | null;
  watchUrl?: string;
  nextVideoId?: string;
  recipeSlugCurrent: string;
  recipeName: string;
  sourceVideoId: string;
  analyticsSource: "series_next" | "watch_next_section";
}) {
  function trackClick() {
    trackVideoEvent("recipe_related_video_click", {
      recipeSlug: recipeSlugCurrent,
      recipeName,
      videoId: sourceVideoId,
      videoTitle: title,
      relatedVideoId: nextVideoId || sourceVideoId,
      targetRecipeSlug: recipeSlug || undefined,
      source: analyticsSource,
    });
  }

  const videoHref = recipeSlug ? `/recipes/${recipeSlug}#watch-method` : watchUrl;

  return (
    <section className="mt-10 border border-line bg-sand/40 px-4 py-5 sm:px-5">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        {eyebrow}
      </p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        {thumbnailUrl ? (
          <div className="relative aspect-video w-full shrink-0 overflow-hidden border border-line bg-sand sm:w-44">
            <Image src={thumbnailUrl} alt="" fill sizes="(min-width: 640px) 11rem, 100vw" className="object-cover" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-xl leading-snug text-ink">{title}</h3>
          {durationDisplay ? <p className="mt-1 text-xs text-muted">{durationDisplay}</p> : null}
          <div className="mt-4 flex flex-wrap gap-3">
            {recipeSlug ? (
              <Link
                href={`/recipes/${recipeSlug}`}
                onClick={trackClick}
                className="inline-flex min-h-11 items-center justify-center rounded-sm bg-olive px-4 py-2.5 text-sm font-semibold text-paper hover:bg-olive-dark"
              >
                View recipe
              </Link>
            ) : null}
            {videoHref ? (
              recipeSlug ? (
                <Link
                  href={videoHref}
                  onClick={trackClick}
                  className="inline-flex min-h-11 items-center justify-center rounded-sm border border-line bg-paper px-4 py-2.5 text-sm font-semibold text-ink hover:border-olive hover:text-olive"
                >
                  Watch video
                </Link>
              ) : (
                <a
                  href={videoHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={trackClick}
                  className="inline-flex min-h-11 items-center justify-center rounded-sm border border-line bg-paper px-4 py-2.5 text-sm font-semibold text-ink hover:border-olive hover:text-olive"
                >
                  Watch video
                </a>
              )
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
