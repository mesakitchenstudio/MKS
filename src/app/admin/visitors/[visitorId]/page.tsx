import Link from "next/link";
import { notFound } from "next/navigation";
import { PresenceDot } from "@/components/admin/MemberPresence";
import { adminFocusRing } from "@/lib/admin-ui";
import { requireAccess } from "@/lib/auth";
import { formatAdminDate, formatAdminShortDateTime } from "@/lib/datetime";
import { getGuestForAdmin } from "@/lib/guest-analytics";
import {
  classifyGuestClient,
  guestBrowserLabel,
  guestOsLabel,
} from "@/lib/guest-client";
import { guestPathTitle } from "@/lib/guest-path-labels";
import { isMemberOnline } from "@/lib/member-presence";
import { getAllRecipes } from "@/lib/recipes";

export const dynamic = "force-dynamic";

const sectionEyebrow =
  "text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive";

const botBadgeClass =
  "inline-flex rounded-full bg-sand px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
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
  const online = isMemberOnline(guest.lastSeenAt);
  const shortKey = guest.visitorKey.slice(0, 8);
  const client = classifyGuestClient(guest.userAgent || "");
  const isBot = client.kind === "bot";
  const pageViewCount = guest._count.pageViews;
  const osLabel = guestOsLabel(guest.userAgent || "");
  const browserLabel = guestBrowserLabel(guest.userAgent || "");

  return (
    <div>
      <Link
        href="/admin/visitors"
        className={`text-sm font-semibold text-muted transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
      >
        ← Back to visitors
      </Link>

      <div className="mt-6 border-b border-line pb-6">
        <p className={sectionEyebrow}>Visitor</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
            Guest {shortKey}
          </h1>
          {isBot ? <span className={botBadgeClass}>Bot</span> : null}
        </div>
        <p className="mt-2 text-sm text-muted">
          Anonymous visitor · First seen {formatAdminDate(guest.firstSeenAt)}
        </p>
        <p className="mt-1 text-sm text-muted">Times in GMT</p>
      </div>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryMetric
          label="Status"
          value={
            <span className="inline-flex items-center gap-2">
              <PresenceDot online={online} pulse={online} />
              {online ? "Online" : "Offline"}
            </span>
          }
        />
        <SummaryMetric
          label="First seen"
          value={formatAdminShortDateTime(guest.firstSeenAt, new Date(), { includeYear: true })}
        />
        <SummaryMetric
          label="Last seen"
          value={formatAdminShortDateTime(guest.lastSeenAt, new Date(), { includeYear: true })}
        />
        <SummaryMetric label="Page views" value={String(pageViewCount)} />
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-xl text-ink">Visitor details</h2>
        <dl className="mt-3 divide-y divide-line border border-line bg-paper px-5">
          <DetailRow label="Visitor ID">
            <span className="break-all font-mono text-xs text-ink sm:text-sm">
              {guest.visitorKey}
            </span>
          </DetailRow>
          <DetailRow label="Device / OS">{osLabel}</DetailRow>
          <DetailRow label="Browser / client">{browserLabel}</DetailRow>
          <DetailRow label="Classification">
            {isBot ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className={botBadgeClass}>Bot</span>
                <span>{client.label}</span>
              </span>
            ) : (
              client.kind === "unknown" ? "Unknown" : "Visitor"
            )}
          </DetailRow>
          <DetailRow label="User agent">
            <span className="break-all font-mono text-xs leading-relaxed">
              {guest.userAgent?.trim() || "—"}
            </span>
          </DetailRow>
          <DetailRow label="First seen">
            {formatAdminShortDateTime(guest.firstSeenAt, new Date(), { includeYear: true })}
          </DetailRow>
          <DetailRow label="Last seen">
            {formatAdminShortDateTime(guest.lastSeenAt, new Date(), { includeYear: true })}
          </DetailRow>
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-xl text-ink">Activity</h2>
        <p className="mt-1 text-sm text-muted">
          {pageViewCount
            ? `${pageViewCount} page view${pageViewCount === 1 ? "" : "s"} · Newest first${
                guest.pageViews.length < pageViewCount
                  ? ` · Showing latest ${guest.pageViews.length}`
                  : ""
              }`
            : "No page views recorded"}
        </p>

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
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{title}</p>
                      <p className="mt-0.5 break-all font-mono text-[0.65rem] text-muted">
                        {view.path}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs text-muted">
                      {formatAdminShortDateTime(view.createdAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border border-line bg-paper px-4 py-3">
      <div className="font-serif text-2xl leading-snug text-ink sm:text-3xl">{value}</div>
      <p className="mt-2 text-sm font-semibold text-ink">{label}</p>
    </div>
  );
}
