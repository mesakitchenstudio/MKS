import {
  adminSessionSubjectKey,
  formatAdminSessionActivity,
  formatAdminSessionClientLabels,
  listActiveAdminAuthSessionsForSubject,
  listAllActiveAdminAuthSessions,
} from "@/lib/admin-auth-sessions";
import type { AdminSessionRowView } from "@/components/admin/AdminSessionControls";
import { accessLabel } from "@/lib/admin-access";
import { getConfiguredSystemOwnerEmail } from "@/lib/admin-staff";

function toRowView(
  row: {
    sessionTokenId: string;
    userAgent: string;
    browser: string;
    operatingSystem: string;
    deviceType: string;
    city: string;
    region: string;
    country: string;
    ipAddress: string | null;
    lastSeenAt: Date;
  },
  currentSid: string | undefined,
): AdminSessionRowView {
  const labels = formatAdminSessionClientLabels(row);
  return {
    sessionTokenId: row.sessionTokenId,
    primary: labels.primary,
    secondary: labels.secondary,
    activityLabel: formatAdminSessionActivity(row.lastSeenAt),
    location: labels.location,
    isCurrent: Boolean(currentSid && row.sessionTokenId === currentSid),
    deviceType: row.deviceType,
  };
}

export async function loadMyAdminSessionRows(actor: { id: string; sid?: string }) {
  const rows = await listActiveAdminAuthSessionsForSubject(adminSessionSubjectKey(actor.id));
  return rows.map((row) => toRowView(row, actor.sid));
}

export type TeamSessionGroup = {
  subjectKey: string;
  name: string;
  email: string;
  roleLabel: string;
  sessions: AdminSessionRowView[];
};

export async function loadOwnerAdminSessionGroups(actor: { id: string; sid?: string }) {
  const rows = await listAllActiveAdminAuthSessions();
  const envEmail = getConfiguredSystemOwnerEmail() || "System owner";
  const groups = new Map<string, TeamSessionGroup>();

  for (const row of rows) {
    const subjectKey = row.subjectKey;
    let group = groups.get(subjectKey);
    if (!group) {
      if (subjectKey === "env") {
        group = {
          subjectKey,
          name: "System owner",
          email: envEmail,
          roleLabel: accessLabel("owner"),
          sessions: [],
        };
      } else {
        group = {
          subjectKey,
          name: row.admin?.name?.trim() || "Staff",
          email: row.admin?.email || "",
          roleLabel: accessLabel(
            row.admin?.role === "owner" || row.admin?.role === "editor" || row.admin?.role === "members"
              ? row.admin.role
              : "editor",
          ),
          sessions: [],
        };
      }
      groups.set(subjectKey, group);
    }
    group.sessions.push(toRowView(row, actor.sid));
  }

  return Array.from(groups.values());
}
