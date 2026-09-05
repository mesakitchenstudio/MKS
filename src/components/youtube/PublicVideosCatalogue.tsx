"use client";

import Link from "next/link";
import { site } from "@/data/site";
import type { PublicVideoCard as PublicVideoCardType } from "@/lib/public-videos/types";
import { trackEvent } from "@/lib/analytics";
import { PublicFeaturedVideo } from "@/components/youtube/PublicFeaturedVideo";
import { PublicVideoCard } from "@/components/youtube/PublicVideoCard";
import { VideosYoutubeOutboundLink } from "@/components/youtube/VideosYoutubeOutboundLink";

const focusRing =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function PublicVideosCatalogue({
  featured,
  videos,
  shorts,
  showFormatFilter,
  format,
  loadFailed = false,
}: {
  featured: PublicVideoCardType | null;
  videos: PublicVideoCardType[];
  shorts: PublicVideoCardType[];
  showFormatFilter: boolean;
  format: "long" | "shorts";
  loadFailed?: boolean;
}) {
  const gridVideos = format === "shorts" ? shorts : videos;
  const isEmpty = !featured && videos.length === 0 && shorts.length === 0;
  const sectionHeading = format === "shorts" ? "Shorts" : "Full videos";

  function trackFormatChange(next: "long" | "shorts") {
    if (next === format) return;
    trackEvent("videos_format_change", {
      placement: "format_filter",
      source: next,
      sort: format,
    });
  }

  if (loadFailed) {
    return (
      <p className="mt-12 max-w-xl text-base leading-7 text-muted" role="status">
        We couldn’t load the video catalogue right now. Please try again in a moment, or watch on{" "}
        <VideosYoutubeOutboundLink
          href={site.social.youtube}
          placement="catalogue_load_failed"
          format="channel"
          className="font-semibold text-terracotta hover:text-terracotta-dark"
        >
          YouTube
        </VideosYoutubeOutboundLink>
        .
      </p>
    );
  }

  if (isEmpty) {
    return (
      <p className="mt-12 max-w-xl text-base leading-7 text-muted">
        No public videos are available on the site yet. You can still follow along on{" "}
        <VideosYoutubeOutboundLink
          href={site.social.youtube}
          placement="catalogue_empty"
          format="channel"
          className="font-semibold text-terracotta hover:text-terracotta-dark"
        >
          YouTube
        </VideosYoutubeOutboundLink>
        .
      </p>
    );
  }

  return (
    <>
      {featured && format === "long" ? <PublicFeaturedVideo video={featured} /> : null}

      <section
        className={
          format === "shorts"
            ? "mt-10 border-t border-line pt-8 md:mt-12 md:pt-10"
            : "mt-12 border-t border-line pt-10 md:mt-16 md:pt-12"
        }
        aria-labelledby="all-videos-heading"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="all-videos-heading" className="font-serif text-[1.75rem] text-ink md:text-[1.85rem]">
            {sectionHeading}
          </h2>
          {showFormatFilter ? (
            <div className="flex gap-1 text-sm" role="group" aria-label="Video format">
              <Link
                href="/videos"
                onClick={() => trackFormatChange("long")}
                className={`px-3 py-1.5 ${focusRing} ${
                  format === "long"
                    ? "border-b-2 border-terracotta font-semibold text-ink"
                    : "text-muted hover:text-terracotta"
                }`}
                aria-current={format === "long" ? "page" : undefined}
              >
                Full videos
              </Link>
              <Link
                href="/videos?format=shorts"
                onClick={() => trackFormatChange("shorts")}
                className={`px-3 py-1.5 ${focusRing} ${
                  format === "shorts"
                    ? "border-b-2 border-terracotta font-semibold text-ink"
                    : "text-muted hover:text-terracotta"
                }`}
                aria-current={format === "shorts" ? "page" : undefined}
              >
                Shorts
              </Link>
            </div>
          ) : null}
        </div>

        {gridVideos.length === 0 ? (
          <p className="mt-8 text-muted">
            {format === "shorts"
              ? "No Shorts in the catalogue right now."
              : "No full-length videos to show yet."}
          </p>
        ) : (
          <div
            className={
              format === "shorts"
                ? "mt-8 grid items-stretch gap-8 sm:grid-cols-2 lg:grid-cols-4"
                : "mt-8 grid items-stretch gap-8 sm:grid-cols-2 lg:grid-cols-3"
            }
          >
            {gridVideos.map((video, index) => (
              <PublicVideoCard
                key={video.videoId}
                video={video}
                priority={!featured && index < 3}
                portrait={format === "shorts"}
              />
            ))}
          </div>
        )}
      </section>

      <section
        className="mt-16 max-w-xl border-t border-line pt-10 md:mt-20 md:pt-12"
        aria-labelledby="mesa-on-youtube-heading"
      >
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          Mesa on YouTube
        </p>
        <h2
          id="mesa-on-youtube-heading"
          className="mt-2 font-serif text-[1.65rem] leading-tight text-ink md:text-[1.75rem]"
        >
          Cook along with Mesa
        </h2>
        <p className="mt-3 text-base leading-7 text-muted">
          Watch the full video library and follow new recipes from the kitchen.
        </p>
        <p className="mt-5">
          <VideosYoutubeOutboundLink
            href={site.social.youtube}
            placement="videos_catalog_footer"
            format="channel"
            className="text-base text-terracotta underline-offset-2 transition hover:text-terracotta-dark hover:underline"
          >
            Visit Mesa on YouTube →
          </VideosYoutubeOutboundLink>
        </p>
      </section>
    </>
  );
}
