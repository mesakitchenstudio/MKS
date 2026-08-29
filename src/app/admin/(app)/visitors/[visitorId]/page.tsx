import Link from "next/link";
import { notFound } from "next/navigation";
import { PresenceDot } from "@/components/admin/MemberPresence";
import { VisitorNetworkSection } from "@/components/admin/VisitorNetworkSection";
import { adminFocusRing } from "@/lib/admin-ui";
import { requireAccess } from "@/lib/auth";
import { formatAdminShortDateTime } from "@/lib/datetime";
import { getGuestForAdmin } from "@/lib/guest-analytics";
import {
  classifyGuestClient,
  guestClientKindLabel,
  guestDeviceClientLabel,
} from "@/lib/guest-client";
import { guestPathTitle } from "@/lib/guest-path-labels";
import { uniqueIps } from "@/lib/ip-utils";
import { formatGuestPresenceLabel, isGuestOnlineFromPresence } from "@/lib/guest-tracking";
import { formatApproxLocation, formatReferrerDisplay } from "@/lib/request-meta";
import { getAllRecipes } from "@/lib/recipes";

export const dynamic = "force-dynamic";

const sectionLabel =
  "text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive";

const botBadgeClass =
  "inline-flex rounded-full bg-sand px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink";

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
  const [guest, recipes] = await Promise.all([getGuestForAdmin(visitorId), getAllRecipes()]);
  if (!guest) notFound();

  const recipeTitles = new Map(recipes.map((recipe) => [recipe.slug, recipe.title]));
  const online = isGuestOnlineFromPresence({
    online: guest.online,
    lastSeenAt: guest.lastSeenAt,
  });
  const status = formatGuestPresenceLabel({
    online: guest.online,
    lastSeenAt: guest.lastSeenAt,
  });
  const shortKey = guest.visitorKey.slice(0, 8);
  const client = classifyGuestClient(guest.userAgent || "");
  const isBot = client.kind === "bot";
  const deviceClient = guestDeviceClientLabel(guest.userAgent || "");
  const pageViewCount = guest._count.pageViews;
  const currentPage = guest.lastPath || "—";
  const pageTitle = guest.lastPath ? guestPathTitle(guest.lastPath, recipeTitles) : "";
  const approxLocation = formatApproxLocation(guest) || "—";
  const ips = uniqueIps([guest.ip, ...guest.pageViews.map((view) => view.ip)]);
  const latestReferer =
    guest.pageViews.find((view) => view.referer)?.referer || "";
  const referrerDisplay = formatReferrerDisplay(latestReferer);

  return (
    <div>
      <Link
        href="/admin/visitors"
        className={`text-sm font-semibold text-muted transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
      >
        ← Visitors
      </Link>

      <div className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
            Guest {shortKey}
          </h1>
          {isBot ? <span className={botBadgeClass}>Bot</span> : null}
        </div>
        <p className="mt-1 break-all font-mono text-sm text-muted">{guest.visitorKey}</p>
        <p className="mt-3 inline-flex flex-wrap items-center gap-2 text-sm text-ink">
          <PresenceDot online={online} />
          {status}
          <span className="text-muted">·</span>
          <span className="text-muted">{guestClientKindLabel(client.kind)}</span>
        </p>
        <p className="mt-2 text-sm text-muted">Times in GMT</p>
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
            <div className="min-w-0">
              {pageTitle && pageTitle !== currentPage ? (
                <p className="font-semibold text-ink">{pageTitle}</p>
              ) : null}
              <p className="break-all font-mono text-xs text-ink sm:text-sm">{currentPage}</p>
            </div>
          </DetailRow>
          <DetailRow label="First seen">
            {formatAdminShortDateTime(guest.firstSeenAt, new Date(), { includeYear: true })}
          </DetailRow>
          <DetailRow label="Last seen">
            {formatAdminShortDateTime(guest.lastSeenAt, new Date(), { includeYear: true })}
          </DetailRow>
          <DetailRow label="Active tabs">{guest.activeConnections}</DetailRow>
          <DetailRow label="Page views">{pageViewCount}</DetailRow>
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-xl text-ink">
          Page history
          <span className="ml-2 font-sans text-sm font-normal text-muted">· {pageViewCount}</span>
        </h2>
        {guest.pageViews.length < pageViewCount ? (
          <p className="mt-1 text-sm text-muted">
            Showing latest {guest.pageViews.length}
          </p>
        ) : null}

        {guest.pageViews.length === 0 ? (
          <p className="mt-4 border border-dashed border-line bg-paper px-4 py-8 text-sm text-muted">
            This visitor has no recorded page views yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line border border-line bg-paper">
            {guest.pageViews.map((view) => {
              const title = guestPathTitle(view.path, recipeTitles);
              return (
                <li key={view.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-x-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{title}</p>
                      <p className="mt-0.5 break-all font-mono text-[0.65rem] text-muted">
                        {view.path}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs text-muted sm:pt-0.5 sm:text-right">
                      {formatAdminShortDateTime(view.createdAt, new Date(), { includeYear: true })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-xl text-ink">Visitor details</h2>
        <dl className="mt-3 border border-line bg-paper px-5">
          <DetailRow label="Classification">
            {isBot ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className={botBadgeClass}>Bot</span>
                <span>{client.label}</span>
              </span>
            ) : (
              guestClientKindLabel(client.kind)
            )}
          </DetailRow>
          <DetailRow label="Device / client">{deviceClient}</DetailRow>
          <DetailRow label="Approx. location">{approxLocation}</DetailRow>
          <DetailRow label="Latest referrer">
            <span className="break-all" title={referrerDisplay.title}>
              {referrerDisplay.label}
            </span>
          </DetailRow>
          <DetailRow label="User agent">
            <span className="break-all font-mono text-xs leading-relaxed text-muted">
              {guest.userAgent?.trim() || "—"}
            </span>
          </DetailRow>
        </dl>
      </section>

      <VisitorNetworkSection ips={ips} />
    </div>
  );
}
