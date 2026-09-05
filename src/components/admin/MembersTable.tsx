"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteMembersAction } from "@/app/admin/actions";
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

function memberSelectLabel(user: Pick<MemberRow, "name" | "email">) {
  const name = user.name.trim();
  return name || user.email;
}

export function MembersTable({
  users,
  canDelete = false,
}: {
  users: MemberRow[];
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [presenceById, setPresenceById] = useState(() => presenceFromUsers(users));
  const [trackedUsers, setTrackedUsers] = useState(users);
  const [trackedIdsKey, setTrackedIdsKey] = useState(() =>
    users.map((user) => user.id).join("\0"),
  );
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkPending, startBulk] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);
  const selectPageRef = useRef<HTMLInputElement>(null);

  const usersIdsKey = users.map((user) => user.id).join("\0");
  if (users !== trackedUsers) {
    setTrackedUsers(users);
    setPresenceById(presenceFromUsers(users));
  }
  if (usersIdsKey !== trackedIdsKey) {
    setTrackedIdsKey(usersIdsKey);
    // Membership of the rendered list changed — drop stale selection IDs.
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkError(null);
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

  const visibleIds = sortedUsers.map((user) => user.id);
  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected =
    visibleIds.some((id) => selectedIds.has(id)) && !allVisibleSelected;

  useEffect(() => {
    if (selectPageRef.current) {
      selectPageRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected, selectMode]);

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

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkError(null);
  }

  function enterSelectMode() {
    setSelectMode(true);
    setSelectedIds(new Set());
    setBulkError(null);
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function togglePage(checked: boolean) {
    setSelectedIds(checked ? new Set(visibleIds) : new Set());
  }

  function handleBulkDelete() {
    if (!canDelete || bulkPending || selectedCount === 0) return;
    const countLabel = String(selectedCount);
    if (
      !window.confirm(
        `Permanently delete ${countLabel} selected member${selectedCount === 1 ? "" : "s"}? Their saved recipes and member activity will also be removed. Their reviews will remain, but will no longer be linked to the member account. This cannot be undone.`,
      )
    ) {
      return;
    }
    const ids = [...selectedIds];
    setBulkError(null);
    startBulk(async () => {
      const result = await deleteMembersAction(ids);
      if (!result.ok) {
        setBulkError(
          result.error === "forbidden"
            ? "Not allowed."
            : result.error === "too-many"
              ? "Too many members selected."
              : result.error === "not-found"
                ? "No matching members found."
                : result.error || "Delete failed.",
        );
        return;
      }
      router.push(`/admin/members?removed=${result.deletedCount}`);
      router.refresh();
    });
  }

  const showSelectionChrome = canDelete && selectMode;
  const colSpan = showSelectionChrome ? 5 : 4;

  return (
    <div className="mt-6">
      <p className="text-sm text-muted">
        {onlineCount} online · Sorted by last seen · Times in GMT
      </p>

      {/* Same left-aligned bulk-selection entry as Reviews / Visitors (not metadata far-right). */}
      {canDelete && sortedUsers.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!selectMode ? (
            <button
              type="button"
              className={`inline-flex min-h-11 items-center text-sm font-semibold text-ink transition-colors hover:text-terracotta sm:min-h-9 ${adminFocusRing}`}
              onClick={enterSelectMode}
              aria-pressed={false}
            >
              Select members
            </button>
          ) : (
            <button
              type="button"
              className={`inline-flex min-h-11 items-center text-sm font-semibold text-muted transition-colors hover:text-ink sm:min-h-9 ${adminFocusRing}`}
              onClick={exitSelectMode}
              aria-pressed={true}
            >
              Cancel selection
            </button>
          )}
        </div>
      ) : null}

      {showSelectionChrome ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
          role="status"
        >
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-ink sm:min-h-9">
            <input
              ref={selectPageRef}
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(event) => togglePage(event.target.checked)}
              aria-label="Select page"
            />
            <span className="font-semibold">Select page</span>
          </label>
          {selectedCount > 0 ? (
            <>
              <span className="text-muted">{selectedCount} selected</span>
              <button
                type="button"
                disabled={bulkPending}
                onClick={handleBulkDelete}
                className={`inline-flex min-h-11 items-center font-semibold text-terracotta transition-colors hover:text-terracotta-dark disabled:opacity-60 sm:min-h-9 ${adminFocusRing}`}
                aria-label={`Delete ${selectedCount} selected member${selectedCount === 1 ? "" : "s"}`}
              >
                {bulkPending ? "Deleting…" : "Delete selected"}
              </button>
            </>
          ) : (
            <span className="text-muted">Select members on this page</span>
          )}
          {bulkError ? <p className="w-full text-sm text-terracotta">{bulkError}</p> : null}
        </div>
      ) : null}

      <div className="mt-4 hidden md:block">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            {showSelectionChrome ? <col className="w-10" /> : null}
            <col className={showSelectionChrome ? "w-[40%]" : "w-[42%]"} />
            <col className="w-[22%]" />
            <col className="w-[20%]" />
            <col className={showSelectionChrome ? "w-[14%]" : "w-[16%]"} />
          </colgroup>
          <thead className={adminTableHeadClass}>
            <tr className="border-b border-line/80">
              {showSelectionChrome ? (
                <th scope="col" className="px-0 py-3 font-medium">
                  <span className="sr-only">Select</span>
                </th>
              ) : null}
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
              const label = memberSelectLabel(user);

              return (
                <tr key={user.id} className="border-b border-line/80 align-middle">
                  {showSelectionChrome ? (
                    <td className="px-0 py-3.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selectedIds.has(user.id)}
                        onChange={(event) => toggleOne(user.id, event.target.checked)}
                        aria-label={`Select member ${label}`}
                      />
                    </td>
                  ) : null}
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
                <td colSpan={colSpan} className="px-0 py-8 text-muted">
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
          const label = memberSelectLabel(user);

          return (
            <li key={user.id} className="py-4">
              <div className="flex min-w-0 items-start gap-3">
                {showSelectionChrome ? (
                  <input
                    type="checkbox"
                    className="mt-3 h-4 w-4 shrink-0"
                    checked={selectedIds.has(user.id)}
                    onChange={(event) => toggleOne(user.id, event.target.checked)}
                    aria-label={`Select member ${label}`}
                  />
                ) : null}
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
