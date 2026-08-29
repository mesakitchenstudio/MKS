import Link from "next/link";
import { notFound } from "next/navigation";
import { MemberAvatar } from "@/components/admin/MemberPresence";
import { MemberLiveActivity, MemberLiveStatusLine } from "@/components/admin/MemberLivePresence";
import { MemberConnectionHistory } from "@/components/admin/MemberConnectionHistory";
import { RemoveMemberButton } from "@/components/admin/RemoveMemberButton";
import { VisitorNetworkSection } from "@/components/admin/VisitorNetworkSection";
import { getUserForAdmin } from "@/lib/accounts";
import { adminFocusRing } from "@/lib/admin-ui";
import { requireAccess } from "@/lib/auth";
import { formatAdminDate } from "@/lib/datetime";
import { guestDeviceClientLabel } from "@/lib/guest-client";
import { uniqueIps } from "@/lib/ip-utils";
import { formatSignInMethod, isMemberOnlineFromPresence } from "@/lib/member-presence";
import { formatApproxLocation, formatReferrerDisplay, pickLatestLocationConnection } from "@/lib/request-meta";

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

export default async function AdminMemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAccess("members");
  const { id } = await params;
  const user = await getUserForAdmin(id);
  if (!user) notFound();

  const latest =
    user.connections.find((item) => item.ip && item.ip !== "unknown") || user.connections[0];
  const first = user.connections[user.connections.length - 1] || latest;
  const lastSeen = user.lastSeenAt || latest?.createdAt;
  const online = isMemberOnlineFromPresence({
    online: user.online,
    lastSeenAt: user.lastSeenAt,
  });
  const signIn = formatSignInMethod(latest?.method);
  // Same connection selection as Members list LOCATION (newest with usable place).
  const locationConnection = pickLatestLocationConnection(user.connections) || latest;
  const approxLocation = locationConnection
    ? formatApproxLocation(locationConnection) || "—"
    : "—";
  const deviceClient = guestDeviceClientLabel(latest?.userAgent || "") || "—";
  const referrerDisplay = formatReferrerDisplay(latest?.referer || "");
  const ips = uniqueIps(user.connections.map((item) => item.ip));
  const signupEvent =
    first?.event === "signup" ? "Signup" : first?.event === "signin" ? "Sign-in" : "—";
  const connectionRows = user.connections.slice(0, 50);

  return (
    <div>
      <Link
        href="/admin/members"
        className={`text-sm font-semibold text-muted transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
      >
        ← Members
      </Link>

      <div className="mt-5 flex flex-wrap items-start gap-4">
        <MemberAvatar name={user.name} photoUrl={user.photoUrl} size="lg" />
        <div className="min-w-0">
          <h1 className="break-words font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
            {user.name}
          </h1>
          <p className="mt-1 break-all text-sm text-muted">{user.email}</p>
          <p className="mt-3 inline-flex flex-wrap items-center gap-2 text-sm text-ink">
            <MemberLiveStatusLine
              memberId={user.id}
              initialOnline={online}
              initialLastSeen={user.lastSeenAt}
            />
            <span className="text-muted">·</span>
            <span className="text-muted">Member</span>
          </p>
          <p className="mt-2 text-sm text-muted">Times in GMT</p>
        </div>
      </div>

      <section className="mt-8 border border-line bg-paper p-5 md:p-6">
        <h2 className={sectionLabel}>Account</h2>
        <dl className="mt-2">
          <DetailRow label="Name">{user.name}</DetailRow>
          <DetailRow label="Email">
            <span className="break-all">{user.email}</span>
          </DetailRow>
          <DetailRow label="Joined">{formatAdminDate(user.createdAt)}</DetailRow>
          <DetailRow label="Sign-in">{signIn}</DetailRow>
          <DetailRow label="First event">{signupEvent}</DetailRow>
          <DetailRow label="Saved recipes">{user._count.saves}</DetailRow>
        </dl>
      </section>

      <section className="mt-6 border border-line bg-paper p-5 md:p-6">
        <h2 className={sectionLabel}>Activity</h2>
        <dl className="mt-2">
          <MemberLiveActivity
            memberId={user.id}
            initialOnline={online}
            initialLastSeen={lastSeen}
          />
          <DetailRow label="Connections recorded">{user._count.connections}</DetailRow>
        </dl>
      </section>

      <MemberConnectionHistory
        totalCount={user._count.connections}
        connections={connectionRows.map((connection) => ({
          id: connection.id,
          ip: connection.ip,
          event: connection.event,
          method: connection.method,
          userAgent: connection.userAgent,
          city: connection.city,
          region: connection.region,
          country: connection.country,
          createdAt: connection.createdAt,
        }))}
      />

      <section className="mt-10">
        <h2 className="font-serif text-xl text-ink">Technical details</h2>
        <dl className="mt-3 border border-line bg-paper px-5">
          <DetailRow label="Device / client">{deviceClient}</DetailRow>
          <DetailRow label="Approx. location">{approxLocation}</DetailRow>
          <DetailRow label="Latest referrer">
            <span className="break-all" title={referrerDisplay.title}>
              {referrerDisplay.label}
            </span>
          </DetailRow>
          <DetailRow label="User agent">
            <span className="break-all font-mono text-xs leading-relaxed text-muted">
              {latest?.userAgent?.trim() || "—"}
            </span>
          </DetailRow>
        </dl>
      </section>

      <VisitorNetworkSection ips={ips} />

      <section className="mt-10 border border-line border-terracotta/25 bg-paper p-5 md:p-6">
        <h2 className={`${sectionLabel} text-terracotta/80`}>Danger zone</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Removing this member permanently deletes their account, saved recipes, and connection
          history. This cannot be undone.
        </p>
        <div className="mt-4">
          <RemoveMemberButton id={user.id} name={user.name} email={user.email} />
        </div>
      </section>
    </div>
  );
}
