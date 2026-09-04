import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { SeriesContinueWithMesa } from "@/components/series/SeriesContinueWithMesa";
import { SeriesItemTrackLink } from "@/components/series/SeriesItemTrackLink";
import { site } from "@/data/site";
import {
  getPublishedSeriesBySlug,
  listSeriesSlugsForStaticParams,
  seriesItemListJsonLd,
} from "@/lib/series";
import {
  formatSeriesCollectionMeta,
  SERIES_PLAYLIST_CTA_LABEL,
} from "@/lib/series-public-meta";

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
  const collectionMeta = formatSeriesCollectionMeta(series.items);
  const visibleItemCount = series.items.length;
  /** Adaptive columns from visible count — avoid an implied empty third column for 2-item Series. */
  const itemGridClass =
    visibleItemCount <= 1
      ? "mt-6 grid max-w-xl gap-6"
      : visibleItemCount === 2
        ? "mt-6 grid gap-6 sm:grid-cols-2"
        : "mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3";
  const itemGridMode =
    visibleItemCount <= 1 ? "one" : visibleItemCount === 2 ? "two" : "many";

  return (
    <article data-mesa-series-layout="phase2-collection">
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

        <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
            {collectionMeta}
          </p>
          {series.youtubePlaylistUrl ? (
            <SeriesItemTrackLink
              href={series.youtubePlaylistUrl}
              external
              className="inline-flex min-h-11 items-center text-sm font-semibold text-muted underline-offset-2 hover:text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
              event="series_watch_playlist_on_youtube_click"
              seriesId={series.id}
              seriesSlug={series.slug}
              playlistId={series.youtubePlaylistId || undefined}
              placement="series_page_header"
              ariaLabel="Watch the full series on YouTube (opens in a new tab)"
            >
              {SERIES_PLAYLIST_CTA_LABEL}
              <span className="sr-only"> (opens in a new tab)</span>
            </SeriesItemTrackLink>
          ) : null}
        </div>

        {series.heroImage ? (
          <div className="relative mt-8 aspect-video overflow-hidden border border-line bg-sand xl:aspect-auto xl:h-[30rem]">
            <Image
              src={series.heroImage}
              alt=""
              fill
              priority
              className="object-cover object-center"
              sizes="(min-width: 768px) 64rem, 100vw"
            />
          </div>
        ) : null}

        {series.intro ? (
          <div className="prose-mesa mt-6 max-w-[72ch] text-base leading-8 text-ink/90">
            <p>{series.intro}</p>
          </div>
        ) : null}

        {/* Phase 2: no standalone Featured showcase between intro and the item grid. */}
        <section className="mt-10" aria-labelledby="series-items-heading">
          <h2 id="series-items-heading" className="font-serif text-3xl text-ink">
            In this series
          </h2>
          <ol
            className={itemGridClass}
            data-mesa-series-item-count={visibleItemCount}
            data-mesa-series-grid={itemGridMode}
          >
            {series.items.map((item) => {
              const isEffectiveFeatured = effectiveFeaturedId === item.id;
              return (
                <li
                  key={item.id}
                  className="flex h-full min-w-0 flex-col border border-line bg-paper"
                >
                  <div className="relative aspect-video overflow-hidden bg-sand">
                    <Image
                      src={item.thumbnail}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(min-width: 1024px) 18rem, (min-width: 640px) 45vw, 100vw"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col px-4 py-4">
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
                    <div className="mt-auto flex min-w-0 flex-wrap gap-x-5 gap-y-3 pt-4">
                      {item.recipeSlug ? (
                        <SeriesItemTrackLink
                          href={`/recipes/${item.recipeSlug}`}
                          className="inline-flex min-h-11 items-center text-sm font-semibold text-terracotta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                          event="series_item_click"
                          seriesId={series.id}
                          seriesSlug={series.slug}
                          itemPosition={item.position}
                          destinationRecipeSlug={item.recipeSlug}
                          destinationVideoId={item.youtubeVideoId || undefined}
                          ariaLabel={`Read recipe: ${item.title}`}
                        >
                          Read recipe
                        </SeriesItemTrackLink>
                      ) : null}
                      {item.watchUrl ? (
                        <SeriesItemTrackLink
                          href={item.watchUrl}
                          external
                          className="inline-flex min-h-11 items-center text-sm font-semibold text-olive hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                          event="series_watch_click"
                          seriesId={series.id}
                          seriesSlug={series.slug}
                          itemPosition={item.position}
                          destinationRecipeSlug={item.recipeSlug || undefined}
                          destinationVideoId={item.youtubeVideoId || undefined}
                          ariaLabel={`Watch video: ${item.title} (opens in a new tab)`}
                        >
                          Watch video
                          <span className="sr-only"> (opens in a new tab)</span>
                        </SeriesItemTrackLink>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <SeriesContinueWithMesa
          seriesId={series.id}
          seriesSlug={series.slug}
          youtubePlaylistUrl={series.youtubePlaylistUrl}
          youtubePlaylistId={series.youtubePlaylistId}
        />
      </div>
    </article>
  );
}
