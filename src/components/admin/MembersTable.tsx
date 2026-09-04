"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MemberAvatar } from "@/components/admin/MemberPresence";
import { adminFocusRing, adminTableHeadClass } from "@/lib/admin-ui";
import { formatAdminDate, formatAdminRelativeDateTime } from "@/lib/datetime";
import {
  formatSignInMethod,
  isMemberOnlineFromPresence,
  MEMBER_ADMIN_PRESENCE_POLL_MS,
} from "@/lib/member-presence";

type MemberRow = {
  id: string;
  name: string;
  email: string;
  photoUrl?: string | null;
  createdAt: Date | string;
  lastSeenAt: Date | string;
  online?: boolean;
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

type PresencePatch = {
  online: boolean;
  lastSeenAt: string;
};

function presenceFromUsers(users: MemberRow[]): Record<string, PresencePatch> {
  const next: Record<string, PresencePatch> = {};
  for (const user of users) {
    next[user.id] = {
      online: Boolean(user.online),
      lastSeenAt:
        typeof user.lastSeenAt === "string"
          ? user.lastSeenAt
          : new Date(user.lastSeenAt).toISOString(),
    };
  }
  return next;
}

export function MembersTable({ users }: { users: MemberRow[] }) {
  const [now, setNow] = useState(() => Date.now());
  const [presenceById, setPresenceById] = useState(() => presenceFromUsers(users));
  const [trackedUsers, setTrackedUsers] = useState(users);
  if (users !== trackedUsers) {
    setTrackedUsers(users);
    setPresenceById(presenceFromUsers(users));
  }

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/admin/members/presence", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as {
          members?: { id: string; online: boolean; lastSeenAt: string }[];
        };
        if (!data.members || cancelled) return;
        setPresenceById((current) => {
          const merged = { ...current };
          for (const row of data.members!) {
            merged[row.id] = { online: row.online, lastSeenAt: row.lastSeenAt };
          }
          return merged;
        });
        setNow(Date.now());
      } catch {
        // Keep last known presence if the poll fails.
      }
    }

    void poll();
    const pollTimer = window.setInterval(() => void poll(), MEMBER_ADMIN_PRESENCE_POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      window.clearInterval(tick);
    };
  }, []);

  const sortedUsers = useMemo(() => {
    return [...users].sort((left, right) => {
      const leftSeen = presenceById[left.id]?.lastSeenAt || left.lastSeenAt;
      const rightSeen = presenceById[right.id]?.lastSeenAt || right.lastSeenAt;
      return new Date(rightSeen).getTime() - new Date(leftSeen).getTime();
    });
  }, [users, presenceById]);

  const onlineCount = sortedUsers.filter((user) => {
    const patch = presenceById[user.id];
    return isMemberOnlineFromPresence(
      {
        online: patch?.online ?? user.online,
        lastSeenAt: patch?.lastSeenAt ?? user.lastSeenAt,
      },
      now,
    );
  }).length;
  const nowDate = useMemo(() => new Date(now), [now]);

  return (
    <div className="mt-6">
      <p className="text-sm text-muted">
        {onlineCount} online · Sorted by last seen · Times in GMT
      </p>

      <div className="mt-4 hidden md:block">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[42%]" />
            <col className="w-[22%]" />
            <col className="w-[20%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead className={adminTableHeadClass}>
            <tr className="border-b border-line/80">
              <th scope="col" className="px-0 py-3 font-medium">
                Member
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Last seen
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Joined
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Sign-in
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => {
              const latest =
                user.connections.find((item) => item.ip && item.ip !== "unknown") ||
                user.connections[0];
              const patch = presenceById[user.id];
              const lastSeen = patch?.lastSeenAt || user.lastSeenAt || latest?.createdAt;
              const online = isMemberOnlineFromPresence(
                {
                  online: patch?.online ?? user.online,
                  lastSeenAt: patch?.lastSeenAt ?? user.lastSeenAt,
                },
                now,
              );
              const signIn = formatSignInMethod(latest?.method);

              return (
                <tr key={user.id} className="border-b border-line/80 align-middle">
                  <td className="px-0 py-3.5">
                    <div className="inline-flex max-w-full items-center gap-3">
                      <MemberAvatar name={user.name} photoUrl={user.photoUrl} />
                      <span className="min-w-0">
                        <Link
                          href={`/admin/members/${user.id}`}
                          className={`block truncate font-semibold text-ink transition-colors hover:text-terracotta ${adminFocusRing}`}
                        >
                          {user.name}
                        </Link>
                        <span className="block truncate text-xs text-muted">{user.email}</span>
                        {online ? (
                          <span className="mt-0.5 block text-xs font-medium text-olive">Online</span>
                        ) : null}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-xs leading-snug text-muted sm:text-sm">
                    {online ? (
                      <span className="font-medium text-olive">Online now</span>
                    ) : (
                      formatAdminRelativeDateTime(lastSeen, nowDate)
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-muted">{formatAdminDate(user.createdAt)}</td>
                  <td className="px-3 py-3.5 text-muted">{signIn}</td>
                </tr>
              );
            })}
            {sortedUsers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-0 py-8 text-muted">
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

      <ul className="mt-4 space-y-0 divide-y divide-line/80 border-t border-line/80 md:hidden">
        {sortedUsers.map((user) => {
          const latest =
            user.connections.find((item) => item.ip && item.ip !== "unknown") ||
            user.connections[0];
          const patch = presenceById[user.id];
          const lastSeen = patch?.lastSeenAt || user.lastSeenAt || latest?.createdAt;
          const online = isMemberOnlineFromPresence(
            {
              online: patch?.online ?? user.online,
              lastSeenAt: patch?.lastSeenAt ?? user.lastSeenAt,
            },
            now,
          );
          const signIn = formatSignInMethod(latest?.method);

          return (
            <li key={user.id} className="py-4">
              <div className="flex min-w-0 items-start gap-3">
                <MemberAvatar name={user.name} photoUrl={user.photoUrl} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/members/${user.id}`}
                    className={`inline-flex min-h-11 items-center font-semibold text-ink hover:text-terracotta ${adminFocusRing}`}
                  >
                    {user.name}
                  </Link>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                  {online ? (
                    <p className="mt-1 text-xs font-medium text-olive">Online</p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted">
                    Last seen{" "}
                    {online ? "Online now" : formatAdminRelativeDateTime(lastSeen, nowDate)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Joined {formatAdminDate(user.createdAt)}
                    <span className="mx-1.5 text-line" aria-hidden>
                      ·
                    </span>
                    {signIn}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
        {sortedUsers.length === 0 ? (
          <li className="border-dashed py-8 text-sm text-muted">
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
