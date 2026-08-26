import Image from "next/image";
import type { RecipeYoutubeRelatedVideo } from "@/data/youtube-types";

export function VideoCard({
  video,
  onClick,
}: {
  video: RecipeYoutubeRelatedVideo;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="relative aspect-video overflow-hidden bg-sand">
        <Image
          src={video.thumbnail || ""}
          alt={video.title ? `Video thumbnail: ${video.title}` : ""}
          fill
          sizes="(min-width: 768px) 280px, 45vw"
          className="object-cover transition duration-300 group-hover:scale-[1.03]"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-ink/15 opacity-0 transition group-hover:opacity-100">
          <span className="rounded-full bg-paper/95 px-2.5 py-1 text-xs font-semibold text-terracotta">
            ▶
          </span>
        </span>
        {video.duration ? (
          <span className="absolute bottom-2 right-2 rounded bg-ink/80 px-1.5 py-0.5 text-[0.65rem] font-semibold text-paper">
            {video.duration}
          </span>
        ) : null}
      </div>
      <div className="p-3">
        {video.label ? (
          <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-olive">
            {video.label}
          </p>
        ) : null}
        <p className="mt-1 line-clamp-2 font-semibold text-sm leading-snug text-ink">{video.title}</p>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group w-full overflow-hidden border border-line bg-paper text-left transition hover:border-terracotta/40"
      >
        {inner}
      </button>
    );
  }

  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden border border-line bg-paper transition hover:border-terracotta/40"
    >
      {inner}
    </a>
  );
}
