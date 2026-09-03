import Link from "next/link";
import { notFound } from "next/navigation";
import { PresenceDot } from "@/components/admin/MemberPresence";
import { RemoveGuestVisitorButton } from "@/components/admin/RemoveGuestVisitorButton";
import { VisitorNetworkSection } from "@/components/admin/VisitorNetworkSection";
import { adminFocusRing } from "@/lib/admin-ui";
import { requireAccess } from "@/lib/auth";
import { formatAdminShortDateTime } from "@/lib/datetime";
import { deriveGuestAcquisition } from "@/lib/guest-acquisition";
import { getGuestForAdmin } from "@/lib/guest-analytics";
import {
  classifyGuestClient,
  formatGuestOsBrowserLabel,
  guestBrowserLabel,
  guestOsLabel,
} from "@/lib/guest-client";
import { guestPathTitle } from "@/lib/guest-path-labels";
import { uniqueIps } from "@/lib/ip-utils";
import { formatGuestPresenceLabel, isGuestOnlineFromPresence } from "@/lib/guest-tracking";
import { formatApproxLocation, formatReferrerDisplay } from "@/lib/request-meta";
import { getAllRecipes } from "@/lib/recipes";

export const dynamic = "force-dynamic";

const sectionLabel =
  "text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive";

const kindBadgeClass =
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
  const pageViewCount = guest._count.pageViews;
  const journey = [...guest.pageViews].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const acquisition = deriveGuestAcquisition(journey);
  const landingTitle = acquisition.landingPath
    ? guestPathTitle(acquisition.landingPath, recipeTitles)
    : "";
  const firstRef = formatReferrerDisplay(acquisition.firstExternalReferer);
  const latestRef = formatReferrerDisplay(acquisition.latestExternalReferer);
  const hasExternal = Boolean(acquisition.firstExternalReferer);
  const refsDiffer =
    hasExternal &&
    Boolean(acquisition.latestExternalReferer) &&
    acquisition.firstExternalReferer !== acquisition.latestExternalReferer;
  const approxLocation = formatApproxLocation(guest) || "—";
  const ips = uniqueIps([guest.ip, ...guest.pageViews.map((view) => view.ip)]);
  const deviceLabel = formatGuestOsBrowserLabel(guest.userAgent || "");
  const kindText =
    client.kind === "bot"
      ? client.label
      : client.kind === "unknown"
        ? "Unknown"
        : "Human";
  const showActiveTabs = online && guest.activeConnections > 0;

  return (
    <div>
      <Link
        href="/admin/visitors"
        className={`text-sm font-semibold text-muted transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
      >
        ← Visitors
      </Link>

      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
            Guest {shortKey}
          </h1>
          <span className={kindBadgeClass}>{kindText}</span>
        </div>
        <p className="mt-3 inline-flex flex-wrap items-center gap-2 text-sm text-ink">
          <PresenceDot online={online} />
          <span>
            <span className="sr-only">Status: </span>
            {status}
          </span>
        </p>
        <p className="mt-3 text-sm text-muted">
          {pageViewCount} page view{pageViewCount === 1 ? "" : "s"}
          <span aria-hidden> · </span>
          First seen{" "}
          {formatAdminShortDateTime(guest.firstSeenAt, new Date(), { includeYear: true })}
          <span aria-hidden> · </span>
          Last seen{" "}
          {formatAdminShortDateTime(guest.lastSeenAt, new Date(), { includeYear: true })}
        </p>
        <p className="mt-1 text-xs text-muted">Times in GMT</p>
      </header>

      <section className="mt-8 border border-line bg-paper p-5 md:p-6" aria-labelledby="how-arrived">
        <h2 id="how-arrived" className={sectionLabel}>
          How they arrived
        </h2>
        <dl className="mt-2">
          <DetailRow label="Source">{acquisition.sourceLabel}</DetailRow>
          <DetailRow label="Landing page">
            {acquisition.landingPath ? (
              <div>
                <p className="font-semibold text-ink">{landingTitle}</p>
                <p className="mt-0.5 break-all font-mono text-xs">{acquisition.landingPath}</p>
              </div>
            ) : (
              "—"
            )}
          </DetailRow>
          {!hasExternal ? (
            <DetailRow label="External referrer">None</DetailRow>
          ) : refsDiffer ? (
            <>
              <DetailRow label="First external referrer">
                <span className="break-all" title={firstRef.title}>
                  {firstRef.label}
                </span>
              </DetailRow>
              <DetailRow label="Latest external referrer">
                <span className="break-all" title={latestRef.title}>
                  {latestRef.label}
                </span>
              </DetailRow>
            </>
          ) : (
            <DetailRow label="External referrer">
              <span className="break-all" title={firstRef.title}>
                {firstRef.label}
              </span>
            </DetailRow>
          )}
        </dl>
      </section>

      <section className="mt-10" aria-labelledby="page-journey">
        <h2 id="page-journey" className="font-serif text-xl text-ink">
          Page journey
          <span className="ml-2 font-sans text-sm font-normal text-muted">· {pageViewCount}</span>
        </h2>
        <p className="mt-1 text-xs text-muted">Pages viewed in chronological order.</p>
        {guest.pageViews.length < pageViewCount ? (
          <p className="mt-1 text-sm text-muted">
            Showing the earliest {guest.pageViews.length} of {pageViewCount} recorded views
          </p>
        ) : null}

        {journey.length === 0 ? (
          <p className="mt-4 border border-dashed border-line bg-paper px-4 py-8 text-sm text-muted">
            This visitor has no recorded page views yet.
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-line border border-line bg-paper">
            {journey.map((view, index) => {
              const title = guestPathTitle(view.path, recipeTitles);
              const isLanding = index === 0;
              return (
                <li key={view.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-x-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">
                        {title}
                        {isLanding ? (
                          <span className="ml-2 text-[0.65rem] font-semibold uppercase tracking-wide text-olive">
                            Landing
                          </span>
                        ) : null}
                      </p>
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
          </ol>
        )}
      </section>

      <section className="mt-10 border border-line bg-paper p-5 md:p-6" aria-labelledby="visitor-context">
        <h2 id="visitor-context" className={sectionLabel}>
          Visitor context
        </h2>
        <dl className="mt-2">
          <DetailRow label="Device">{deviceLabel}</DetailRow>
          <DetailRow label="OS">{guestOsLabel(guest.userAgent || "")}</DetailRow>
          <DetailRow label="Browser">{guestBrowserLabel(guest.userAgent || "")}</DetailRow>
          <DetailRow label="Approx. location">
            <span title="Approximate city-level estimate from network headers">
              {approxLocation}
            </span>
          </DetailRow>
        </dl>
      </section>

      <div className="mt-10">
        <VisitorNetworkSection
          ips={ips}
          visitorKey={guest.visitorKey}
          userAgent={guest.userAgent || ""}
          activeConnections={showActiveTabs ? guest.activeConnections : undefined}
        />
      </div>

      <section className="mt-12 border-t border-line pt-8">
        <h2 className="text-sm font-semibold text-ink">Remove visitor</h2>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Permanently deletes this anonymous visitor and related page views. Prefer this only for
          abuse cleanup or privacy requests.
        </p>
        <div className="mt-4">
          <RemoveGuestVisitorButton id={guest.id} redirectTo="/admin/visitors" />
        </div>
      </section>
    </div>
  );
}
