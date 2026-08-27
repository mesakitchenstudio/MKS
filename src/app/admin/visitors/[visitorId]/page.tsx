import Link from "next/link";
import { notFound } from "next/navigation";
import { PresenceDot } from "@/components/admin/MemberPresence";
import { VisitorTechnicalSection } from "@/components/admin/VisitorTechnicalSection";
import { adminFocusRing } from "@/lib/admin-ui";
import { requireAccess } from "@/lib/auth";
import { formatAdminDateTime } from "@/lib/datetime";
import { getGuestForAdmin } from "@/lib/guest-analytics";
import { classifyGuestClient, guestClientKindLabel } from "@/lib/guest-client";
import { uniqueIps } from "@/lib/ip-utils";
import { formatPresenceLabel, isMemberOnline } from "@/lib/member-presence";
import { formatLocation } from "@/lib/request-meta";
import { guestPathTitle } from "@/lib/guest-path-labels";

export const dynamic = "force-dynamic";

const sectionLabel =
  "text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-line py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
      <dt className="text-sm font-semibold text-ink">{label}</dt>
      <dd className="min-w-0 text-sm text-muted">{children}</dd>
    </div>
  );
}

export default async function AdminVisitorDetailPage({
  params,
}: {
  params: Promise<{ visitorId: string }>;
}) {
  await requireAccess("members");
  const { visitorId } = await params;
  const guest = await getGuestForAdmin(visitorId);
  if (!guest) notFound();

  const online = isMemberOnline(guest.lastSeenAt);
  const status = formatPresenceLabel(guest.lastSeenAt);
  const shortKey = guest.visitorKey.slice(0, 8);
  const currentPage = guest.lastPath || "—";
  const pageTitle = guest.lastPath ? guestPathTitle(guest.lastPath) : "";
  const where = formatLocation(guest) || "—";
  const client = classifyGuestClient(guest.userAgent);
  const ips = uniqueIps([guest.ip, ...guest.pageViews.map((view) => view.ip)]);
  const latestReferer =
    guest.pageViews.find((view) => view.referer)?.referer || "";

  return (
    <div>
      <Link
        href="/admin/visitors"
        className={`text-sm font-semibold text-muted transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
      >
        ← Visitors
      </Link>

      <div className="mt-4">
        <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
          Guest {shortKey}
        </h1>
        <p className="mt-1 break-all font-mono text-sm text-muted">{guest.visitorKey}</p>
        <p className="mt-3 inline-flex flex-wrap items-center gap-2 text-sm text-ink">
          <PresenceDot online={online} />
          {status}
          <span className="text-muted">·</span>
          <span className="text-muted">{guestClientKindLabel(client.kind)}</span>
        </p>
      </div>

      <section className="mt-8 border border-line bg-paper p-5 md:p-6">
        <h2 className={sectionLabel}>Activity</h2>
        <dl className="mt-2">
          <DetailRow label="Status">
            <span className="inline-flex items-center gap-2 text-ink">
              <PresenceDot online={online} />
              {status}
            </span>
          </DetailRow>
          <DetailRow label={online ? "Current page" : "Last page"}>
            <div>
              {pageTitle ? <p className="font-semibold text-ink">{pageTitle}</p> : null}
              <p className="font-mono text-xs text-ink sm:text-sm">{currentPage}</p>
            </div>
          </DetailRow>
          <DetailRow label="First seen">{formatAdminDateTime(guest.firstSeenAt)}</DetailRow>
          <DetailRow label="Last seen">{formatAdminDateTime(guest.lastSeenAt)}</DetailRow>
          <DetailRow label="Page views">{guest._count.pageViews}</DetailRow>
        </dl>
      </section>

      <VisitorTechnicalSection
        where={where}
        browser={client.label}
        clientKind={guestClientKindLabel(client.kind)}
        userAgent={guest.userAgent || "—"}
        referer={latestReferer}
        ips={ips}
        pageViews={guest.pageViews.map((view) => ({
          id: view.id,
          path: view.path,
          referer: view.referer,
          ip: view.ip,
          city: view.city,
          region: view.region,
          country: view.country,
          createdAt: view.createdAt,
        }))}
      />
    </div>
  );
}
