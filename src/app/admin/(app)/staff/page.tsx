import type { Metadata } from "next";
import {
  AdminRevokeStaffSessionsButton,
  AdminSessionList,
} from "@/components/admin/AdminSessionControls";
import { StaffTeamSection } from "@/components/admin/StaffAddMemberPanel";
import { StaffTeamList } from "@/components/admin/StaffTeamList";
import { ACCESS_LEVELS } from "@/lib/admin-access";
import {
  revokeAllSessionsForStaffAction,
  revokeStaffAdminSessionAction,
} from "@/lib/admin-session-actions";
import { loadOwnerAdminSessionGroups } from "@/lib/admin-session-ui";
import { requireAccess } from "@/lib/auth";
import { formatAdminDateTime } from "@/lib/datetime";
import { getDb } from "@/lib/db";
import {
  getConfiguredSystemOwnerEmail,
  isReservedSystemOwnerEmail,
  shouldLockOwnerAccessSelect,
  isCurrentStaffAccount,
  MIN_ADMIN_PASSWORD_LENGTH,
} from "@/lib/admin-staff";
import { AdminFlashStatus, STAFF_REMOVED_PARAMS } from "@/lib/admin-transient-feedback";

export const metadata: Metadata = {
  title: "Team Access",
};

function staffErrorMessage(error?: string) {
  switch (error) {
    case "missing":
      return "Name, email, and access level are required.";
    case "email":
      return "Enter a valid email address.";
    case "password":
      return `Password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`;
    case "exists":
      return "That email already has an admin account.";
    case "owner-email":
      return "This email belongs to the System Owner and cannot be assigned to another team member.";
    case "last-owner":
      return "Keep at least one owner.";
    case "self":
      return "You cannot remove your own account.";
    case "self-role":
      return "Your owner access cannot be changed while signed in.";
    default:
      return "";
  }
}

export default async function AdminStaffPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    created?: string;
    removed?: string;
    admin?: string;
    sessionRevoked?: string;
    sessionsRevoked?: string;
    sessionError?: string;
  }>;
}) {
  const actor = await requireAccess("staff");
  const {
    error,
    saved,
    created,
    removed,
    admin: focusAdminId,
    sessionRevoked,
    sessionsRevoked,
    sessionError,
  } = await searchParams;
  const admins = await getDb().admin.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      photoUrl: true,
      lastSeenAt: true,
      createdAt: true,
    },
  });

  const envOwnerEmail = getConfiguredSystemOwnerEmail();
  // System Owner is always shown independently — even if a conflicting Team row exists.
  const showSystemOwner = Boolean(envOwnerEmail);
  const namedOwnerCount = admins.filter((admin) => admin.role === "owner").length;
  const teamCount = admins.length;
  const signedInAsSystemOwner = showSystemOwner && actor.id === "env";

  const errorMessage = staffErrorMessage(error);
  const createError = errorMessage && !focusAdminId ? errorMessage : "";

  const teamMembers = admins.map((admin) => {
    // Exactly one "You": env session → System owner section only; named → matching row only.
    const isYou = signedInAsSystemOwner ? false : isCurrentStaffAccount(actor, admin);
    const canRemove = !isYou && !(admin.role === "owner" && namedOwnerCount <= 1);
    const reservedEmailConflict = isReservedSystemOwnerEmail(admin.email, envOwnerEmail);
    return {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      photoUrl: admin.photoUrl || "",
      lastLoginLabel: formatAdminDateTime(admin.lastSeenAt),
      isYou,
      lockOwnerRole: shouldLockOwnerAccessSelect(actor, admin),
      canRemove,
      reservedEmailConflict,
      noticeOk: focusAdminId === admin.id && saved ? "Changes saved." : "",
      noticeErr: focusAdminId === admin.id && errorMessage ? errorMessage : "",
      initiallyOpen: focusAdminId === admin.id && Boolean(saved || error),
    };
  });

  const countLabel = teamCount
    ? `${teamCount} team member${teamCount === 1 ? "" : "s"} · ${namedOwnerCount} owner${namedOwnerCount === 1 ? "" : "s"}`
    : "No team members yet.";

  const sessionGroups = await loadOwnerAdminSessionGroups(actor);

  return (
    <div className="w-full">
      <header className="border-b border-line pb-6">
        <h1 className="font-serif text-4xl text-ink">Team access</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Who can use Mesa’s admin, and what they can do.
        </p>
      </header>

      {removed ? (
        <AdminFlashStatus active clearParams={STAFF_REMOVED_PARAMS}>
          Admin removed.
        </AdminFlashStatus>
      ) : null}
      {sessionRevoked ? (
        <p
          role="status"
          className="mt-4 border border-olive/30 bg-olive/10 px-4 py-2.5 text-sm text-olive-dark"
        >
          Session revoked.
        </p>
      ) : null}
      {sessionsRevoked ? (
        <p
          role="status"
          className="mt-4 border border-olive/30 bg-olive/10 px-4 py-2.5 text-sm text-olive-dark"
        >
          Sessions revoked.
        </p>
      ) : null}
      {sessionError === "current" ? (
        <p
          role="alert"
          className="mt-4 border border-terracotta/30 bg-terracotta/10 px-4 py-2.5 text-sm text-terracotta-dark"
        >
          Use Sign out to leave this device.
        </p>
      ) : null}

      <StaffTeamSection
        countLabel={countLabel}
        created={Boolean(created)}
        errorMessage={createError || undefined}
      >
        {teamCount === 0 ? (
          <div className="mt-5 border-t border-dashed border-line py-10 text-center text-sm leading-6 text-muted">
            Add a team member to give someone access to Mesa admin.
          </div>
        ) : (
          <StaffTeamList members={teamMembers} />
        )}
      </StaffTeamSection>

      {showSystemOwner ? (
        <section className="mt-12" aria-labelledby="system-owner-heading">
          <h2 id="system-owner-heading" className="font-serif text-2xl text-ink">
            System owner
          </h2>
          <div className="mt-3 max-w-2xl space-y-1 text-sm leading-6">
            <p className="font-medium text-ink">
              System owner
              {signedInAsSystemOwner ? (
                <span className="ml-2 text-xs font-normal text-muted">You</span>
              ) : null}
            </p>
            <p className="text-muted">Owner · Recovery</p>
            <p className="break-words text-muted">{envOwnerEmail}</p>
            <p className="pt-2 text-muted">
              Recovery sign-in for Mesa. It is managed outside Team Access and is not edited here.
            </p>
          </div>
        </section>
      ) : null}

      <section className="mt-12" aria-labelledby="team-sessions-heading" id="team-sessions">
        <h2 id="team-sessions-heading" className="font-serif text-2xl text-ink">
          Sessions
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Active Mesa Studio sign-ins across the team. Revoke a device when access should end
          immediately.
        </p>

        {sessionGroups.length === 0 ? (
          <p className="mt-5 text-sm leading-6 text-muted">No active admin sessions right now.</p>
        ) : (
          <div className="mt-6 space-y-10">
            {sessionGroups.map((group) => (
              <div key={group.subjectKey} className="max-w-2xl">
                <div>
                  <p className="font-medium text-ink">{group.name}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {group.roleLabel}
                    {group.email ? ` · ${group.email}` : ""}
                  </p>
                </div>
                <AdminSessionList
                  sessions={group.sessions}
                  revokeAction={revokeStaffAdminSessionAction}
                  emptyCopy="No active sessions."
                />
                {group.sessions.some((session) => !session.isCurrent) ||
                group.sessions.length > 0 ? (
                  <AdminRevokeStaffSessionsButton
                    subjectKey={group.subjectKey}
                    staffName={group.name}
                    action={revokeAllSessionsForStaffAction}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12" aria-labelledby="access-levels-heading">
        <h2 id="access-levels-heading" className="font-serif text-2xl text-ink">
          Access levels
        </h2>
        <dl className="mt-4 max-w-2xl space-y-3">
          {ACCESS_LEVELS.map((level) => (
            <div
              key={level.id}
              className="sm:grid sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-baseline sm:gap-x-4"
            >
              <dt className="text-sm font-medium text-ink">{level.label}</dt>
              <dd className="mt-0.5 text-sm leading-6 text-muted sm:mt-0">{level.help}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
