import Link from "next/link";
import { requireAccess } from "@/lib/auth";
import { listAdminSeries } from "@/lib/series-admin";
import { adminFocusRing, adminLinkClass, adminPrimaryButtonClass, adminTableHeadClass } from "@/lib/admin-ui";

export const dynamic = "force-dynamic";

export default async function AdminSeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  await requireAccess("content");
  const params = await searchParams;
  const rows = await listAdminSeries();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-ink">Series</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Editorial cooking series landing pages that group Mesa recipes and YouTube videos.
          </p>
        </div>
        <Link href="/admin/series/new" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
          New series
        </Link>
      </div>

      {params.deleted ? (
        <p className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-2 text-sm text-olive" role="status">
          Series deleted.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-sm border border-line">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className={adminTableHeadClass}>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Items</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Order</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-muted">
                  No series yet. Create Bread Basics or another collection when you are ready.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-line/70">
                  <td className="px-4 py-3">
                    <Link href={`/admin/series/${row.id}`} className={adminLinkClass}>
                      {row.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{row.slug}</td>
                  <td className="px-4 py-3">{row.itemCount}</td>
                  <td className="px-4 py-3">{row.isPublished ? "Published" : "Draft"}</td>
                  <td className="px-4 py-3">{row.sortOrder}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
