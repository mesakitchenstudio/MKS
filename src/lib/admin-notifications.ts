/**
 * Admin notifications — staff inbox distinct from AdminAuditEvent.
 * Presentation state (read/dismiss) is per Admin via receipts.
 */

export const ADMIN_NOTIFICATION_SEVERITIES = ["info", "success", "attention"] as const;
export type AdminNotificationSeverity = (typeof ADMIN_NOTIFICATION_SEVERITIES)[number];

export const ADMIN_NOTIFICATION_TYPES = [
  "recipe.schedule.succeeded",
  "recipe.schedule.blocked",
  "recipe.schedule.retrying",
  "recipe.schedule.cancelled",
  /** @deprecated prefer recipe.schedule.blocked */
  "recipe.schedule.failed",
] as const;

export type AdminNotificationType = (typeof ADMIN_NOTIFICATION_TYPES)[number] | string;

export type AdminNotificationRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  type: string;
  title: string;
  body: string;
  severity: AdminNotificationSeverity | string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  entityPath: string;
  recipientAdminId: string | null;
  /** Per-viewer receipt state */
  readAt: string | null;
  dismissedAt: string | null;
  metadata: Record<string, unknown>;
};

export type CreateAdminNotificationInput = {
  type: string;
  title: string;
  body?: string;
  severity?: AdminNotificationSeverity | string;
  entityType?: string;
  entityId?: string | null;
  entityLabel?: string | null;
  entityPath?: string | null;
  recipientAdminId?: string | null;
  metadata?: Record<string, unknown> | null;
  /**
   * When true, skip create if an undismissed-for-all shared notification of the
   * same type+entityId already exists (transient retry dedupe).
   */
  dedupeByTypeEntity?: boolean;
};

export function adminNotificationAdminKey(adminId: string | null | undefined): string {
  const id = String(adminId ?? "").trim();
  return id && id !== "env" ? id : "env";
}

export function isAdminNotificationSeverity(value: string): value is AdminNotificationSeverity {
  return (ADMIN_NOTIFICATION_SEVERITIES as readonly string[]).includes(value);
}

export function adminNotificationSeverityLabel(severity: string): string {
  switch (severity) {
    case "success":
      return "Success";
    case "attention":
      return "Needs attention";
    default:
      return "Info";
  }
}

export function humanizeAdminNotificationType(type: string): string {
  const map: Record<string, string> = {
    "recipe.schedule.succeeded": "Scheduled publish succeeded",
    "recipe.schedule.blocked": "Scheduled publish blocked",
    "recipe.schedule.retrying": "Scheduled publish retrying",
    "recipe.schedule.cancelled": "Schedule cancelled",
    "recipe.schedule.failed": "Scheduled publish failed",
  };
  return map[type] || type.replace(/\./g, " ");
}

export function filterAdminNotifications(
  rows: AdminNotificationRecord[],
  filter?: { unreadOnly?: boolean; includeDismissed?: boolean },
): AdminNotificationRecord[] {
  return rows.filter((row) => {
    if (!filter?.includeDismissed && row.dismissedAt) return false;
    if (filter?.unreadOnly && row.readAt) return false;
    return true;
  });
}

export function countUnreadAdminNotifications(rows: AdminNotificationRecord[]): number {
  return filterAdminNotifications(rows, { unreadOnly: true, includeDismissed: false }).length;
}

/** Pure merge of shared notification + optional per-admin receipt. */
export function applyNotificationReceipt(
  notification: Omit<AdminNotificationRecord, "readAt" | "dismissedAt"> & {
    readAt?: string | null;
    dismissedAt?: string | null;
  },
  receipt?: { readAt: string | null; dismissedAt: string | null } | null,
): AdminNotificationRecord {
  return {
    ...notification,
    readAt: receipt?.readAt ?? null,
    dismissedAt: receipt?.dismissedAt ?? null,
  };
}
