"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  markAllMemberNotificationsReadAction,
  markMemberNotificationReadAction,
} from "@/app/profile/notification-actions";
import { authFocusRing } from "@/lib/auth-ui";
import { formatLongDate } from "@/lib/datetime";
import {
  formatMemberNotificationContextLine,
  type MemberNotificationListItem,
} from "@/lib/member-notifications";

function notifyUnreadCountChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("mesa-notifications-changed"));
  }
}

export function ProfileNotificationsView({
  initial,
}: {
  initial: MemberNotificationListItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [markAllPending, setMarkAllPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = items.filter((item) => item.unread).length;
  const empty = items.length === 0;

  async function markAllRead() {
    if (markAllPending || unreadCount === 0) return;
    setError(null);
    setMarkAllPending(true);
    try {
      const result = await markAllMemberNotificationsReadAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItems((rows) =>
        rows.map((row) =>
          row.unread
            ? { ...row, unread: false, readAt: row.readAt ?? new Date().toISOString() }
            : row,
        ),
      );
      notifyUnreadCountChanged();
      router.refresh();
    } finally {
      setMarkAllPending(false);
    }
  }

  function onNotificationActivate(item: MemberNotificationListItem) {
    // Best-effort mark-read; never blocks native Link navigation (including modifier clicks).
    if (!item.unread) return;
    void (async () => {
      try {
        const result = await markMemberNotificationReadAction(item.id);
        if (!result.ok) return;
        setItems((rows) =>
          rows.map((row) =>
            row.id === item.id
              ? { ...row, unread: false, readAt: row.readAt ?? new Date().toISOString() }
              : row,
          ),
        );
        notifyUnreadCountChanged();
      } catch {
        // Navigation still proceeds via the Link.
      }
    })();
  }

  if (empty) {
    return (
      <div className="mt-10 max-w-xl">
        <p className="text-lg text-ink/90">No notifications yet.</p>
        <p className="mt-2 text-muted">
          Follow Collections or Topics to hear about new recipes.
        </p>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
          <Link
            href="/profile/following"
            className={`text-sm font-semibold text-terracotta hover:text-terracotta-dark ${authFocusRing} rounded-sm`}
          >
            Following
          </Link>
          <Link
            href="/series"
            className={`text-sm font-semibold text-terracotta hover:text-terracotta-dark ${authFocusRing} rounded-sm`}
          >
            Browse Collections
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-10">
      {unreadCount > 0 ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {unreadCount === 1 ? "1 unread" : `${unreadCount} unread`}
          </p>
          <button
            type="button"
            disabled={markAllPending}
            onClick={() => void markAllRead()}
            className={`inline-flex min-h-11 items-center text-sm font-semibold text-ink/80 hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-60 ${authFocusRing} rounded-sm`}
          >
            {markAllPending ? "…" : "Mark all as read"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mb-4 text-sm text-terracotta" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-line border-y border-line" aria-label="Notifications">
        {items.map((item) => {
          const href =
            item.recipeSlug != null && item.recipeSlug.trim()
              ? `/recipes/${item.recipeSlug}`
              : null;
          const title = (item.recipeTitle || "Recipe").trim() || "Recipe";
          const contextLine = formatMemberNotificationContextLine(item.context);
          const dateLabel = formatLongDate(item.createdAt);

          const body = (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {item.unread ? (
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-terracotta">
                    New
                    <span className="sr-only"> unread</span>
                  </span>
                ) : null}
                <time
                  dateTime={item.createdAt}
                  className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-olive"
                >
                  {dateLabel}
                </time>
              </div>
              <p className="mt-2 text-sm text-muted">{contextLine}</p>
              <p
                className={`mt-1 font-serif text-xl text-ink md:text-2xl ${
                  href ? "group-hover:text-terracotta" : ""
                }`}
              >
                {title}
              </p>
            </>
          );

          return (
            <li
              key={item.id}
              className={`py-5 ${item.unread ? "bg-sand/25" : ""}`}
              aria-label={item.unread ? `Unread: ${title}` : title}
            >
              {href ? (
                <Link
                  href={href}
                  className={`group block rounded-sm ${authFocusRing}`}
                  onClick={() => onNotificationActivate(item)}
                >
                  {body}
                </Link>
              ) : (
                <div>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
