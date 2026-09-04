"use client";

import { SeriesItemTrackLink } from "@/components/series/SeriesItemTrackLink";
import { SERIES_PLAYLIST_CTA_LABEL } from "@/lib/series-public-meta";
import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";

const linkFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const primaryButtonClass = `inline-flex min-h-11 items-center justify-center rounded-sm bg-terracotta px-5 text-sm font-semibold text-paper hover:bg-terracotta-dark ${linkFocus}`;

const secondaryButtonClass = `inline-flex min-h-11 items-center justify-center rounded-sm border border-line bg-paper px-5 text-sm font-semibold text-ink hover:border-olive hover:text-olive ${linkFocus}`;

/**
 * Series-page conclusion: playlist continuation (when available) + Subscribe.
 * Keeps subscription event/URL parity with YouTubeSubscribeCTA without altering that shared component.
 */
export function SeriesContinueWithMesa({
  seriesId,
  seriesSlug,
  youtubePlaylistUrl,
  youtubePlaylistId,
}: {
  seriesId: string;
  seriesSlug: string;
  youtubePlaylistUrl: string | null;
  youtubePlaylistId: string | null;
}) {
  const subscribeUrl = `${site.social.youtube}?sub_confirmation=1`;
  const hasPlaylist = Boolean(youtubePlaylistUrl);

  return (
    <section
      className="mt-12 border-y border-line/80 py-8"
      aria-labelledby="series-continue-heading"
      data-mesa-series-conclusion="continue-with-mesa"
    >
      <div className="flex min-w-0 flex-col gap-6 xl:flex-row xl:items-end xl:justify-between xl:gap-10">
        <div className="min-w-0 max-w-[60ch]">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-olive">
            Continue with Mesa
          </p>
          <h2
            id="series-continue-heading"
            className="mt-2 font-serif text-2xl text-ink md:text-[1.75rem]"
          >
            Cook along with Mesa
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {hasPlaylist
              ? "Continue through the complete Series playlist on YouTube, or subscribe for future Mesa recipes and techniques."
              : "Subscribe for future Mesa recipes and kitchen techniques from Mesa Kitchen Studio."}
          </p>
        </div>

        <div
          className="flex min-w-0 shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
          data-mesa-series-conclusion-actions="true"
        >
          {youtubePlaylistUrl ? (
            <SeriesItemTrackLink
              href={youtubePlaylistUrl}
              external
              className={primaryButtonClass}
              event="series_watch_playlist_on_youtube_click"
              seriesId={seriesId}
              seriesSlug={seriesSlug}
              playlistId={youtubePlaylistId || undefined}
              placement="series_page_conclusion"
              ariaLabel="Watch the full series on YouTube (opens in a new tab)"
            >
              {SERIES_PLAYLIST_CTA_LABEL}
              <span className="sr-only"> (opens in a new tab)</span>
            </SeriesItemTrackLink>
          ) : null}
          <a
            href={subscribeUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Subscribe on YouTube (opens in a new tab)"
            onClick={() => {
              trackEvent("recipe_youtube_subscribe_click", {
                source: "series_page",
              });
            }}
            className={hasPlaylist ? secondaryButtonClass : primaryButtonClass}
          >
            Subscribe on YouTube
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
      <p className="mt-4 max-w-sm text-xs leading-5 text-muted">
        Opens YouTube&apos;s subscribe confirmation — Mesa does not confirm the subscription.
      </p>
    </section>
  );
}
