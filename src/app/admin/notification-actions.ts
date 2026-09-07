"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  dismissAdminNotification,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from "@/lib/admin-notifications-server";
import { requireAccess } from "@/lib/auth";

export async function markNotificationReadAction(formData: FormData) {
  const admin = await requireAccess("content");
  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/admin/notifications?error=missing");
  await markAdminNotificationRead(id, admin.id);
  revalidatePath("/admin/notifications");
  revalidatePath("/admin");
  redirect("/admin/notifications");
}

export async function dismissNotificationAction(formData: FormData) {
  const admin = await requireAccess("content");
  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/admin/notifications?error=missing");
  await dismissAdminNotification(id, admin.id);
  revalidatePath("/admin/notifications");
  redirect("/admin/notifications");
}

export async function markAllNotificationsReadAction() {
  const admin = await requireAccess("content");
  await markAllAdminNotificationsRead(admin.id);
  revalidatePath("/admin/notifications");
  redirect("/admin/notifications?read=all");
}
