import { AdminPhotoField } from "@/components/admin/AdminPhotoField";
import { PendingSubmitButton } from "@/components/admin/PendingSubmitButton";
import { ACCESS_LEVELS, accessLabel } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import { formatAdminDateTime } from "@/lib/datetime";
import { getDb } from "@/lib/db";
import {
  MIN_ADMIN_PASSWORD_LENGTH,
  shouldLockOwnerAccessSelect,
  isCurrentStaffAccount,
} from "@/lib/admin-staff";
import { deleteAdminAction, saveAdminAction } from "../actions";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function roleTone(role: string) {
  if (role === "owner") return "bg-terracotta/15 text-terracotta-dark";
  if (role === "editor") return "bg-olive/15 text-olive-dark";
  return "bg-sand text-ink";
}

const fieldClass =
  "mt-1.5 w-full rounded-sm border border-line bg-cream px-3 py-2.5 text-sm text-ink outline-none transition focus:border-terracotta";

const noticeOk = "mt-4 border border-olive/30 bg-olive/10 px-4 py-3 text-sm text-olive-dark";
const noticeErr = "mt-4 border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta-dark";

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
  const showEnvOwnerCard = Boolean(envOwnerEmail) && !envOwnerHasNamedRow;
  const ownerCount =
    admins.filter((admin) => admin.role === "owner").length + (showEnvOwnerCard ? 1 : 0);
  const teamCount = admins.length + (showEnvOwnerCard ? 1 : 0);

  const errorMessage = staffErrorMessage(error);
  const createError = errorMessage && !focusAdminId ? errorMessage : "";
  const pageRemoved = removed ? "Admin removed." : "";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">Studio access</p>
          <h1 className="mt-2 font-serif text-4xl text-ink">Admins</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Create studio logins and choose what each person can open in Mesa admin. Multiple owners
            are allowed; the studio always keeps at least one.
          </p>
        </div>
        <div className="rounded-sm border border-line bg-paper px-4 py-3 text-sm">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">Signed in</p>
          <p className="mt-1 font-semibold text-ink">{actor.name}</p>
          <p className="text-xs text-muted">
            {accessLabel(actor.role)}
            {actor.email ? ` · ${actor.email}` : ""}
          </p>
        </div>
      </div>

      {pageRemoved ? <p className={noticeOk}>{pageRemoved}</p> : null}

      <section className="mt-8">
        <h2 className="font-serif text-2xl text-ink">Access levels</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {ACCESS_LEVELS.map((level) => (
            <div key={level.id} className="border border-line bg-paper px-4 py-4">
              <span
                className={`inline-block rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide ${roleTone(level.id)}`}
              >
                {level.label}
              </span>
              <p className="mt-3 text-sm leading-6 text-muted">{level.help}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 border border-line bg-paper">
        <div className="border-b border-line bg-cream px-5 py-4">
          <h2 className="font-serif text-2xl text-ink">Add admin</h2>
          <p className="mt-1 text-sm text-muted">
            Create a studio login with a name, email, password, and access level.
          </p>
        </div>
        {created ? <p className={`mx-5 ${noticeOk}`}>Admin account created.</p> : null}
        {createError ? <p className={`mx-5 ${noticeErr}`}>{createError}</p> : null}
        <form action={saveAdminAction} className="grid gap-4 p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <p className="text-sm font-semibold text-ink">Profile photo</p>
            <div className="mt-2">
              <AdminPhotoField />
            </div>
          </div>
          <label className="grid text-sm font-semibold text-ink">
            Full name
            <input name="name" required autoComplete="name" className={fieldClass} />
          </label>
          <label className="grid text-sm font-semibold text-ink">
            Email
            <input name="email" type="email" required autoComplete="email" className={fieldClass} />
          </label>
          <label className="grid text-sm font-semibold text-ink">
            Password
            <input
              name="password"
              type="password"
              minLength={MIN_ADMIN_PASSWORD_LENGTH}
              required
              autoComplete="new-password"
              placeholder={`At least ${MIN_ADMIN_PASSWORD_LENGTH} characters`}
              className={fieldClass}
            />
          </label>
          <label className="grid text-sm font-semibold text-ink">
            Access level
            <select name="role" defaultValue="editor" className={fieldClass}>
              {ACCESS_LEVELS.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.label} — {level.help}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-2">
            <PendingSubmitButton
              pendingLabel="Adding…"
              className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-paper hover:bg-terracotta-dark disabled:hover:bg-terracotta"
            >
              Add admin
            </PendingSubmitButton>
          </div>
        </form>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-ink">Team</h2>
            <p className="mt-1 text-sm text-muted">
              {teamCount
                ? `${teamCount} admin${teamCount === 1 ? "" : "s"} with studio access · ${ownerCount} owner${ownerCount === 1 ? "" : "s"}.`
                : "No named admins yet."}
            </p>
          </div>
        </div>

        {teamCount === 0 ? (
          <div className="mt-5 border border-dashed border-line bg-paper px-5 py-10 text-center text-sm leading-6 text-muted">
            Add an admin above. The owner email from <span className="font-semibold text-ink">ADMIN_EMAIL</span>{" "}
            can still sign in with the owner password.
          </div>
        ) : (
          <ul className="mt-5 space-y-4">
            {showEnvOwnerCard ? (
              <li className="border border-line bg-paper">
                <div className="flex flex-wrap items-center gap-4 border-b border-line bg-cream px-5 py-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sand text-sm font-semibold text-ink">
                    {initials("Owner") || "O"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">Owner</p>
                      {actor.id === "env" ||
                      actor.email.toLowerCase() === envOwnerEmail ? (
                        <span className="rounded-full bg-paper px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
                          You
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${roleTone("owner")}`}
                      >
                        Owner
                      </span>
                      <span className="rounded-full bg-paper px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
                        Env login
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted">{envOwnerEmail}</p>
                  </div>
                </div>
                <div className="space-y-3 px-5 py-5 text-sm leading-6 text-muted">
                  <p>
                    This is the bootstrap owner from <span className="font-semibold text-ink">ADMIN_EMAIL</span>
                    . It signs in with the site owner password and is not a named Team row, so it cannot be
                    edited or removed here.
                  </p>
                  <p>
                    To manage this account like other admins (name, photo, password reset from this page),
                    add an admin with the same email and Owner access — or keep using this env login as-is.
                  </p>
                </div>
              </li>
            ) : null}
            {admins.map((admin) => {
              const isYou = isCurrentStaffAccount(actor, admin);
              const lockOwnerRole = shouldLockOwnerAccessSelect(actor, admin);
              const cardError =
                focusAdminId === admin.id && errorMessage ? errorMessage : "";
              const cardSaved = focusAdminId === admin.id && saved ? "Changes saved." : "";

              return (
                <li key={admin.id} id={`admin-${admin.id}`} className="border border-line bg-paper">
                  <div className="flex flex-wrap items-center gap-4 border-b border-line bg-cream px-5 py-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sand text-sm font-semibold text-ink">
                      {admin.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={admin.photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initials(admin.name) || "?"
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{admin.name}</p>
                        {isYou ? (
                          <span className="rounded-full bg-paper px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
                            You
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${roleTone(admin.role)}`}
                        >
                          {accessLabel(admin.role)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted">{admin.email}</p>
                    </div>
                    <p className="text-xs text-muted">
                      Last login {formatAdminDateTime(admin.lastSeenAt)}
                    </p>
                  </div>

                  {cardSaved ? <p className={`mx-5 ${noticeOk}`}>{cardSaved}</p> : null}
                  {cardError ? <p className={`mx-5 ${noticeErr}`}>{cardError}</p> : null}

                  <form action={saveAdminAction} className="grid gap-4 p-5 md:grid-cols-2">
                    <input type="hidden" name="id" value={admin.id} />
                    <div className="md:col-span-2">
                      <p className="text-sm font-semibold text-ink">Profile photo</p>
                      <div className="mt-2">
                        <AdminPhotoField defaultValue={admin.photoUrl || ""} />
                      </div>
                    </div>
                    <label className="grid text-sm font-semibold text-ink">
                      Full name
                      <input name="name" defaultValue={admin.name} required className={fieldClass} />
                    </label>
                    <label className="grid text-sm font-semibold text-ink">
                      Email
                      <input
                        name="email"
                        type="email"
                        defaultValue={admin.email}
                        required
                        className={fieldClass}
                      />
                    </label>
                    <label className="grid text-sm font-semibold text-ink">
                      New password
                      <input
                        name="password"
                        type="password"
                        minLength={MIN_ADMIN_PASSWORD_LENGTH}
                        placeholder="Leave blank to keep current"
                        autoComplete="new-password"
                        className={fieldClass}
                      />
                    </label>
                    {lockOwnerRole ? (
                      <div className="grid text-sm font-semibold text-ink">
                        Access level
                        <input type="hidden" name="role" value="owner" />
                        <p
                          id={`owner-role-lock-${admin.id}`}
                          className={`${fieldClass} cursor-not-allowed opacity-70`}
                          aria-disabled="true"
                        >
                          Owner
                        </p>
                        <p className="mt-1.5 text-xs font-normal text-muted">
                          Your owner access cannot be changed while signed in.
                        </p>
                      </div>
                    ) : (
                      <label className="grid text-sm font-semibold text-ink">
                        Access level
                        <select name="role" defaultValue={admin.role} className={fieldClass}>
                          {ACCESS_LEVELS.map((level) => (
                            <option key={level.id} value={level.id}>
                              {level.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                      <PendingSubmitButton
                        pendingLabel="Saving…"
                        className="rounded-full bg-terracotta px-5 py-2 text-sm font-semibold text-paper hover:bg-terracotta-dark disabled:hover:bg-terracotta"
                      >
                        Save changes
                      </PendingSubmitButton>
                      {isYou ? (
                        <span className="text-sm text-muted">You cannot remove your own account.</span>
                      ) : (
                        <PendingSubmitButton
                          pendingLabel="Removing…"
                          formAction={deleteAdminAction}
                          className="rounded-full border border-line px-5 py-2 text-sm font-semibold text-muted hover:border-terracotta hover:text-terracotta disabled:hover:border-line disabled:hover:text-muted"
                        >
                          Remove
                        </PendingSubmitButton>
                      )}
                    </div>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
