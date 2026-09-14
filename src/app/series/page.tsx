import type { Metadata } from "next";
import { CollectionCard } from "@/components/series/CollectionCard";
import { JsonLd } from "@/components/JsonLd";
import { site } from "@/data/site";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumb-jsonld";
import {
  PHASE3C_PUBLIC_COLLECTIONS_BLURB,
  PHASE3C_PUBLIC_COLLECTIONS_LABEL,
} from "@/lib/phase3c-collections";
import { listPublishedSeries } from "@/lib/series";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const series = await listPublishedSeries();
  const empty = series.length === 0;
  return {
    title: PHASE3C_PUBLIC_COLLECTIONS_LABEL,
    description: PHASE3C_PUBLIC_COLLECTIONS_BLURB,
    alternates: { canonical: "/series" },
    ...(empty ? { robots: { index: false, follow: true } } : {}),
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
}

export default async function SeriesIndexPage() {
  const series = await listPublishedSeries();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", url: "/" },
          { name: PHASE3C_PUBLIC_COLLECTIONS_LABEL, url: "/series" },
        ])}
      />
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
            <CollectionCard key={item.id} collection={item} />
          ))}
        </div>
      )}
    </div>
  );
}
