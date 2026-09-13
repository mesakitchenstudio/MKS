import type { Metadata } from "next";
import Link from "next/link";
import {
  dismissNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/admin/notification-actions";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  adminFocusRing,
  adminLinkClass,
  adminSecondaryButtonClass,
  adminWorkspaceWide,
} from "@/lib/admin-ui";
import {
  adminNotificationSeverityLabel,
  humanizeAdminNotificationType,
} from "@/lib/admin-notifications";
import { listAdminNotificationsForAdmin } from "@/lib/admin-notifications-server";
import { requireAccess } from "@/lib/auth";
import { formatAdminDateTimeUtc } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Notifications",
};

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ read?: string; error?: string }>;
}) {
  const admin = await requireAccess("content");
  const query = await searchParams;
  const notifications = await listAdminNotificationsForAdmin({
    take: 80,
    includeDismissed: false,
    adminId: admin.id,
  });
  const unread = notifications.filter((row) => !row.readAt).length;

  return (
    <div className={`min-w-0 ${adminWorkspaceWide}`}>
      <AdminPageHeader
        title="Notifications"
        description="Operational alerts for scheduled publishing and related Admin work. This is not the Activity audit log."
        documentationTopicId="notifications"
        titleClassName="font-serif text-3xl text-ink"
        actions={
          unread > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <button type="submit" className={`${adminSecondaryButtonClass} ${adminFocusRing}`}>
                Mark all read
              </button>
            </form>
          ) : null
        }
      />

      {query.read === "all" ? (
        <p className="mb-4 text-sm font-semibold text-olive" role="status">
          All notifications marked read.
        </p>
      ) : null}
      {query.error === "missing" ? (
        <p className="mb-4 text-sm font-semibold text-terracotta" role="alert">
          That notification could not be updated.
        </p>
      ) : null}

      {notifications.length === 0 ? (
        <p className="text-sm text-muted">No notifications yet.</p>
      ) : (
        <ul className="grid gap-3">
          {notifications.map((row) => {
            const unreadRow = !row.readAt;
            return (
              <li
                key={row.id}
                className={`rounded-sm border border-line p-4 ${unreadRow ? "bg-cream/40" : "bg-paper"}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {adminNotificationSeverityLabel(row.severity)}
                      {unreadRow ? " · Unread" : ""}
                    </p>
                    <h2 className="mt-1 font-semibold text-ink">{row.title}</h2>
                    {row.body ? (
                      <p className="mt-1 text-sm leading-6 text-muted">{row.body}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted">
                      {humanizeAdminNotificationType(row.type)} ·{" "}
                      {formatAdminDateTimeUtc(row.createdAt)}
                    </p>
                    {row.entityPath ? (
                      <p className="mt-2">
                        <Link
                          href={row.entityPath}
                          className={`${adminLinkClass} ${adminFocusRing} text-sm`}
                        >
                          {row.entityLabel || "Open related item"}
                        </Link>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {unreadRow ? (
                      <form action={markNotificationReadAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <button
                          type="submit"
                          className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                        >
                          Mark read
                        </button>
                      </form>
                    ) : null}
                    <form action={dismissNotificationAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <button
                        type="submit"
                        className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                      >
                        Dismiss
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
