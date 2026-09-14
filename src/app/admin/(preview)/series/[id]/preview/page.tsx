import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeriesDetailView } from "@/components/series/SeriesDetailView";
import { SeriesPreviewBanner } from "@/components/series/SeriesPreviewBanner";
import { SeriesPreviewEngagementGate } from "@/components/series/SeriesPreviewEngagementGate";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  getSeriesDetailByIdForAdminPreview,
  listRelatedPublishedSeriesCards,
} from "@/lib/series";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const row = await getDb().series.findUnique({
    where: { id },
    select: { title: true, slug: true, isPublished: true },
  });
  if (!row) {
    return {
      title: "Collection Preview",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${row.title} — Preview`,
    robots: { index: false, follow: false },
    ...(row.isPublished ? { alternates: { canonical: `/series/${row.slug}` } } : {}),
  };
}

export default async function AdminSeriesPreviewPage({ params }: Props) {
  await requireAccess("content");
  const { id } = await params;
  const detail = await getSeriesDetailByIdForAdminPreview(id);
  if (!detail) notFound();

  const relatedCollections = await listRelatedPublishedSeriesCards(id);
  const editorHref = `/admin/series/${id}`;
  const liveHref = detail.isPublished ? `/series/${detail.slug}` : undefined;

  return (
    <SeriesPreviewEngagementGate>
      <SeriesPreviewBanner
        published={detail.isPublished}
        editorHref={editorHref}
        liveHref={liveHref}
      />
      <SeriesDetailView
        series={detail}
        mode="preview"
        relatedCollections={relatedCollections}
      />
    </SeriesPreviewEngagementGate>
  );
}
