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
      <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
        Visitors
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Anonymous visitors and their recent browsing activity.
      </p>

      <VisitorsTable visitors={visitors} popularPaths={popularPaths} />
    </div>
  );
}
