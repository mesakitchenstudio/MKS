import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { PublicWatchPlayer } from "@/components/youtube/PublicWatchPlayer";
import { VideosYoutubeOutboundLink } from "@/components/youtube/VideosYoutubeOutboundLink";
import { site } from "@/data/site";
import { youtubeEmbedUrl } from "@/lib/youtube";
import { loadPublicVideoWatch } from "@/lib/public-videos/load";

function iso8601Duration(seconds: number): string | undefined {
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `PT${h}H${m}M${s}S`;
  if (m > 0) return `PT${m}M${s}S`;
  return `PT${s}S`;
}

type Props = {
  params: Promise<{ videoId: string }>;
};

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { videoId } = await params;
  const video = await loadPublicVideoWatch(videoId);
  if (!video) {
    return { title: "Video", robots: { index: false } };
  }

  const description = video.recipeTitle
    ? `Watch “${video.title}” from ${site.name}. Cook along with ${video.recipeTitle}.`
    : `Watch “${video.title}” from ${site.name}.`;

  return {
    title: video.title,
    description,
    alternates: { canonical: `/videos/${video.videoId}` },
    openGraph: {
      title: `${video.title} | ${site.name}`,
      description,
      url: `${site.url}/videos/${video.videoId}`,
      images: video.thumbnailUrl ? [video.thumbnailUrl] : undefined,
      type: "video.other",
      siteName: site.name,
    },
    twitter: {
      card: "summary_large_image",
      title: `${video.title} | ${site.name}`,
      description,
      images: video.thumbnailUrl ? [video.thumbnailUrl] : undefined,
    },
  };
}

export default async function PublicVideoWatchPage({ params }: Props) {
  const { videoId } = await params;
  const video = await loadPublicVideoWatch(videoId);
  if (!video) notFound();

  const formatLabel =
    video.format === "SHORT" ? "Short" : video.format === "LONG" ? "Full video" : "Video";
  const focusRing =
    "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

  const videoObject =
    video.publishedAt && video.thumbnailUrl
      ? {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: video.title,
          thumbnailUrl: video.thumbnailUrl,
          uploadDate: video.publishedAt,
          duration: iso8601Duration(video.durationSeconds),
          contentUrl: video.youtubeWatchUrl,
          embedUrl: video.embeddable
            ? youtubeEmbedUrl(video.videoId) || undefined
            : undefined,
        }
      : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 pb-16 md:px-6 md:pb-20">
      {videoObject ? <JsonLd data={videoObject} /> : null}
      <p className="text-sm text-muted">
        <Link href="/videos" className={`hover:text-terracotta ${focusRing}`}>
          ← All videos
        </Link>
      </p>

      <h1 className="mt-4 font-serif text-3xl leading-tight text-ink md:text-4xl">{video.title}</h1>
      <p className="mt-2 text-sm text-muted">
        {video.durationDisplay ? (
          <>
            <span className="sr-only">Duration </span>
            {video.durationDisplay}
            <span aria-hidden> · </span>
          </>
        ) : null}
        {formatLabel}
      </p>

      <div className="mt-6">
        <PublicWatchPlayer
          videoId={video.videoId}
          title={video.title}
          thumbnail={video.thumbnailUrl}
          duration={video.durationDisplay}
          embeddable={video.embeddable}
          youtubeWatchUrl={video.youtubeWatchUrl}
        />
      </div>

      {video.recipeSlug && video.recipeTitle ? (
        <section className="mt-8 border-t border-line pt-6" aria-labelledby="cook-recipe-heading">
          <p
            id="cook-recipe-heading"
            className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive"
          >
            Cook this recipe
          </p>
          <p className="mt-2">
            <Link
              href={`/recipes/${video.recipeSlug}`}
              className={`font-serif text-xl text-ink underline-offset-2 transition hover:text-terracotta hover:underline ${focusRing}`}
            >
              {video.recipeTitle} →
            </Link>
          </p>
        </section>
      ) : null}

      <p className="mt-8 text-sm text-muted">
        <VideosYoutubeOutboundLink
          href={video.youtubeWatchUrl}
          placement="watch_page"
          videoId={video.videoId}
          format={video.format}
          className="underline-offset-2 transition hover:text-terracotta hover:underline"
        >
          Watch on YouTube ↗
          <span className="sr-only"> (opens in a new tab)</span>
        </VideosYoutubeOutboundLink>
      </p>
    </div>
  );
}
