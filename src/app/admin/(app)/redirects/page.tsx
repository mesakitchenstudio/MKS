import type { Metadata } from "next";
import { setRedirectActiveAction } from "@/app/admin/actions";
import {
  adminSecondaryButtonClass,
  adminWorkspaceCategories,
} from "@/lib/admin-ui";
import { requireAccess } from "@/lib/auth";
import { formatAdminDateTimeUtc } from "@/lib/datetime";
import { listRedirectsForAdmin } from "@/lib/redirects";

export const metadata: Metadata = {
  title: "Redirects",
};

export default async function AdminRedirectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    deactivated?: string;
    activated?: string;
    error?: string;
  }>;
}) {
  await requireAccess("content");
  const query = await searchParams;
  const redirects = await listRedirectsForAdmin();

  return (
    <div className={`min-w-0 ${adminWorkspaceCategories}`}>
      <header className="mb-6">
        <h1 className="font-serif text-3xl text-ink">Redirects</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Permanent redirects for published recipe URL changes. Renaming a published
          recipe creates a redirect from the old path automatically. Deactivate a
          row to stop following it.
        </p>
      </header>

      {query.deactivated === "1" ? (
        <p className="mb-4 text-sm font-semibold text-olive" role="status">
          Redirect deactivated.
        </p>
      ) : null}
      {query.activated === "1" ? (
        <p className="mb-4 text-sm font-semibold text-olive" role="status">
          Redirect activated.
        </p>
      ) : null}
      {query.error === "missing" ? (
        <p className="mb-4 text-sm font-semibold text-terracotta" role="alert">
          That redirect could not be updated.
        </p>
      ) : null}

      {redirects.length === 0 ? (
        <p className="text-sm text-muted">No redirects yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-line">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line bg-cream/40 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">From</th>
                <th className="px-3 py-2 font-semibold">To</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Source</th>
                <th className="px-3 py-2 font-semibold">Updated</th>
                <th className="px-3 py-2 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {redirects.map((row) => (
                <tr key={row.id} className="border-b border-line/70 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs text-ink">{row.fromPath}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink">{row.toPath}</td>
                  <td className="px-3 py-2">
                    {row.isActive ? (
                      <span className="font-semibold text-olive">Active</span>
                    ) : (
                      <span className="text-muted">Inactive</span>
                    )}
                    <span className="ml-1 text-muted">· {row.statusCode}</span>
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {row.source === "recipe_slug_change" ? "Slug change" : row.source}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {formatAdminDateTimeUtc(row.updatedAt)}
                  </td>
                  <td className="px-3 py-2">
                    <form action={setRedirectActiveAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <input
                        type="hidden"
                        name="isActive"
                        value={row.isActive ? "0" : "1"}
                      />
                      <button type="submit" className={adminSecondaryButtonClass}>
                        {row.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
