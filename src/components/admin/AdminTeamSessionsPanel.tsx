"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminRevokeStaffSessionsButton,
  AdminSessionList,
  type TeamSessionGroup,
} from "@/components/admin/AdminSessionControls";
import {
  ADMIN_STAFF_SESSIONS_POLL_MS,
  shouldPollAdminStaffSessions,
} from "@/lib/admin-session-presence";

type AdminTeamSessionsPanelProps = {
  initialGroups: TeamSessionGroup[];
  revokeAction: (formData: FormData) => void | Promise<void>;
  revokeAllAction: (formData: FormData) => void | Promise<void>;
};

export function AdminTeamSessionsPanel({
  initialGroups,
  revokeAction,
  revokeAllAction,
}: AdminTeamSessionsPanelProps) {
  const [propsGroups, setPropsGroups] = useState(initialGroups);
  const [groups, setGroups] = useState(initialGroups);
  if (propsGroups !== initialGroups) {
    setPropsGroups(initialGroups);
    setGroups(initialGroups);
  }

  const refreshSessions = useCallback(async () => {
    if (typeof document !== "undefined" && !shouldPollAdminStaffSessions(document.visibilityState)) {
      return;
    }
    try {
      const response = await fetch("/api/admin/staff/sessions", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.href = "/admin/login?reason=session-revoked";
        return;
      }
      if (!response.ok) return;
      const data = (await response.json()) as { groups?: TeamSessionGroup[] };
      if (!Array.isArray(data.groups)) return;
      setGroups(data.groups);
    } catch {
      // Keep the currently rendered list on temporary network failures.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    async function poll() {
      if (cancelled) return;
      await refreshSessions();
    }

    function startInterval() {
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        if (shouldPollAdminStaffSessions(document.visibilityState)) void poll();
      }, ADMIN_STAFF_SESSIONS_POLL_MS);
    }

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      void poll();
      startInterval();
    }

    function onFocus() {
      if (document.visibilityState === "visible") void poll();
    }

    void poll();
    startInterval();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshSessions]);

  if (groups.length === 0) {
    return <p className="mt-5 text-sm leading-6 text-muted">No active admin sessions right now.</p>;
  }

  return (
    <div className="mt-6 space-y-10">
      {groups.map((group) => (
        <div key={group.subjectKey} className="max-w-2xl">
          <div>
            <p className="font-medium text-ink">{group.name}</p>
            <p className="mt-0.5 text-sm text-muted">
              {group.roleLabel}
              {group.email ? ` · ${group.email}` : ""}
            </p>
          </div>
          <AdminSessionList
            sessions={group.sessions}
            revokeAction={revokeAction}
            emptyCopy="No active sessions."
          />
          {group.sessions.some((session) => !session.isCurrent) || group.sessions.length > 0 ? (
            <AdminRevokeStaffSessionsButton
              subjectKey={group.subjectKey}
              staffName={group.name}
              action={revokeAllAction}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
