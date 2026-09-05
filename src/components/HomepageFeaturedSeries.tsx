import Image from "next/image";
import { SeriesItemTrackLink } from "@/components/series/SeriesItemTrackLink";
import type { PublicSeriesCard } from "@/lib/series-types";
import { formatSeriesPartCountLabel } from "@/lib/series-public-meta";

const linkFocus =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

/**
 * Homepage bridge to one published Series (catalog order).
 * CTA is the sole interactive control — no YouTube embeds.
 */
export function HomepageFeaturedSeries({ series }: { series: PublicSeriesCard }) {
  const href = `/series/${series.slug}`;
  const description = series.description.trim();
  const exploreLabel = `Explore the ${series.title} series`;

  return (
    <section
      className="border-y border-line bg-cream/50"
      aria-labelledby="featured-series-heading"
    >
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          From the studio
        </p>
        <h2 id="featured-series-heading" className="mt-2 font-serif text-3xl text-ink md:text-4xl">
          Featured series
        </h2>

        <div className="mt-6 grid min-w-0 grid-cols-1 items-center gap-7 lg:grid-cols-2 lg:gap-10">
          <div className="relative aspect-[5/4] min-w-0 overflow-hidden border border-line bg-sand">
            <Image
              src={series.heroImage}
              alt=""
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 28rem, 100vw"
            />
          </div>

          <div className="min-w-0">
            <h3 className="font-serif text-3xl leading-tight text-ink md:text-4xl">{series.title}</h3>
            {description ? (
              <p className="mt-3 max-w-prose text-base leading-7 text-muted line-clamp-3">
                {description}
              </p>
            ) : null}
            <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-olive">
              {formatSeriesPartCountLabel(series.itemCount)}
            </p>
            <div className="mt-6">
              <SeriesItemTrackLink
                href={href}
                event="series_item_click"
                seriesId={series.id}
                seriesSlug={series.slug}
                placement="homepage_series"
                ariaLabel={exploreLabel}
                className={`inline-flex min-h-11 items-center text-sm font-semibold text-terracotta hover:text-terracotta-dark ${linkFocus}`}
              >
                Explore the series →
              </SeriesItemTrackLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
