import { getDb } from "@/lib/db";
import {
  adminNotificationAdminKey,
  applyNotificationReceipt,
  countUnreadAdminNotifications,
  filterAdminNotifications,
  type AdminNotificationRecord,
  type CreateAdminNotificationInput,
} from "@/lib/admin-notifications";

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function toBase(row: {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  type: string;
  title: string;
  body: string;
  severity: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  entityPath: string;
  recipientAdminId: string | null;
  metadata: string;
}) {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    type: row.type,
    title: row.title,
    body: row.body,
    severity: row.severity,
    entityType: row.entityType,
    entityId: row.entityId,
    entityLabel: row.entityLabel,
    entityPath: row.entityPath,
    recipientAdminId: row.recipientAdminId,
    metadata: parseMetadata(row.metadata),
  };
}

export async function createAdminNotification(
  input: CreateAdminNotificationInput,
): Promise<AdminNotificationRecord> {
  const db = getDb();
  const type = String(input.type || "").trim().slice(0, 80) || "info";
  const entityType = String(input.entityType || "").trim().slice(0, 80);
  const entityId = String(input.entityId || "").trim().slice(0, 80);

  if (input.dedupeByTypeEntity && entityId) {
    const existing = await db.adminNotification.findFirst({
      where: { type, entityType: entityType || undefined, entityId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (existing) {
      return applyNotificationReceipt(toBase(existing), null);
    }
  }

  const row = await db.adminNotification.create({
    data: {
      type,
      title: String(input.title || "").trim().slice(0, 200) || "Notification",
      body: String(input.body || "").trim().slice(0, 2000),
      severity: String(input.severity || "info").trim() || "info",
      entityType,
      entityId,
      entityLabel: String(input.entityLabel || "").trim().slice(0, 200),
      entityPath: String(input.entityPath || "").trim().slice(0, 240),
      recipientAdminId: input.recipientAdminId ?? null,
      metadata: JSON.stringify(input.metadata ?? {}),
    },
  });
  return applyNotificationReceipt(toBase(row), null);
}

export async function listAdminNotificationsForAdmin(options?: {
  take?: number;
  includeDismissed?: boolean;
  unreadOnly?: boolean;
  adminId?: string | null;
}): Promise<AdminNotificationRecord[]> {
  const take = Math.min(Math.max(options?.take ?? 80, 1), 200);
  const adminKey = adminNotificationAdminKey(options?.adminId);
  const namedId = adminKey === "env" ? null : adminKey;
  const db = getDb();

  const rows = await db.adminNotification.findMany({
    where: {
      OR: [
        { recipientAdminId: null },
        ...(namedId ? [{ recipientAdminId: namedId }] : []),
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take * 3,
  });

  const receipts = await db.adminNotificationReceipt.findMany({
    where: {
      adminKey,
      notificationId: { in: rows.map((row) => row.id) },
    },
  });
  const receiptByNotification = new Map(
    receipts.map((row) => [
      row.notificationId,
      {
        readAt: row.readAt?.toISOString() ?? null,
        dismissedAt: row.dismissedAt?.toISOString() ?? null,
      },
    ]),
  );

  const mapped = rows.map((row) =>
    applyNotificationReceipt(toBase(row), receiptByNotification.get(row.id) ?? null),
  );

  return filterAdminNotifications(mapped, {
    includeDismissed: options?.includeDismissed,
    unreadOnly: options?.unreadOnly,
  }).slice(0, take);
}

export async function countUnreadAdminNotificationsForAdmin(
  adminId?: string | null,
): Promise<number> {
  const rows = await listAdminNotificationsForAdmin({
    take: 100,
    includeDismissed: false,
    adminId,
  });
  return countUnreadAdminNotifications(rows);
}

async function upsertReceipt(
  notificationId: string,
  adminId: string | null | undefined,
  patch: { readAt?: Date | null; dismissedAt?: Date | null },
) {
  const adminKey = adminNotificationAdminKey(adminId);
  const namedId = adminKey === "env" ? null : adminKey;
  const db = getDb();
  const existing = await db.adminNotificationReceipt.findUnique({
    where: {
      notificationId_adminKey: { notificationId, adminKey },
    },
  });
  if (existing) {
    return db.adminNotificationReceipt.update({
      where: { id: existing.id },
      data: {
        readAt: patch.readAt === undefined ? existing.readAt : patch.readAt,
        dismissedAt:
          patch.dismissedAt === undefined ? existing.dismissedAt : patch.dismissedAt,
        adminId: namedId,
      },
    });
  }
  return db.adminNotificationReceipt.create({
    data: {
      notificationId,
      adminKey,
      adminId: namedId,
      readAt: patch.readAt ?? null,
      dismissedAt: patch.dismissedAt ?? null,
    },
  });
}

export async function markAdminNotificationRead(
  id: string,
  adminId?: string | null,
): Promise<AdminNotificationRecord | null> {
  const db = getDb();
  const existing = await db.adminNotification.findUnique({ where: { id } });
  if (!existing) return null;
  const receipt = await upsertReceipt(id, adminId, { readAt: new Date() });
  return applyNotificationReceipt(toBase(existing), {
    readAt: receipt.readAt?.toISOString() ?? null,
    dismissedAt: receipt.dismissedAt?.toISOString() ?? null,
  });
}

export async function markAllAdminNotificationsRead(adminId?: string | null): Promise<number> {
  const rows = await listAdminNotificationsForAdmin({
    take: 200,
    includeDismissed: false,
    unreadOnly: true,
    adminId,
  });
  let count = 0;
  for (const row of rows) {
    await upsertReceipt(row.id, adminId, { readAt: new Date() });
    count += 1;
  }
  return count;
}

export async function dismissAdminNotification(
  id: string,
  adminId?: string | null,
): Promise<AdminNotificationRecord | null> {
  const db = getDb();
  const existing = await db.adminNotification.findUnique({ where: { id } });
  if (!existing) return null;
  const now = new Date();
  const receipt = await upsertReceipt(id, adminId, {
    dismissedAt: now,
    readAt: now,
  });
  return applyNotificationReceipt(toBase(existing), {
    readAt: receipt.readAt?.toISOString() ?? null,
    dismissedAt: receipt.dismissedAt?.toISOString() ?? null,
  });
}
