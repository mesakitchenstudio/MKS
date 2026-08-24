import { youtubeEmbedUrl, youtubeWatchUrl } from "@/lib/youtube";

type RecipeVideoProps = {
  url: string;
  title: string;
  variant?: "inline" | "sticky";
};

function RecipeVideoPlayer({ url, title }: { url: string; title: string }) {
  const embed = youtubeEmbedUrl(url);
  if (!embed) return null;

  return (
    <iframe
      src={embed}
      title={`${title} video`}
      className="h-full w-full"
      loading="lazy"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  );
}

export function RecipeStickyVideo({ url, title }: { url: string; title: string }) {
  const embed = youtubeEmbedUrl(url);
  const watch = youtubeWatchUrl(url);
  if (!embed) return null;

  return (
    <div id="studio-video" className="sticky top-20 z-40 scroll-mt-24">
      <div className="aspect-video overflow-hidden border border-line bg-sand shadow-[0_12px_40px_rgba(42,34,24,0.12)]">
        <RecipeVideoPlayer url={url} title={title} />
      </div>
      {watch ? (
        <a
          href={watch}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block text-center text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-terracotta hover:underline"
        >
          Open on YouTube
        </a>
      ) : null}
    </div>
  );
}

export function RecipeVideo({ url, title, variant = "inline" }: RecipeVideoProps) {
  const embed = youtubeEmbedUrl(url);
  const watch = youtubeWatchUrl(url);
  if (!embed) return null;

  if (variant === "sticky") {
    return <RecipeStickyVideo url={url} title={title} />;
  }

  return (
    <section id="studio-video" className="scroll-mt-24 lg:hidden">
      <h2 className="font-serif text-3xl text-ink">Watch how we make it</h2>
      <p className="mt-3 text-base leading-7 text-ink/90">
        Follow the full studio walkthrough on YouTube — the same step-by-step flow we use when testing
        this recipe.
      </p>
      <div className="mt-5 aspect-video overflow-hidden border border-line bg-sand shadow-[0_8px_30px_rgba(42,34,24,0.08)]">
        <RecipeVideoPlayer url={url} title={title} />
      </div>
      {watch ? (
        <a
          href={watch}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-sm font-semibold uppercase tracking-wide text-terracotta hover:underline"
        >
          Open on YouTube
        </a>
      ) : null}
    </section>
  );
}
