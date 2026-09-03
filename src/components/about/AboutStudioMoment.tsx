import Link from "next/link";
import type { PublicVideoCard } from "@/lib/public-videos/types";
import { VideoThumbnail } from "@/components/youtube/VideoThumbnail";

const focusRing =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

/**
 * Restrained About-page video moment.
 * Pass the catalogue featured Long card when available; omit the still when not.
 */
export function AboutStudioMoment({ video }: { video: PublicVideoCard | null }) {
  const watchHref = video ? `/videos/${video.videoId}` : "/videos";
  const ctaLabel = video
    ? `Watch the method: ${video.title}`
    : "Watch cooking methods on Mesa videos";

  return (
    <section
      className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14"
      aria-labelledby="about-in-the-studio"
    >
      <div
        className={
          video
            ? "grid gap-8 md:grid-cols-2 md:items-center md:gap-12 lg:gap-16"
            : "max-w-2xl"
        }
      >
        <div className={video ? "md:order-2" : undefined}>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
            In the studio
          </p>
          <h2
            id="about-in-the-studio"
            className="mt-3 text-balance font-serif text-3xl leading-tight text-ink md:text-4xl"
          >
            Some things are easier to see.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted md:text-lg md:leading-8">
            When a technique is clearer in motion — a fold, a fry, the moment dough turns ready — we
            film it in the Mesa kitchen so you can watch the method before you cook.
          </p>
          <p className="mt-6">
            <Link
              href={watchHref}
              className={`text-sm font-semibold text-terracotta underline-offset-4 transition hover:underline ${focusRing}`}
              aria-label={ctaLabel}
            >
              Watch the method →
            </Link>
          </p>
        </div>

        {video ? (
          <div className="md:order-1">
            <Link
              href={watchHref}
              aria-label={
                video.durationDisplay
                  ? `Watch ${video.title}, ${video.durationDisplay}`
                  : `Watch ${video.title}`
              }
              className={`group/thumb block ${focusRing}`}
            >
              <div className="relative">
                <VideoThumbnail
                  src={video.thumbnailUrl}
                  alt=""
                  showPlay
                  sizes="(min-width: 768px) 28rem, 100vw"
                />
                {video.durationDisplay ? (
                  <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-ink/80 px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums text-paper">
                    <span className="sr-only">Duration </span>
                    {video.durationDisplay}
                  </span>
                ) : null}
              </div>
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
