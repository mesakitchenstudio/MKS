"use client";

import Image from "next/image";
import Link from "next/link";
import type { WatchNextRecommendation } from "@/lib/youtube-data/watch-next-select";
import type { RecipeSeriesLink } from "@/lib/series-types";
import { trackVideoEvent } from "@/lib/video-analytics";

const linkFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

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
      <ContinuedStrip
        seriesSlug={primarySeries.slug}
        seriesTitle={primarySeries.shortTitle || primarySeries.title}
        title={watchNext.title}
        subtitle={watchNext.recipeTitle}
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
      <ContinuedStrip
        seriesSlug={primarySeries!.slug}
        seriesTitle={primarySeries!.shortTitle || primarySeries!.title}
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
      <ContinuedStrip
        title={watchNext.title}
        subtitle={watchNext.recipeTitle}
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

function ContinuedStrip({
  seriesSlug,
  seriesTitle,
  title,
  subtitle,
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
  seriesSlug?: string;
  seriesTitle?: string;
  title: string;
  subtitle?: string;
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
    <section className="no-print mt-5 scroll-mt-24 border-t border-line/70 pt-4">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        {seriesSlug && seriesTitle ? (
          <>
            Next in{" "}
            <Link href={`/series/${seriesSlug}`} className={`text-terracotta hover:underline ${linkFocus}`}>
              {seriesTitle}
            </Link>
          </>
        ) : (
          "Watch next"
        )}
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
        {thumbnailUrl ? (
          <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-sand sm:w-28">
            <Image src={thumbnailUrl} alt="" fill sizes="7rem" className="object-cover" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-lg leading-snug text-ink">{title}</h3>
          {durationDisplay ? <p className="mt-0.5 text-xs text-muted">{durationDisplay}</p> : null}
          {subtitle && subtitle !== title ? (
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{subtitle}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold">
            {recipeSlug ? (
              <Link
                href={`/recipes/${recipeSlug}`}
                onClick={trackClick}
                className={`text-olive hover:text-terracotta hover:underline ${linkFocus}`}
              >
                View recipe →
              </Link>
            ) : null}
            {videoHref ? (
              recipeSlug ? (
                <Link
                  href={videoHref}
                  onClick={trackClick}
                  className={`text-muted hover:text-terracotta hover:underline ${linkFocus}`}
                >
                  Watch video
                </Link>
              ) : (
                <a
                  href={videoHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={trackClick}
                  className={`text-muted hover:text-terracotta hover:underline ${linkFocus}`}
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
