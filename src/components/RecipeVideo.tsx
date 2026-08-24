import { youtubeEmbedUrl, youtubeWatchUrl } from "@/lib/youtube";

export function RecipeVideo({ url, title }: { url: string; title: string }) {
  const embed = youtubeEmbedUrl(url);
  const watch = youtubeWatchUrl(url);
  if (!embed) return null;

  return (
    <section id="studio-video" className="mt-10 scroll-mt-24">
      <h2 className="font-serif text-2xl text-ink">Watch in the studio</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Follow along with the full walkthrough on YouTube.
      </p>
      <div className="mt-4 aspect-video overflow-hidden border border-line bg-sand shadow-[0_8px_30px_rgba(42,34,24,0.08)]">
        <iframe
          src={embed}
          title={`${title} video`}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      {watch ? (
        <a
          href={watch}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-sm font-semibold text-terracotta hover:underline"
        >
          Open on YouTube
        </a>
      ) : null}
    </section>
  );
}
