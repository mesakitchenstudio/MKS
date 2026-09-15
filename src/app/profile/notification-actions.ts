"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { findActiveMemberByEmail } from "@/lib/accounts";
import { isMemberFollowsEnabled } from "@/lib/flags";
import {
  memberNotificationErrorMessage,
  type MemberNotificationActionResult,
  type MemberNotificationListItem,
} from "@/lib/member-notifications";
import {
  countUnreadMemberNotificationsForUser,
  listMemberNotificationsForUser,
  markAllMemberNotificationsReadForUser,
  markMemberNotificationReadForUser,
} from "@/lib/member-notifications-server";

async function requireMemberNotificationsUserId(): Promise<
  | { ok: true; userId: string }
  | { ok: false; result: MemberNotificationActionResult<never> }
> {
  if (!isMemberFollowsEnabled()) {
    return {
      ok: false,
      result: {
        ok: false,
        error: "FEATURE_DISABLED",
        message: memberNotificationErrorMessage("FEATURE_DISABLED"),
      },
    };
  }

  const session = await auth();
  const email = session?.user?.email;
  if (
    !email ||
    session.error === "MemberDeleted" ||
    session.error === "SessionRevoked"
  ) {
    return {
      ok: false,
      result: {
        ok: false,
        error: "NOT_AUTHENTICATED",
        message: memberNotificationErrorMessage("NOT_AUTHENTICATED"),
      },
    };
  }

  const member = await findActiveMemberByEmail(email);
  if (!member) {
    return {
      ok: false,
      result: {
        ok: false,
        error: "NOT_AUTHENTICATED",
        message: memberNotificationErrorMessage("NOT_AUTHENTICATED"),
      },
    };
  }

  return { ok: true, userId: member.id };
}

function revalidateNotifications() {
  revalidatePath("/profile/notifications");
}

/**
 * Bounded unread count for AccountMenu.
 * Failures return FEATURE_DISABLED / NOT_AUTHENTICATED — callers must degrade safely.
 * Never accepts client userId.
 */
export async function getUnreadMemberNotificationCountAction(): Promise<
  MemberNotificationActionResult<{ count: number }>
> {
  const authz = await requireMemberNotificationsUserId();
  if (!authz.ok) return authz.result;

  try {
    const count = await countUnreadMemberNotificationsForUser(authz.userId);
    return { ok: true, data: { count } };
  } catch {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: memberNotificationErrorMessage("INVALID_INPUT"),
    };
  }
}

export async function listMyMemberNotificationsAction(): Promise<
  MemberNotificationActionResult<MemberNotificationListItem[]>
> {
  const authz = await requireMemberNotificationsUserId();
  if (!authz.ok) return authz.result;

  try {
    const items = await listMemberNotificationsForUser(authz.userId);
    return { ok: true, data: items };
  } catch {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: "Notifications are temporarily unavailable.",
    };
  }
}

/**
 * Mark one notification read for the authenticated member.
 * Cross-user IDs return NOT_FOUND without leaking existence.
 */
export async function markMemberNotificationReadAction(
  notificationId: string,
): Promise<MemberNotificationActionResult> {
  const id = String(notificationId || "").trim();
  if (!id) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: memberNotificationErrorMessage("INVALID_INPUT"),
    };
  }

  const authz = await requireMemberNotificationsUserId();
  if (!authz.ok) return authz.result;

  const result = await markMemberNotificationReadForUser(authz.userId, id);
  if (!result.ok) return result;
  revalidateNotifications();
  return { ok: true };
}

export async function markAllMemberNotificationsReadAction(): Promise<
  MemberNotificationActionResult<{ updated: number }>
> {
  const authz = await requireMemberNotificationsUserId();
  if (!authz.ok) return authz.result;

  const result = await markAllMemberNotificationsReadForUser(authz.userId);
  if (!result.ok) return result;
  revalidateNotifications();
  return result;
}
