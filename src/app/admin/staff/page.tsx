import { ACCESS_LEVELS, accessLabel } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { deleteAdminAction, saveAdminAction } from "../actions";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatWhen(value: Date) {
  return `${pad(value.getDate())}${pad(value.getMonth() + 1)}${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

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

export default async function AdminStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const actor = await requireAccess("staff");
  const { error, saved } = await searchParams;
  const admins = await getDb().admin.findMany({ orderBy: { createdAt: "asc" } });

  const errorMessage =
    error === "missing"
      ? "Name, email, and access level are required."
      : error === "password"
        ? "New admins need a password of at least 10 characters."
        : error === "exists"
          ? "That email already has an admin account."
          : error === "last-owner"
            ? "Keep at least one owner."
            : error === "self"
              ? "You cannot delete your own admin account."
              : "";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">Studio access</p>
          <h1 className="mt-2 font-serif text-4xl text-ink">Admins</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Create studio logins and choose what each person can open in Mesa admin.
          </p>
        </div>
        <div className="rounded-sm border border-line bg-paper px-4 py-3 text-sm">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">Signed in</p>
          <p className="mt-1 font-semibold text-ink">{actor.name}</p>
          <p className="text-xs text-muted">{accessLabel(actor.role)}</p>
        </div>
      </div>

      {saved ? (
        <p className="mt-5 border border-olive/30 bg-olive/10 px-4 py-3 text-sm text-olive-dark">
          Admin saved.
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-5 border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta-dark">
          {errorMessage}
        </p>
      ) : null}

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
          <p className="mt-1 text-sm text-muted">Invite someone with a name, email, password, and role.</p>
        </div>
        <form action={saveAdminAction} className="grid gap-4 p-5 md:grid-cols-2">
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
              minLength={10}
              required
              autoComplete="new-password"
              placeholder="At least 10 characters"
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
            <button
              type="submit"
              className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-paper hover:bg-terracotta-dark"
            >
              Add admin
            </button>
          </div>
        </form>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-ink">Team</h2>
            <p className="mt-1 text-sm text-muted">
              {admins.length
                ? `${admins.length} admin${admins.length === 1 ? "" : "s"} with studio access.`
                : "No named admins yet."}
            </p>
          </div>
        </div>

        {admins.length === 0 ? (
          <div className="mt-5 border border-dashed border-line bg-paper px-5 py-10 text-center text-sm leading-6 text-muted">
            Add an admin above. The owner email from <span className="font-semibold text-ink">ADMIN_EMAIL</span>{" "}
            can still sign in with the owner password.
          </div>
        ) : (
          <ul className="mt-5 space-y-4">
            {admins.map((admin) => {
              const isYou = admin.id === actor.id;
              return (
                <li key={admin.id} className="border border-line bg-paper">
                  <div className="flex flex-wrap items-center gap-4 border-b border-line bg-cream px-5 py-4">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sand text-sm font-semibold text-ink"
                      aria-hidden
                    >
                      {initials(admin.name) || "?"}
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
                    <p className="text-xs text-muted">Last login {formatWhen(admin.lastSeenAt)}</p>
                  </div>

                  <form action={saveAdminAction} className="grid gap-4 p-5 md:grid-cols-2">
                    <input type="hidden" name="id" value={admin.id} />
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
                      Access level
                      <select name="role" defaultValue={admin.role} className={fieldClass}>
                        {ACCESS_LEVELS.map((level) => (
                          <option key={level.id} value={level.id}>
                            {level.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid text-sm font-semibold text-ink">
                      New password
                      <input
                        name="password"
                        type="password"
                        minLength={10}
                        placeholder="Leave blank to keep current"
                        autoComplete="new-password"
                        className={fieldClass}
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                      <button
                        type="submit"
                        className="rounded-full bg-terracotta px-5 py-2 text-sm font-semibold text-paper hover:bg-terracotta-dark"
                      >
                        Save changes
                      </button>
                      {isYou ? (
                        <span className="text-sm text-muted">You cannot remove your own account.</span>
                      ) : (
                        <button
                          type="submit"
                          formAction={deleteAdminAction}
                          className="rounded-full border border-line px-5 py-2 text-sm font-semibold text-muted hover:border-terracotta hover:text-terracotta"
                        >
                          Remove
                        </button>
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
