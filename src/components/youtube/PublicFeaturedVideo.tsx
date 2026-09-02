import Link from "next/link";
import type { PublicVideoCard as PublicVideoCardType } from "@/lib/public-videos/types";
import { VideoThumbnail } from "@/components/youtube/VideoThumbnail";

const focusRing =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function PublicFeaturedVideo({ video }: { video: PublicVideoCardType }) {
  const watchHref = `/videos/${video.videoId}`;
  const watchLabel = video.durationDisplay
    ? `Watch ${video.title}, ${video.durationDisplay}`
    : `Watch ${video.title}`;

  return (
    <section
      className="mt-10 border-t border-line pt-10 md:mt-12 md:pt-12"
      aria-labelledby="featured-video-title"
    >
      <div className="relative grid gap-6 md:grid-cols-2 md:items-center md:gap-10">
        <Link
          href={watchHref}
          aria-label={watchLabel}
          className={`absolute inset-0 z-0 ${focusRing}`}
        />

        <div className="pointer-events-none relative z-10">
          <div className="group/thumb relative">
            <VideoThumbnail
              src={video.thumbnailUrl}
              alt=""
              showPlay
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
            />
            {video.durationDisplay ? (
              <span className="absolute bottom-3 right-3 rounded bg-ink/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-paper">
                <span className="sr-only">Duration </span>
                {video.durationDisplay}
              </span>
            ) : null}
          </div>
        </div>

        <div className="relative z-10">
          <div className="pointer-events-none">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
              From the kitchen
            </p>
            <h2
              id="featured-video-title"
              className="mt-2 font-serif text-3xl leading-tight text-ink md:text-[2.15rem]"
            >
              {video.title}
            </h2>
            {video.durationDisplay ? (
              <p className="mt-3 text-sm text-muted">
                <span className="sr-only">Duration </span>
                {video.durationDisplay}
              </p>
            ) : null}
          </div>

          {video.recipeSlug && video.recipeTitle ? (
            <p className="relative z-20 mt-5 text-sm leading-6 text-muted">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-olive">
                Recipe
              </span>
              <br />
              <Link
                href={`/recipes/${video.recipeSlug}`}
                className={`mt-1 inline-block text-base text-ink underline-offset-2 transition hover:text-terracotta hover:underline ${focusRing}`}
              >
                {video.recipeTitle} →
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
