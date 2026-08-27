import { StaffTeamSection } from "@/components/admin/StaffAddMemberPanel";
import { StaffTeamList } from "@/components/admin/StaffTeamList";
import { ACCESS_LEVELS } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import { formatAdminDateTime } from "@/lib/datetime";
import { getDb } from "@/lib/db";
import {
  shouldLockOwnerAccessSelect,
  isCurrentStaffAccount,
  MIN_ADMIN_PASSWORD_LENGTH,
} from "@/lib/admin-staff";

function roleTone(role: string) {
  if (role === "owner") return "bg-terracotta/15 text-terracotta-dark";
  if (role === "editor") return "bg-olive/15 text-olive-dark";
  return "bg-sand text-ink";
}

const noticeOk = "mt-4 border border-olive/30 bg-olive/10 px-4 py-3 text-sm text-olive-dark";

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
  }>;
}) {
  const actor = await requireAccess("staff");
  const { error, saved, created, removed, admin: focusAdminId } = await searchParams;
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

  const envOwnerEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() || "";
  const envOwnerHasNamedRow = envOwnerEmail
    ? admins.some((admin) => admin.email.toLowerCase() === envOwnerEmail)
    : false;
  const showSystemOwner = Boolean(envOwnerEmail) && !envOwnerHasNamedRow;
  const namedOwnerCount = admins.filter((admin) => admin.role === "owner").length;
  const teamCount = admins.length;
  const signedInAsSystemOwner = showSystemOwner && actor.id === "env";

  const errorMessage = staffErrorMessage(error);
  const createError = errorMessage && !focusAdminId ? errorMessage : "";
  const pageRemoved = removed ? "Admin removed." : "";

  const teamMembers = admins.map((admin) => {
    const isYou = isCurrentStaffAccount(actor, admin);
    const canRemove = !isYou && !(admin.role === "owner" && namedOwnerCount <= 1);
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
      noticeOk: focusAdminId === admin.id && saved ? "Changes saved." : "",
      noticeErr: focusAdminId === admin.id && errorMessage ? errorMessage : "",
      initiallyOpen: focusAdminId === admin.id && Boolean(saved || error),
    };
  });

  const countLabel = teamCount
    ? `${teamCount} team member${teamCount === 1 ? "" : "s"} · ${namedOwnerCount} owner${namedOwnerCount === 1 ? "" : "s"}`
    : "No team members yet.";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="border-b border-line pb-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          Studio access
        </p>
        <h1 className="mt-2 font-serif text-4xl text-ink">Team access</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Manage who can access Mesa admin and what each person can do.
          <br />
          Multiple owners are allowed; Mesa always keeps at least one owner.
        </p>
      </div>

      {pageRemoved ? <p className={noticeOk}>{pageRemoved}</p> : null}

      {showSystemOwner ? (
        <section className="mt-8">
          <h2 className="font-serif text-2xl text-ink">System owner</h2>
          <div className="mt-4 border border-line bg-paper px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-ink">Owner</p>
              <span className="rounded-full bg-cream px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
                System
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${roleTone("owner")}`}
              >
                Owner
              </span>
              {signedInAsSystemOwner ? (
                <span className="rounded-full bg-cream px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
                  You
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted">{envOwnerEmail}</p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Primary recovery account for Mesa administration. This account is managed through the
              server configuration.
            </p>
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="font-serif text-2xl text-ink">Access levels</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {ACCESS_LEVELS.map((level) => (
            <div key={level.id} className="border border-line bg-paper px-4 py-3">
              <span
                className={`inline-block rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide ${roleTone(level.id)}`}
              >
                {level.label}
              </span>
              <p className="mt-2 text-sm leading-5 text-muted">{level.help}</p>
            </div>
          ))}
        </div>
      </section>

      <StaffTeamSection
        countLabel={countLabel}
        created={Boolean(created)}
        errorMessage={createError || undefined}
      >
        {teamCount === 0 ? (
          <div className="mt-5 border border-dashed border-line bg-paper px-5 py-10 text-center text-sm leading-6 text-muted">
            Add a team member to give someone access to Mesa admin.
          </div>
        ) : (
          <StaffTeamList members={teamMembers} />
        )}
      </StaffTeamSection>
    </div>
  );
}
