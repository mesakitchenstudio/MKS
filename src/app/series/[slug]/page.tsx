import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeriesDetailView } from "@/components/series/SeriesDetailView";
import { site } from "@/data/site";
import { absolutePublicUrl } from "@/lib/breadcrumb-jsonld";
import { isMemberFollowsEnabled } from "@/lib/flags";
import {
  getPublishedSeriesBySlug,
  listRelatedPublishedSeriesCards,
  listSeriesSlugsForStaticParams,
} from "@/lib/series";
import {
  collectionDocumentTitleSegment,
  collectionMetaDescription,
} from "@/lib/series-seo";

type Props = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 300;

/** Empty published Collections stay reachable at runtime (noindex) via dynamicParams. */
export const dynamicParams = true;

export async function generateStaticParams() {
  const slugs = await listSeriesSlugsForStaticParams();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const series = await getPublishedSeriesBySlug(slug);
  if (!series) return { title: "Collections" };
  const titleSegment = collectionDocumentTitleSegment(series);
  const description = collectionMetaDescription(series);
  const empty = series.items.length === 0;
  const socialTitle = titleSegment;
  const ogImage = series.heroImage.trim()
    ? absolutePublicUrl(series.heroImage.trim())
    : undefined;
  return {
    title: titleSegment,
    description,
    alternates: { canonical: `/series/${series.slug}` },
    ...(empty ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: `${socialTitle} | ${site.name}`,
      description,
      url: `${site.url}/series/${series.slug}`,
      images: ogImage ? [ogImage] : undefined,
      type: "website",
      siteName: site.name,
    },
    twitter: {
      card: "summary_large_image",
      title: `${socialTitle} | ${site.name}`,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function SeriesDetailPage({ params }: Props) {
  const { slug } = await params;
  const series = await getPublishedSeriesBySlug(slug);
  if (!series) notFound();

  const relatedCollections = await listRelatedPublishedSeriesCards(series.id);

  return (
    <SeriesDetailView
      series={series}
      mode="public"
      relatedCollections={relatedCollections}
      memberFollowsEnabled={isMemberFollowsEnabled()}
    />
  );
}
