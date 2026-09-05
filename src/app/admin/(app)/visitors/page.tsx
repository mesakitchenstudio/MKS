import type { Metadata } from "next";
import { VisitorsOverview } from "@/components/admin/VisitorsOverview";
import { canDeleteGuestVisitors } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import {
  getVisitorAudienceSummary,
  listGuestTrafficSources,
  listGuestsForAdminPaginated,
  listPopularGuestPaths,
  parseGuestKindFilter,
  parseAnalyticsRangeDays,
} from "@/lib/guest-analytics";
import { parseGuestTrafficSource } from "@/lib/guest-acquisition";

export const metadata: Metadata = {
  title: "Visitors",
};

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminVisitorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAccess("members");
  const canDelete = canDeleteGuestVisitors(admin.role);
  const raw = await searchParams;
  const range = parseAnalyticsRangeDays(firstParam(raw.range) ?? 7);
  const kind = parseGuestKindFilter(firstParam(raw.kind));
  const source = parseGuestTrafficSource(firstParam(raw.source));
  const q = String(firstParam(raw.q) ?? "").trim();
  const page = Math.max(1, Number(firstParam(raw.page) || 1) || 1);

  const [summary, popularBundle, trafficSources, list] = await Promise.all([
    getVisitorAudienceSummary(range),
    listPopularGuestPaths(range, 7),
    listGuestTrafficSources(range),
    listGuestsForAdminPaginated({ days: range, kind, source, q, page }),
  ]);

  return (
    <div>
      <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
        Visitors
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Anonymous website activity. Signed-in members are excluded.
      </p>

      <VisitorsOverview
        summary={summary}
        popular={popularBundle.items}
        comingSoonViews={popularBundle.comingSoonViews}
        trafficSources={trafficSources}
        list={list}
        range={range}
        kind={kind}
        source={source}
        q={q}
        canDeleteVisitors={canDelete}
      />
    </div>
  );
}
