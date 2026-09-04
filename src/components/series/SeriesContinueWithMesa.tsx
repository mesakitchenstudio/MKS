"use client";

import { SeriesItemTrackLink } from "@/components/series/SeriesItemTrackLink";
import { SERIES_PLAYLIST_CTA_LABEL } from "@/lib/series-public-meta";
import { site } from "@/data/site";
import { trackEvent } from "@/lib/analytics";

const linkFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

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
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-olive">
        Continue with Mesa
      </p>
      <h2
        id="series-continue-heading"
        className="mt-2 font-serif text-2xl text-ink md:text-[1.75rem]"
      >
        Cook along with Mesa
      </h2>
      <p className="mt-2 max-w-[60ch] text-sm leading-6 text-muted">
        {hasPlaylist
          ? "Continue through the complete Series playlist on YouTube, or subscribe for future Mesa recipes and techniques."
          : "Subscribe for future Mesa recipes and kitchen techniques from Mesa Kitchen Studio."}
      </p>

      <div className="mt-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {youtubePlaylistUrl ? (
          <SeriesItemTrackLink
            href={youtubePlaylistUrl}
            external
            className={`inline-flex min-h-11 items-center text-sm font-semibold text-olive hover:underline ${linkFocus}`}
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
          className={`inline-flex min-h-11 items-center text-sm font-semibold text-muted hover:text-ink hover:underline ${linkFocus}`}
        >
          Subscribe on YouTube
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
      <p className="mt-3 max-w-sm text-xs leading-5 text-muted">
        Opens YouTube&apos;s subscribe confirmation — Mesa does not confirm the subscription.
      </p>
    </section>
  );
}
