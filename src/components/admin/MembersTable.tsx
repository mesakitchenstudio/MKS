"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteMemberAction } from "@/app/admin/actions";
import { IpDetailsPanel } from "@/components/admin/IpDetailsPanel";
import { formatGmtDateTime } from "@/lib/datetime";
import { isMemberOnline } from "@/lib/member-presence";
import { uniqueIps } from "@/lib/ip-utils";
import { formatBrowser, formatLocation } from "@/lib/request-meta";

type MemberRow = {
  id: string;
  name: string;
  email: string;
  photoUrl?: string | null;
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function MemberStatusCell({
  name,
  photoUrl,
  online,
}: {
  name: string;
  photoUrl?: string | null;
  online: boolean;
}) {
  return (
    <div className="relative inline-flex">
      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-line bg-sand text-xs font-semibold text-ink">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          initials(name) || "?"
        )}
      </div>
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-paper ${
          online ? "bg-olive" : "bg-line"
        }`}
        title={online ? "Online" : "Offline"}
        aria-label={online ? "Online" : "Offline"}
      />
    </div>
  );
}

export function MembersTable({ users }: { users: MemberRow[] }) {
  const router = useRouter();
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    const refresh = window.setInterval(() => router.refresh(), 45_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(refresh);
    };
  }, [router]);

  const sortedUsers = useMemo(() => {
    return [...users].sort(
      (left, right) => new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime(),
    );
  }, [users]);

  const onlineCount = sortedUsers.filter((user) => isMemberOnline(user.lastSeenAt, now)).length;

  return (
    <div className="mt-8">
      <div className="mb-4 flex flex-wrap items-center gap-3 border border-line bg-paper px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-olive opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-olive" />
          </span>
          {onlineCount} online now
        </span>
        <span className="text-xs text-muted">
          Sorted by last seen · times in GMT · updates automatically
        </span>
      </div>

      <div className="overflow-x-auto border border-line bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="bg-sand/50 text-[0.65rem] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Member since</th>
              <th className="px-4 py-3">Last seen</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Connected with</th>
              <th className="px-4 py-3">Where</th>
              <th className="px-4 py-3">Browser</th>
              <th className="px-4 py-3">IP details</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user, index) => {
              const latest =
                user.connections.find((item) => item.ip && item.ip !== "unknown") ||
                user.connections[0];
              const first = user.connections[user.connections.length - 1] || latest;
              const lastSeen = user.lastSeenAt || latest?.createdAt;
              const online = isMemberOnline(user.lastSeenAt, now);
              const ips = uniqueIps(user.connections.map((item) => item.ip));
              const open = openMemberId === user.id;

              return (
                <Fragment key={user.id}>
                  <tr className="border-t border-line align-top">
                    <td className="px-4 py-3 text-muted">{index + 1}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <MemberStatusCell name={user.name} photoUrl={user.photoUrl} online={online} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{user.name}</p>
                      <p className="text-xs text-muted">{user.email}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">{formatGmtDateTime(user.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">{formatGmtDateTime(lastSeen)}</td>
                    <td className="px-4 py-3 capitalize">{first?.event || "signup"}</td>
                    <td className="px-4 py-3 capitalize">{latest?.method || "—"}</td>
                    <td className="px-4 py-3">{latest ? formatLocation(latest) || "—" : "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted" title={latest?.userAgent}>
                      {formatBrowser(latest?.userAgent || "")}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {ips.length ? (
                        <button
                          type="button"
                          onClick={() => setOpenMemberId(open ? null : user.id)}
                          className="text-xs font-semibold text-terracotta hover:underline"
                        >
                          {open ? "Hide" : "Show"} {ips.length} IP{ips.length === 1 ? "" : "s"}
                        </button>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <form action={deleteMemberAction}>
                        <input type="hidden" name="id" value={user.id} />
                        <button className="text-xs text-muted hover:text-terracotta">Remove</button>
                      </form>
                    </td>
                  </tr>
                  {open && ips.length ? (
                    <tr className="border-t border-line bg-cream/40">
                      <td colSpan={11} className="px-4 py-5">
                        <div className="grid gap-4">
                          {ips.map((ip) => (
                            <IpDetailsPanel key={`${user.id}-${ip}`} ip={ip} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {sortedUsers.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-muted">
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
