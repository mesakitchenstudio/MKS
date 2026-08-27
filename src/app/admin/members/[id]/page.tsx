import Link from "next/link";
import { notFound } from "next/navigation";
import { MemberAvatar, PresenceDot } from "@/components/admin/MemberPresence";
import { MemberTechnicalSection } from "@/components/admin/MemberTechnicalSection";
import { RemoveMemberButton } from "@/components/admin/RemoveMemberButton";
import { getUserForAdmin } from "@/lib/accounts";
import { adminFocusRing } from "@/lib/admin-ui";
import { requireAccess } from "@/lib/auth";
import { formatAdminDate, formatAdminDateTime } from "@/lib/datetime";
import { uniqueIps } from "@/lib/ip-utils";
import { formatPresenceLabel, formatSignInMethod, isMemberOnline } from "@/lib/member-presence";
import { formatBrowser, formatLocation } from "@/lib/request-meta";

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
  const online = isMemberOnline(user.lastSeenAt);
  const status = formatPresenceLabel(user.lastSeenAt);
  const signIn = formatSignInMethod(latest?.method);
  const where = latest ? formatLocation(latest) || "—" : "—";
  const browser = formatBrowser(latest?.userAgent || "") || "—";
  const ips = uniqueIps(user.connections.map((item) => item.ip));
  const signupEvent =
    first?.event === "signup" ? "Signup" : first?.event === "signin" ? "Sign-in" : "—";

  return (
    <div>
      <Link
        href="/admin/members"
        className={`text-sm font-semibold text-muted transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
      >
        ← Members
      </Link>

      <div className="mt-4 flex flex-wrap items-start gap-4">
        <MemberAvatar name={user.name} photoUrl={user.photoUrl} size="lg" />
        <div className="min-w-0">
          <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
            {user.name}
          </h1>
          <p className="mt-1 text-sm text-muted">{user.email}</p>
        </div>
      </div>

      <section className="mt-8 border border-line bg-paper p-5 md:p-6">
        <h2 className={sectionLabel}>Account</h2>
        <dl className="mt-2">
          <DetailRow label="Name">{user.name}</DetailRow>
          <DetailRow label="Email">{user.email}</DetailRow>
          <DetailRow label="Joined">{formatAdminDate(user.createdAt)}</DetailRow>
          <DetailRow label="Sign-in">{signIn}</DetailRow>
          <DetailRow label="First event">{signupEvent}</DetailRow>
          <DetailRow label="Saved recipes">{user._count.saves}</DetailRow>
        </dl>
      </section>

      <section className="mt-6 border border-line bg-paper p-5 md:p-6">
        <h2 className={sectionLabel}>Activity</h2>
        <dl className="mt-2">
          <DetailRow label="Status">
            <span className="inline-flex items-center gap-2 text-ink">
              <PresenceDot online={online} />
              {status}
            </span>
          </DetailRow>
          <DetailRow label="Last seen">{formatAdminDateTime(lastSeen)}</DetailRow>
          <DetailRow label="Connections recorded">{user._count.connections}</DetailRow>
        </dl>
      </section>

      <MemberTechnicalSection
        where={where}
        browser={browser}
        referer={latest?.referer || ""}
        ips={ips}
        connections={user.connections.slice(0, 20).map((connection) => ({
          id: connection.id,
          ip: connection.ip,
          event: connection.event,
          method: connection.method,
          userAgent: connection.userAgent,
          city: connection.city,
          region: connection.region,
          country: connection.country,
          referer: connection.referer,
          createdAt: connection.createdAt,
        }))}
      />

      <section className="mt-8 border border-line border-terracotta/25 bg-paper p-5 md:p-6">
        <h2 className={`${sectionLabel} text-terracotta/80`}>Danger zone</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Removing this member deletes their account, saved recipes, and connection history. This
          cannot be undone.
        </p>
        <div className="mt-4">
          <RemoveMemberButton id={user.id} name={user.name} email={user.email} />
        </div>
      </section>
    </div>
  );
}
