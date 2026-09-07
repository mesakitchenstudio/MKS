import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { site } from "@/data/site";
import {
  PHASE3C_PUBLIC_COLLECTIONS_BLURB,
  PHASE3C_PUBLIC_COLLECTIONS_LABEL,
} from "@/lib/phase3c-collections";
import { listPublishedSeries } from "@/lib/series";

export const revalidate = 300;

export const metadata: Metadata = {
  title: PHASE3C_PUBLIC_COLLECTIONS_LABEL,
  description: PHASE3C_PUBLIC_COLLECTIONS_BLURB,
  alternates: { canonical: "/series" },
  openGraph: {
    title: `${PHASE3C_PUBLIC_COLLECTIONS_LABEL} | ${site.name}`,
    description: PHASE3C_PUBLIC_COLLECTIONS_BLURB,
    url: `${site.url}/series`,
    siteName: site.name,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${PHASE3C_PUBLIC_COLLECTIONS_LABEL} | ${site.name}`,
    description: PHASE3C_PUBLIC_COLLECTIONS_BLURB,
  },
};

function collectionCountLabel(recipeCount: number, itemCount: number, videoCount: number) {
  if (recipeCount > 0) {
    return `${recipeCount} ${recipeCount === 1 ? "recipe" : "recipes"}`;
  }
  if (videoCount > 0) {
    return `${videoCount} ${videoCount === 1 ? "video" : "videos"}`;
  }
  return `${itemCount} ${itemCount === 1 ? "item" : "items"}`;
}

export default async function SeriesIndexPage() {
  const series = await listPublishedSeries();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
        Mesa Kitchen Studio
      </p>
      <h1 className="mt-2 font-serif text-5xl leading-tight text-ink">
        {PHASE3C_PUBLIC_COLLECTIONS_LABEL}
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-ink/90">
        {PHASE3C_PUBLIC_COLLECTIONS_BLURB}
      </p>

      {series.length === 0 ? (
        <p className="mt-12 text-muted">Collections are coming soon.</p>
      ) : (
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {series.map((item) => (
            <article key={item.id} className="flex flex-col border border-line bg-paper">
              <Link href={`/series/${item.slug}`} className="relative aspect-video overflow-hidden bg-sand">
                <Image
                  src={item.heroImage}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(min-width: 1024px) 20rem, (min-width: 640px) 45vw, 100vw"
                />
              </Link>
              <div className="flex flex-1 flex-col px-4 py-5">
                <h2 className="font-serif text-2xl text-ink">
                  <Link href={`/series/${item.slug}`} className="hover:text-terracotta">
                    {item.title}
                  </Link>
                </h2>
                {item.description ? (
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{item.description}</p>
                ) : null}
                <p className="mt-3 text-xs text-muted">
                  {collectionCountLabel(item.recipeCount, item.itemCount, item.videoCount)}
                </p>
                <Link
                  href={`/series/${item.slug}`}
                  className="mt-4 inline-flex text-sm font-semibold text-terracotta hover:underline"
                >
                  Explore collection →
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
