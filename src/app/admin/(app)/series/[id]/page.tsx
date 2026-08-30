import { notFound } from "next/navigation";
import { SeriesEditor } from "@/components/admin/SeriesEditor";
import { requireAccess } from "@/lib/auth";
import { getAdminSeries, listSeriesPickerCandidates } from "@/lib/series-admin";

export const dynamic = "force-dynamic";

export default async function AdminSeriesEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAccess("content");
  const { id } = await params;
  const query = await searchParams;
  const [series, candidates] = await Promise.all([getAdminSeries(id), listSeriesPickerCandidates()]);
  if (!series) notFound();

  return (
    <div className="space-y-4">
      {query.saved ? (
        <p className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive" role="status">
          Series saved.
        </p>
      ) : null}
      {query.error ? (
        <p className="rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-2 text-sm text-terracotta" role="alert">
          Could not save series ({query.error}).
        </p>
      ) : null}
      <SeriesEditor series={series} candidates={candidates} />
    </div>
  );
}
