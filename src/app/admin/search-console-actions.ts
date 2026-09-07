"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorFromAdminSession, recordAdminAuditEvent } from "@/lib/admin-audit";
import { canManageSearchConsole } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import {
  disconnectSearchConsoleConnection,
  selectSearchConsoleProperty,
} from "@/lib/search-console/connection";
import { searchConsoleErrorMessage } from "@/lib/search-console/errors";
import { syncSearchConsole } from "@/lib/search-console/sync";

async function requireSearchConsoleManager() {
  const admin = await requireAccess("content");
  if (!canManageSearchConsole(admin.role)) {
    throw new Error("Only owners can manage Search Console.");
  }
  return admin;
}

export async function selectSearchConsolePropertyAction(formData: FormData) {
  try {
    const admin = await requireSearchConsoleManager();
    const siteUrl = String(formData.get("siteUrl") || "").trim();
    await selectSearchConsoleProperty(siteUrl);
    await recordAdminAuditEvent({
      actor: actorFromAdminSession(admin),
      action: "search_console.property_selected",
      area: "content",
      entityType: "search_console",
      entityId: siteUrl,
      entityLabel: siteUrl,
      entityPath: "/admin/search-console",
      metadata: { siteUrl },
    });
    await syncSearchConsole({ forceFullWindow: true });
    revalidatePath("/admin/search-console");
    redirect("/admin/search-console");
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(
      `/admin/search-console?error=${encodeURIComponent(searchConsoleErrorMessage(error))}`,
    );
  }
}

export async function disconnectSearchConsoleAction() {
  try {
    const admin = await requireSearchConsoleManager();
    await disconnectSearchConsoleConnection();
    await recordAdminAuditEvent({
      actor: actorFromAdminSession(admin),
      action: "search_console.disconnected",
      area: "content",
      entityType: "search_console",
      entityPath: "/admin/search-console",
    });
    revalidatePath("/admin/search-console");
    redirect("/admin/search-console");
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(
      `/admin/search-console?error=${encodeURIComponent(searchConsoleErrorMessage(error))}`,
    );
  }
}

export async function syncSearchConsoleNowAction() {
  try {
    const admin = await requireSearchConsoleManager();
    await recordAdminAuditEvent({
      actor: actorFromAdminSession(admin),
      action: "search_console.sync_requested",
      area: "content",
      entityType: "search_console",
      entityPath: "/admin/search-console",
    });
    const result = await syncSearchConsole();
    revalidatePath("/admin/search-console");
    if (!result.ok && !result.skipped) {
      redirect(
        `/admin/search-console?error=${encodeURIComponent(result.error || "Sync failed.")}`,
      );
    }
    redirect("/admin/search-console");
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(
      `/admin/search-console?error=${encodeURIComponent(searchConsoleErrorMessage(error))}`,
    );
  }
}

function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
  );
}
