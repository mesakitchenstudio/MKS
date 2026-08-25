import { VisitorsTable } from "@/components/admin/VisitorsTable";
import { requireAccess } from "@/lib/auth";
import { listGuestsForAdmin, listPopularGuestPaths } from "@/lib/guest-analytics";

export const dynamic = "force-dynamic";

export default async function AdminVisitorsPage() {
  await requireAccess("members");
  const [visitors, popularPaths] = await Promise.all([
    listGuestsForAdmin(),
    listPopularGuestPaths(),
  ]);

  return (
    <div>
      <h1 className="font-serif text-4xl">Visitors</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Anonymous guests browsing without signing in. Each browser gets a private visitor cookie;
        page views and a 45-second heartbeat update presence while they stay on the site.
      </p>

      <VisitorsTable visitors={visitors} popularPaths={popularPaths} />
    </div>
  );
}
