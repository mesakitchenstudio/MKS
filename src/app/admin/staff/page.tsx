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
    <div>
      <h1 className="font-serif text-4xl">Admins</h1>
      <p className="mt-2 text-sm text-muted">
        Create studio logins and set what each person can access. You are signed in as {actor.name} (
        {accessLabel(actor.role)}).
      </p>
      {saved ? <p className="mt-4 text-sm text-olive">Admin saved.</p> : null}
      {errorMessage ? <p className="mt-4 text-sm text-terracotta">{errorMessage}</p> : null}

      <form action={saveAdminAction} className="mt-8 grid gap-3 border border-line bg-paper p-5 md:grid-cols-2">
        <input name="name" placeholder="Full name" required className="border border-line px-3 py-2" />
        <input name="email" type="email" placeholder="Email" required className="border border-line px-3 py-2" />
        <input
          name="password"
          type="password"
          minLength={10}
          placeholder="Password"
          required
          className="border border-line px-3 py-2"
        />
        <select name="role" defaultValue="editor" className="border border-line px-3 py-2">
          {ACCESS_LEVELS.map((level) => (
            <option key={level.id} value={level.id}>
              {level.label} — {level.help}
            </option>
          ))}
        </select>
        <button className="justify-self-start rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-paper">
          Add admin
        </button>
      </form>

      <ul className="mt-8 divide-y divide-line border border-line bg-paper">
        {admins.map((admin) => (
          <li key={admin.id} className="px-4 py-4">
            <form action={saveAdminAction} className="grid gap-2 md:grid-cols-2">
              <input type="hidden" name="id" value={admin.id} />
              <input name="name" defaultValue={admin.name} className="border border-line px-3 py-2" />
              <input name="email" type="email" defaultValue={admin.email} className="border border-line px-3 py-2" />
              <select name="role" defaultValue={admin.role} className="border border-line px-3 py-2">
                {ACCESS_LEVELS.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.label}
                  </option>
                ))}
              </select>
              <input
                name="password"
                type="password"
                minLength={10}
                placeholder="New password (optional)"
                className="border border-line px-3 py-2"
              />
              <p className="self-center text-xs text-muted">Last login {formatWhen(admin.lastSeenAt)}</p>
              <div className="flex items-center gap-4">
                <button className="text-sm font-semibold text-terracotta">Save</button>
                {admin.id === actor.id ? (
                  <span className="text-xs text-muted">You</span>
                ) : (
                  <button formAction={deleteAdminAction} className="text-sm text-muted hover:text-terracotta">
                    Remove
                  </button>
                )}
              </div>
            </form>
          </li>
        ))}
        {admins.length === 0 ? (
          <li className="px-4 py-8 text-sm text-muted">
            No named admins yet. Add one above. The owner password from .env still signs in as owner.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
