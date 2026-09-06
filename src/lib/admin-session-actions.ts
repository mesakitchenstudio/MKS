"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  adminSessionSubjectKey,
  revokeAdminAuthSessionByTokenId,
  revokeAdminAuthSessionsForSubject,
} from "@/lib/admin-auth-sessions";
import { getAdminSession, requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";

function profileSessionsRedirect(query = "") {
  redirect(`/admin/profile${query ? `?${query}` : ""}#security-sessions`);
}

function staffSessionsRedirect(query = "") {
  redirect(`/admin/staff${query ? `?${query}` : ""}#team-sessions`);
}

/** Revoke one of the actor's own non-current sessions. */
export async function revokeOwnAdminSessionAction(formData: FormData) {
  const actor = await getAdminSession();
  if (!actor?.sid) redirect("/admin/login");

  const sessionTokenId = String(formData.get("sessionTokenId") || "").trim();
  if (!sessionTokenId) profileSessionsRedirect("sessionError=missing");
  if (sessionTokenId === actor.sid) {
    profileSessionsRedirect("sessionError=current");
  }

  const db = getDb();
  const row = await db.adminSession.findUnique({ where: { sessionTokenId } });
  if (!row || row.subjectKey !== adminSessionSubjectKey(actor.id)) {
    profileSessionsRedirect("sessionError=forbidden");
  }
  if (row!.revokedAt) {
    profileSessionsRedirect("sessionRevoked=1");
  }

  await revokeAdminAuthSessionByTokenId(sessionTokenId, "revoked_by_self");
  revalidatePath("/admin/profile");
  revalidatePath("/admin/staff");
  profileSessionsRedirect("sessionRevoked=1");
}

/** Revoke every active session for the actor except the current device. */
export async function revokeAllOtherOwnAdminSessionsAction(formData?: FormData) {
  void formData;
  const actor = await getAdminSession();
  if (!actor?.sid) redirect("/admin/login");

  await revokeAdminAuthSessionsForSubject(
    adminSessionSubjectKey(actor.id),
    "revoked_all_other_by_self",
    actor.sid,
  );
  revalidatePath("/admin/profile");
  revalidatePath("/admin/staff");
  profileSessionsRedirect("sessionsRevoked=1");
}

/** Owner: revoke a specific session belonging to any staff member. */
export async function revokeStaffAdminSessionAction(formData: FormData) {
  const actor = await requireAccess("staff");
  if (!actor.sid) redirect("/admin/login");

  const sessionTokenId = String(formData.get("sessionTokenId") || "").trim();
  if (!sessionTokenId) staffSessionsRedirect("sessionError=missing");
  if (sessionTokenId === actor.sid) {
    staffSessionsRedirect("sessionError=current");
  }

  const db = getDb();
  const row = await db.adminSession.findUnique({ where: { sessionTokenId } });
  if (!row || row.revokedAt) {
    staffSessionsRedirect("sessionRevoked=1");
  }

  await revokeAdminAuthSessionByTokenId(sessionTokenId, "revoked_by_owner");
  revalidatePath("/admin/staff");
  revalidatePath("/admin/profile");
  staffSessionsRedirect("sessionRevoked=1");
}

/** Owner: revoke all active sessions for one staff subject (admin id or "env"). */
export async function revokeAllSessionsForStaffAction(formData: FormData) {
  const actor = await requireAccess("staff");
  if (!actor.sid) redirect("/admin/login");

  const subjectKey = String(formData.get("subjectKey") || "").trim();
  if (!subjectKey) staffSessionsRedirect("sessionError=missing");

  const exceptCurrent =
    subjectKey === adminSessionSubjectKey(actor.id) ? actor.sid : undefined;

  await revokeAdminAuthSessionsForSubject(
    subjectKey,
    "revoked_all_by_owner",
    exceptCurrent,
  );
  revalidatePath("/admin/staff");
  revalidatePath("/admin/profile");
  staffSessionsRedirect("sessionsRevoked=1");
}
