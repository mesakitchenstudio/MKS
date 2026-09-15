import Image from "next/image";
import Link from "next/link";
import { MemberFollowButton } from "@/components/MemberFollowButton";
import { CollectionCard } from "@/components/series/CollectionCard";
import { JsonLd } from "@/components/JsonLd";
import { SeriesContinueWithMesa } from "@/components/series/SeriesContinueWithMesa";
import { SeriesItemTrackLink } from "@/components/series/SeriesItemTrackLink";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumb-jsonld";
import { PHASE3C_PUBLIC_COLLECTIONS_LABEL } from "@/lib/phase3c-collections";
import {
  formatSeriesCollectionMeta,
  SERIES_PLAYLIST_CTA_LABEL,
} from "@/lib/series-public-meta";
import { formatTime } from "@/lib/recipe-utils";
import {
  seriesItemListJsonLd,
  type PublicSeriesCard,
  type PublicSeriesDetail,
} from "@/lib/series";

export function SeriesDetailView({
  series,
  mode = "public",
  relatedCollections = [],
  memberFollowsEnabled = false,
}: {
  series: PublicSeriesDetail;
  mode?: "public" | "preview";
  relatedCollections?: PublicSeriesCard[];
  /** Server-derived gate — never read MEMBER_FOLLOWS_ENABLED in the client. */
  memberFollowsEnabled?: boolean;
}) {
  const isPreview = mode === "preview";
  const effectiveFeaturedId = series.featured?.id ?? null;
  const collectionMeta = formatSeriesCollectionMeta(series.items);
  const visibleItemCount = series.items.length;
  const itemGridClass =
    visibleItemCount <= 1
      ? "mt-6 grid max-w-xl gap-6"
      : visibleItemCount === 2
        ? "mt-6 grid gap-6 sm:grid-cols-2"
        : "mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3";
  const itemGridMode =
    visibleItemCount <= 1 ? "one" : visibleItemCount === 2 ? "two" : "many";
  const showJsonLd = !isPreview && visibleItemCount > 0;
  const showBreadcrumbJsonLd = !isPreview;

  return (
    <article data-mesa-series-layout="phase2-collection">
      {showBreadcrumbJsonLd ? (
        <JsonLd
          data={buildBreadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: PHASE3C_PUBLIC_COLLECTIONS_LABEL, url: "/series" },
            { name: series.title, url: `/series/${series.slug}` },
          ])}
        />
      ) : null}
      {showJsonLd ? <JsonLd data={seriesItemListJsonLd(series)} /> : null}
      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          {isPreview ? (
            "Collections"
          ) : (
            <Link href="/series" className="hover:text-terracotta">
              Collections
            </Link>
          )}
        </p>
        <h1 className="mt-2 font-serif text-5xl leading-tight text-ink">{series.title}</h1>
        {series.description ? (
          <p className="mt-3 max-w-2xl text-lg leading-8 text-ink/90">{series.description}</p>
        ) : null}

        {!isPreview && memberFollowsEnabled ? (
          <div className="mt-4">
            <MemberFollowButton
              target={{ type: "series", id: series.id, name: series.title }}
            />
          </div>
        ) : null}

        <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
          {collectionMeta ? (
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
              {collectionMeta}
            </p>
          ) : null}
          {series.youtubePlaylistUrl ? (
            isPreview ? (
              <a
                href={series.youtubePlaylistUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-sm font-semibold text-muted underline-offset-2 hover:text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
              >
                {SERIES_PLAYLIST_CTA_LABEL}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              <SeriesItemTrackLink
                href={series.youtubePlaylistUrl}
                external
                className="inline-flex min-h-11 items-center text-sm font-semibold text-muted underline-offset-2 hover:text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                event="series_watch_playlist_on_youtube_click"
                seriesId={series.id}
                seriesSlug={series.slug}
                playlistId={series.youtubePlaylistId || undefined}
                placement="series_page_header"
                ariaLabel="Watch playlist on YouTube (opens in a new tab)"
              >
                {SERIES_PLAYLIST_CTA_LABEL}
                <span className="sr-only"> (opens in a new tab)</span>
              </SeriesItemTrackLink>
            )
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
            In this collection
          </h2>
          {visibleItemCount === 0 ? (
            <p className="mt-6 max-w-[60ch] text-base leading-7 text-muted">
              Recipes for this collection are being prepared.
            </p>
          ) : (
            <ol
              className={itemGridClass}
              data-mesa-series-item-count={visibleItemCount}
              data-mesa-series-grid={itemGridMode}
            >
              {series.items.map((item) => {
                const isEffectiveFeatured = effectiveFeaturedId === item.id;
                const isVideoOnly = Boolean(item.watchUrl) && !item.recipeSlug;
                const metaBits = [
                  item.primaryCategoryLabel || item.typeName || null,
                  item.totalTimeMinutes != null && item.totalTimeMinutes > 0
                    ? formatTime(item.totalTimeMinutes)
                    : null,
                  item.durationDisplay || null,
                  isVideoOnly ? "Video" : null,
                ].filter(Boolean);

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
                        {metaBits.length > 0 ? ` · ${metaBits.join(" · ")}` : null}
                      </p>
                      <h3 className="mt-1 font-serif text-xl leading-snug text-ink">{item.title}</h3>
                      {item.description ? (
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">
                          {item.description}
                        </p>
                      ) : null}
                      <div className="mt-auto flex min-w-0 flex-wrap gap-x-5 gap-y-3 pt-4">
                        {item.recipeSlug ? (
                          isPreview ? (
                            <Link
                              href={`/recipes/${item.recipeSlug}`}
                              className="inline-flex min-h-11 items-center text-sm font-semibold text-terracotta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                            >
                              Read recipe
                            </Link>
                          ) : (
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
                          )
                        ) : null}
                        {item.watchUrl ? (
                          isPreview ? (
                            <a
                              href={item.watchUrl}
                              target={item.watchExternal ? "_blank" : undefined}
                              rel={item.watchExternal ? "noopener noreferrer" : undefined}
                              className="inline-flex min-h-11 items-center text-sm font-semibold text-olive hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                            >
                              Watch video
                              {item.watchExternal ? (
                                <span className="sr-only"> (opens in a new tab)</span>
                              ) : null}
                            </a>
                          ) : (
                            <SeriesItemTrackLink
                              href={item.watchUrl}
                              external={item.watchExternal}
                              className="inline-flex min-h-11 items-center text-sm font-semibold text-olive hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                              event="series_watch_click"
                              seriesId={series.id}
                              seriesSlug={series.slug}
                              itemPosition={item.position}
                              destinationRecipeSlug={item.recipeSlug || undefined}
                              destinationVideoId={item.youtubeVideoId || undefined}
                              ariaLabel={
                                item.watchExternal
                                  ? `Watch video: ${item.title} (opens in a new tab)`
                                  : `Watch video: ${item.title}`
                              }
                            >
                              Watch video
                              {item.watchExternal ? (
                                <span className="sr-only"> (opens in a new tab)</span>
                              ) : null}
                            </SeriesItemTrackLink>
                          )
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {relatedCollections.length > 0 ? (
          <section className="mt-12" aria-labelledby="related-collections-heading">
            <h2 id="related-collections-heading" className="font-serif text-3xl text-ink">
              Explore more collections
            </h2>
            <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {relatedCollections.map((collection) => (
                <CollectionCard key={collection.id} collection={collection} titleAs="h3" />
              ))}
            </div>
          </section>
        ) : null}

        {!isPreview ? (
          <SeriesContinueWithMesa
            seriesId={series.id}
            seriesSlug={series.slug}
            youtubePlaylistUrl={series.youtubePlaylistUrl}
            youtubePlaylistId={series.youtubePlaylistId}
          />
        ) : null}
      </div>
    </article>
  );
}
