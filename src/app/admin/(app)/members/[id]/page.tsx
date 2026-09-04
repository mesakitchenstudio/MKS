import Link from "next/link";
import { notFound } from "next/navigation";
import { MemberAvatar } from "@/components/admin/MemberPresence";
import { MemberLiveLastSeen } from "@/components/admin/MemberLivePresence";
import { MemberConnectionHistory } from "@/components/admin/MemberConnectionHistory";
import { MemberNetworkSection } from "@/components/admin/MemberNetworkSection";
import { RemoveMemberButton } from "@/components/admin/RemoveMemberButton";
import { canDeleteMembers, canViewGuestNetworkDiagnostics } from "@/lib/admin-access";
import { getUserForAdmin } from "@/lib/accounts";
import { adminFocusRing } from "@/lib/admin-ui";
import { requireAccess } from "@/lib/auth";
import { formatAdminDate } from "@/lib/datetime";
import { guestDeviceClientLabel } from "@/lib/guest-client";
import { uniqueIps } from "@/lib/ip-utils";
import { formatSignInMethod, isMemberOnlineFromPresence } from "@/lib/member-presence";
import { formatApproxLocation, formatReferrerDisplay, pickLatestLocationConnection } from "@/lib/request-meta";

export const dynamic = "force-dynamic";

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-line/80 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
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
  const admin = await requireAccess("members");
  const { id } = await params;
  const user = await getUserForAdmin(id);
  if (!user) notFound();

  const canEnrich = canViewGuestNetworkDiagnostics(admin.role);
  const canDelete = canDeleteMembers(admin.role);
  const latest =
    user.connections.find((item) => item.ip && item.ip !== "unknown") || user.connections[0];
  const lastSeen = user.lastSeenAt || latest?.createdAt;
  const online = isMemberOnlineFromPresence({
    online: user.online,
    lastSeenAt: user.lastSeenAt,
  });
  const signIn = formatSignInMethod(latest?.method);
  const locationConnection = pickLatestLocationConnection(user.connections) || latest;
  const approxLocation = locationConnection
    ? formatApproxLocation(locationConnection) || "—"
    : "—";
  const deviceClient = guestDeviceClientLabel(latest?.userAgent || "") || "—";
  const referrerDisplay = formatReferrerDisplay(latest?.referer || "");
  const ips = uniqueIps(user.connections.map((item) => item.ip));
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
        <MemberAvatar name={user.name} photoUrl={user.photoUrl} size="detail" />
        <div className="min-w-0">
          <h1 className="break-words font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
            {user.name}
          </h1>
          <p className="mt-1 break-all text-sm text-muted">{user.email}</p>
        </div>
      </div>

      <dl className="mt-8">
        <MetaRow label="Joined">{formatAdminDate(user.createdAt)}</MetaRow>
        <MetaRow label="Sign-in">{signIn}</MetaRow>
        <MetaRow label="Last seen">
          <MemberLiveLastSeen
            memberId={user.id}
            initialOnline={online}
            initialLastSeen={lastSeen}
          />
        </MetaRow>
        <MetaRow label="Saved recipes">{user._count.saves}</MetaRow>
      </dl>

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
        <h2 className="font-serif text-xl text-ink">Member context</h2>
        <dl className="mt-3">
          <MetaRow label="Last device">{deviceClient}</MetaRow>
          <MetaRow label="Approx. location">{approxLocation}</MetaRow>
        </dl>
      </section>

      <MemberNetworkSection
        ips={ips}
        userAgent={latest?.userAgent || ""}
        referrer={referrerDisplay.label !== "—" ? referrerDisplay.title || referrerDisplay.label : ""}
        canEnrich={canEnrich}
      />

      {canDelete ? (
        <section className="mt-12 border-t border-line/80 pt-8">
          <h2 className="text-sm font-semibold text-ink">Remove account</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Removing this member permanently deletes their account, saved recipes, and account
            activity. This cannot be undone.
          </p>
          <div className="mt-4">
            <RemoveMemberButton id={user.id} name={user.name} email={user.email} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
