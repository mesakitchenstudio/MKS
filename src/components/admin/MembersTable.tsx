"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MemberAvatar, PresenceDot } from "@/components/admin/MemberPresence";
import { adminFocusRing, adminLinkClass, adminTableHeadClass } from "@/lib/admin-ui";
import { formatAdminDate, formatAdminRelativeDateTime } from "@/lib/datetime";
import { formatPresenceLabel, formatSignInMethod, isMemberOnline } from "@/lib/member-presence";
import {
  formatLatestCountryCityLocation,
} from "@/lib/request-meta";

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

      <div className="hidden border border-line bg-paper md:block">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[16%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className={adminTableHeadClass}>
            <tr>
              <th className="px-3 py-3 font-medium sm:px-4">Member</th>
              <th className="px-3 py-3 font-medium sm:px-4">Status</th>
              <th className="px-3 py-3 font-medium sm:px-4">Joined</th>
              <th className="px-3 py-3 font-medium sm:px-4">Last seen</th>
              <th className="px-3 py-3 font-medium sm:px-4">Location</th>
              <th className="px-3 py-3 font-medium sm:px-4">Sign-in</th>
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
              const location = formatLatestCountryCityLocation(user.connections);

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
                  <td className="px-3 py-3 text-muted sm:px-4">{formatAdminDate(user.createdAt)}</td>
                  <td className="px-3 py-3 text-xs leading-snug text-muted sm:px-4 sm:text-sm">
                    {formatAdminRelativeDateTime(lastSeen, nowDate)}
                  </td>
                  <td className="px-3 py-3 sm:px-4">
                    <span
                      className="block truncate text-xs leading-snug text-muted sm:text-sm"
                      title={location === "—" ? undefined : location}
                    >
                      {location}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted sm:px-4">{signIn}</td>
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
                <td colSpan={7} className="px-4 py-8 text-muted">
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

      <ul className="space-y-3 md:hidden">
        {sortedUsers.map((user) => {
          const latest =
            user.connections.find((item) => item.ip && item.ip !== "unknown") ||
            user.connections[0];
          const lastSeen = user.lastSeenAt || latest?.createdAt;
          const online = isMemberOnline(user.lastSeenAt, now);
          const status = formatPresenceLabel(user.lastSeenAt, now);
          const signIn = formatSignInMethod(latest?.method);
          const location = formatLatestCountryCityLocation(user.connections);

          return (
            <li key={user.id} className="border border-line bg-paper px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="inline-flex min-w-0 items-center gap-3">
                  <Link
                    href={`/admin/members/${user.id}`}
                    className={`shrink-0 rounded-full ${adminFocusRing}`}
                    tabIndex={-1}
                    aria-hidden
                  >
                    <MemberAvatar name={user.name} photoUrl={user.photoUrl} />
                  </Link>
                  <div className="min-w-0">
                    <Link
                      href={`/admin/members/${user.id}`}
                      className={`block truncate font-semibold text-ink hover:text-terracotta ${adminFocusRing}`}
                    >
                      {user.name}
                    </Link>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                    <p className="mt-1 inline-flex items-center gap-2 text-sm text-ink">
                      <PresenceDot online={online} />
                      {status}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/admin/members/${user.id}`}
                  className={`shrink-0 text-sm ${adminLinkClass} ${adminFocusRing}`}
                >
                  View
                </Link>
              </div>
              <p
                className="mt-2 truncate text-xs text-muted"
                title={location === "—" ? undefined : location}
              >
                {location}
              </p>
              <p className="mt-1 text-xs text-muted">{signIn}</p>
              <p className="mt-1 text-xs text-muted">
                Joined {formatAdminDate(user.createdAt)}
                <span className="mx-1.5 text-line">·</span>
                Last {formatAdminRelativeDateTime(lastSeen, nowDate)}
              </p>
            </li>
          );
        })}
        {sortedUsers.length === 0 ? (
          <li className="border border-dashed border-line bg-paper px-4 py-8 text-sm text-muted">
            No member accounts yet.{" "}
            <Link href="/" className={`font-semibold text-terracotta ${adminFocusRing}`}>
              View the site
            </Link>{" "}
            and create one.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
