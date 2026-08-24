import Link from "next/link";
import { deleteMemberAction } from "../actions";
import { requireAccess } from "@/lib/auth";
import { listUsersForAdmin } from "@/lib/accounts";
import { formatBrowser, formatIp, formatLocation } from "@/lib/request-meta";

type MemberRow = {
  id: string;
  name: string;
  email: string;
  createdAt: Date | string;
  lastSeenAt: Date | string;
  connections: {
    ip: string;
    event: string;
    method: string;
    userAgent: string;
    city: string;
    region: string;
    country: string;
    createdAt: Date | string;
  }[];
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatWhen(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${pad(date.getDate())}${pad(date.getMonth() + 1)}${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string }>;
}) {
  await requireAccess("members");
  const { removed } = await searchParams;
  const users = (await listUsersForAdmin()) as MemberRow[];

  return (
    <div>
      <h1 className="font-serif text-4xl">Members</h1>
      <p className="mt-2 text-sm text-muted">
        One row per email, with member since, last login, and how they connected.
      </p>
      {removed ? (
        <p className="mt-4 text-sm text-olive">Member removed. You can add them on Admins.</p>
      ) : null}

      <div className="mt-8 overflow-x-auto border border-line bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="bg-sand/50 text-[0.65rem] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Member since</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Connected with</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Where</th>
              <th className="px-4 py-3">Browser</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, index) => {
              const latest =
                user.connections.find((item: MemberRow["connections"][number]) => item.ip && item.ip !== "unknown") ||
                user.connections[0];
              const first = user.connections[user.connections.length - 1] || latest;
              const lastLogin = user.lastSeenAt || latest?.createdAt;
              return (
                <tr key={user.id} className="border-t border-line align-top">
                  <td className="px-4 py-3 text-muted">{index + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{user.name}</p>
                    <p className="text-xs text-muted">{user.email}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs">
                    {formatWhen(user.createdAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs">
                    {formatWhen(lastLogin)}
                  </td>
                  <td className="px-4 py-3 capitalize">{first?.event || "signup"}</td>
                  <td className="px-4 py-3 capitalize">{latest?.method || "—"}</td>
                  <td className="px-4 py-3">{latest ? formatIp(latest.ip) : "—"}</td>
                  <td className="px-4 py-3">{latest ? formatLocation(latest) || "—" : "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted" title={latest?.userAgent}>
                    {formatBrowser(latest?.userAgent || "")}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <form action={deleteMemberAction}>
                      <input type="hidden" name="id" value={user.id} />
                      <button className="text-xs text-muted hover:text-terracotta">Remove</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-muted">
                  No member accounts yet.{" "}
                  <Link href="/" className="font-semibold text-terracotta">
                    View the site
                  </Link>{" "}
                  and create one.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
