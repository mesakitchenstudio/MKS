"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MemberAvatar, PresenceDot } from "@/components/admin/MemberPresence";
import { adminFocusRing, adminLinkClass, adminTableHeadClass } from "@/lib/admin-ui";
import { formatAdminDate, formatAdminRelativeDateTime } from "@/lib/datetime";
import { formatPresenceLabel, formatSignInMethod, isMemberOnline } from "@/lib/member-presence";

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

export function MembersTable({ users }: { users: MemberRow[] }) {
  const router = useRouter();
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
  const nowDate = useMemo(() => new Date(now), [now]);

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 border border-line bg-paper px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <PresenceDot online={onlineCount > 0} pulse={onlineCount > 0} />
          {onlineCount} online now
        </span>
        <span className="text-xs text-muted">
          Sorted by last seen · Times in GMT · Updates automatically
        </span>
      </div>

      <div className="border border-line bg-paper">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[32%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[18%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className={adminTableHeadClass}>
            <tr>
              <th className="px-3 py-3 font-medium sm:px-4">Member</th>
              <th className="px-3 py-3 font-medium sm:px-4">Status</th>
              <th className="hidden px-3 py-3 font-medium sm:table-cell sm:px-4">Joined</th>
              <th className="px-3 py-3 font-medium sm:px-4">Last seen</th>
              <th className="hidden px-3 py-3 font-medium md:table-cell md:px-4">Sign-in</th>
              <th className="px-3 py-3 font-medium sm:px-4">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => {
              const latest =
                user.connections.find((item) => item.ip && item.ip !== "unknown") ||
                user.connections[0];
              const lastSeen = user.lastSeenAt || latest?.createdAt;
              const online = isMemberOnline(user.lastSeenAt, now);
              const status = formatPresenceLabel(user.lastSeenAt, now);
              const signIn = formatSignInMethod(latest?.method);

              return (
                <tr key={user.id} className="border-t border-line align-middle hover:bg-cream/40">
                  <td className="px-3 py-3 sm:px-4">
                    <div className="inline-flex max-w-full items-center gap-3">
                      <Link
                        href={`/admin/members/${user.id}`}
                        className={`shrink-0 rounded-full ${adminFocusRing}`}
                        tabIndex={-1}
                        aria-hidden
                      >
                        <MemberAvatar name={user.name} photoUrl={user.photoUrl} />
                      </Link>
                      <span className="min-w-0">
                        <Link
                          href={`/admin/members/${user.id}`}
                          className={`block truncate font-semibold text-ink transition-colors hover:text-terracotta ${adminFocusRing}`}
                        >
                          {user.name}
                        </Link>
                        <span className="block truncate text-xs text-muted">{user.email}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 sm:px-4">
                    <span className="inline-flex items-center gap-2 text-sm text-ink">
                      <PresenceDot online={online} />
                      <span className="leading-snug">{status}</span>
                    </span>
                  </td>
                  <td className="hidden px-3 py-3 text-muted sm:table-cell sm:px-4">
                    {formatAdminDate(user.createdAt)}
                  </td>
                  <td className="px-3 py-3 text-xs leading-snug text-muted sm:px-4 sm:text-sm">
                    {formatAdminRelativeDateTime(lastSeen, nowDate)}
                  </td>
                  <td className="hidden px-3 py-3 text-muted md:table-cell md:px-4">{signIn}</td>
                  <td className="px-3 py-3 text-right sm:px-4">
                    <Link
                      href={`/admin/members/${user.id}`}
                      className={`text-sm ${adminLinkClass} ${adminFocusRing}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
            {sortedUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-muted">
                  No member accounts yet.{" "}
                  <Link href="/" className={`font-semibold text-terracotta ${adminFocusRing}`}>
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
