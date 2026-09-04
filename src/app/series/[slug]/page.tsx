import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { YouTubeSubscribeCTA } from "@/components/youtube/YouTubeSubscribeCTA";
import { SeriesItemTrackLink } from "@/components/series/SeriesItemTrackLink";
import { site } from "@/data/site";
import {
  getPublishedSeriesBySlug,
  listSeriesSlugsForStaticParams,
  seriesItemListJsonLd,
} from "@/lib/series";

type Props = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 300;

export async function generateStaticParams() {
  const slugs = await listSeriesSlugsForStaticParams();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const series = await getPublishedSeriesBySlug(slug);
  if (!series) return { title: "Series" };
  const title = series.seoTitle.trim() || series.title;
  const description =
    series.seoDescription.trim() ||
    series.description.trim() ||
    `Cooking series from ${site.name}.`;
  return {
    title,
    description,
    alternates: { canonical: `/series/${series.slug}` },
    openGraph: {
      title: `${title} | ${site.name}`,
      description,
      url: `${site.url}/series/${series.slug}`,
      images: series.heroImage ? [series.heroImage] : undefined,
      type: "website",
      siteName: site.name,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${site.name}`,
      description,
      images: series.heroImage ? [series.heroImage] : undefined,
    },
  };
}

export default async function SeriesDetailPage({ params }: Props) {
  const { slug } = await params;
  const series = await getPublishedSeriesBySlug(slug);
  if (!series) notFound();

  /** Same effective featured item the former standalone panel used (`series.featured`). */
  const effectiveFeaturedId = series.featured?.id ?? null;

  return (
    <article>
      <JsonLd data={seriesItemListJsonLd(series)} />
      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          <Link href="/series" className="hover:text-terracotta">
            Cooking Series
          </Link>
        </p>
        <h1 className="mt-2 font-serif text-5xl leading-tight text-ink">{series.title}</h1>
        {series.description ? (
          <p className="mt-3 max-w-2xl text-lg leading-8 text-ink/90">{series.description}</p>
        ) : null}
        <p className="mt-3 text-sm text-muted">
          {series.itemCount} {series.itemCount === 1 ? "item" : "items"}
        </p>

        {series.heroImage ? (
          <div className="relative mt-8 aspect-video overflow-hidden border border-line bg-sand">
            <Image
              src={series.heroImage}
              alt=""
              fill
              priority
              className="object-cover"
              sizes="(min-width: 768px) 64rem, 100vw"
            />
          </div>
        ) : null}

        {series.intro ? (
          <div className="prose-mesa mt-10 max-w-3xl text-base leading-8 text-ink/90">
            <p>{series.intro}</p>
          </div>
        ) : null}

        <section className="mt-12">
          <h2 className="font-serif text-3xl text-ink">In this series</h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {series.items.map((item) => {
              const isEffectiveFeatured = effectiveFeaturedId === item.id;
              return (
                <li key={item.id} className="flex flex-col border border-line bg-paper">
                  <div className="relative aspect-video overflow-hidden bg-sand">
                    <Image
                      src={item.thumbnail}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(min-width: 1024px) 18rem, (min-width: 640px) 45vw, 100vw"
                    />
                  </div>
                  <div className="flex flex-1 flex-col px-4 py-4">
                    {isEffectiveFeatured ? (
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
                        Featured
                      </p>
                    ) : null}
                    <p
                      className={`text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted ${
                        isEffectiveFeatured ? "mt-1" : ""
                      }`}
                    >
                      Part {item.position}
                      {item.typeName ? ` · ${item.typeName}` : null}
                      {item.durationDisplay ? ` · ${item.durationDisplay}` : null}
                    </p>
                    <h3 className="mt-1 font-serif text-xl leading-snug text-ink">{item.title}</h3>
                    {item.description ? (
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">
                        {item.description}
                      </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-3">
                      {item.recipeSlug ? (
                        <SeriesItemTrackLink
                          href={`/recipes/${item.recipeSlug}`}
                          className="text-sm font-semibold text-terracotta hover:underline"
                          event="series_item_click"
                          seriesId={series.id}
                          seriesSlug={series.slug}
                          itemPosition={item.position}
                          destinationRecipeSlug={item.recipeSlug}
                          destinationVideoId={item.youtubeVideoId || undefined}
                        >
                          View recipe
                        </SeriesItemTrackLink>
                      ) : null}
                      {item.watchUrl ? (
                        <SeriesItemTrackLink
                          href={item.watchUrl}
                          external
                          className="text-sm font-semibold text-olive hover:underline"
                          event="series_watch_click"
                          seriesId={series.id}
                          seriesSlug={series.slug}
                          itemPosition={item.position}
                          destinationRecipeSlug={item.recipeSlug || undefined}
                          destinationVideoId={item.youtubeVideoId || undefined}
                        >
                          Watch
                        </SeriesItemTrackLink>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="mx-auto mt-12 max-w-3xl">
          <YouTubeSubscribeCTA placement="series_page" />
          {series.youtubePlaylistUrl ? (
            <p className="mt-5 text-center">
              <SeriesItemTrackLink
                href={series.youtubePlaylistUrl}
                external
                className="text-sm font-semibold text-olive hover:underline"
                event="series_watch_playlist_on_youtube_click"
                seriesId={series.id}
                seriesSlug={series.slug}
                playlistId={series.youtubePlaylistId || undefined}
                placement="series_page_footer"
              >
                Watch the full series on YouTube →
              </SeriesItemTrackLink>
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
