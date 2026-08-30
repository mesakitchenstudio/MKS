import { SeriesEditor } from "@/components/admin/SeriesEditor";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listSeriesPickerCandidates } from "@/lib/series-admin";

export const dynamic = "force-dynamic";

export default async function AdminSeriesNewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAccess("content");
  const query = await searchParams;
  const [candidates, recipeTypes] = await Promise.all([
    listSeriesPickerCandidates(),
    getDb().recipeType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-4">
      {query.error ? (
        <p className="rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-2 text-sm text-terracotta" role="alert">
          Could not create series ({query.error}).
        </p>
      ) : null}
      <SeriesEditor
        isNew
        candidates={candidates}
        recipeTypes={recipeTypes}
        series={{
          id: "",
          slug: "",
          title: "",
          shortTitle: "",
          description: "",
          intro: "",
          heroImage: "",
          seoTitle: "",
          seoDescription: "",
          syncMode: "CUSTOM",
          followYoutubeOrder: false,
          youtubePlaylistId: "",
          youtubePlaylistTitle: "",
          youtubePlaylistDescription: "",
          youtubePlaylistThumbnail: "",
          youtubePlaylistLastSyncedAt: null,
          isPublished: false,
          sortOrder: 0,
          items: [],
        }}
      />
    </div>
  );
}
