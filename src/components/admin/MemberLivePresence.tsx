"use client";

import { useEffect, useState } from "react";
import { PresenceDot } from "@/components/admin/MemberPresence";
import { formatAdminShortDateTime } from "@/lib/datetime";
import {
  isMemberOnlineFromPresence,
  MEMBER_ADMIN_PRESENCE_POLL_MS,
} from "@/lib/member-presence";

/** Live Online/Offline + Last seen for a member detail page (one poll). */
export function MemberLiveActivity({
  memberId,
  initialOnline,
  initialLastSeen,
}: {
  memberId: string;
  initialOnline: boolean;
  initialLastSeen: Date | string | null | undefined;
}) {
  const [online, setOnline] = useState(initialOnline);
  const [lastSeen, setLastSeen] = useState(() =>
    initialLastSeen
      ? typeof initialLastSeen === "string"
        ? initialLastSeen
        : new Date(initialLastSeen).toISOString()
      : "",
  );

  useEffect(() => {
    setOnline(initialOnline);
    setLastSeen(
      initialLastSeen
        ? typeof initialLastSeen === "string"
          ? initialLastSeen
          : new Date(initialLastSeen).toISOString()
        : "",
    );
  }, [initialOnline, initialLastSeen, memberId]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/admin/members/presence", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as {
          members?: { id: string; online: boolean; lastSeenAt: string }[];
        };
        const row = data.members?.find((item) => item.id === memberId);
        if (!row || cancelled) return;
        setOnline(row.online);
        setLastSeen(row.lastSeenAt);
      } catch {
        // Keep last known values.
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), MEMBER_ADMIN_PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [memberId]);

  const liveOnline = isMemberOnlineFromPresence({ online, lastSeenAt: lastSeen || null });
  const status = liveOnline ? "Online" : "Offline";

  return (
    <>
      <div className="grid gap-1 border-t border-line py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
        <dt className="text-sm font-semibold text-ink">Status</dt>
        <dd className="min-w-0 text-sm text-muted">
          <span className="inline-flex items-center gap-2 text-ink">
            <PresenceDot online={liveOnline} />
            {status}
          </span>
        </dd>
      </div>
      <div className="grid gap-1 border-t border-line py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
        <dt className="text-sm font-semibold text-ink">Last seen</dt>
        <dd className="min-w-0 text-sm text-muted">
          {lastSeen
            ? formatAdminShortDateTime(lastSeen, new Date(), { includeYear: true })
            : "—"}
        </dd>
      </div>
    </>
  );
}

/** Compact live status line for the member header. */
export function MemberLiveStatusLine({
  memberId,
  initialOnline,
  initialLastSeen,
}: {
  memberId: string;
  initialOnline: boolean;
  initialLastSeen: Date | string | null | undefined;
}) {
  const [online, setOnline] = useState(initialOnline);
  const [lastSeen, setLastSeen] = useState(() =>
    initialLastSeen
      ? typeof initialLastSeen === "string"
        ? initialLastSeen
        : new Date(initialLastSeen).toISOString()
      : "",
  );

  useEffect(() => {
    setOnline(initialOnline);
    setLastSeen(
      initialLastSeen
        ? typeof initialLastSeen === "string"
          ? initialLastSeen
          : new Date(initialLastSeen).toISOString()
        : "",
    );
  }, [initialOnline, initialLastSeen, memberId]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/admin/members/presence", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as {
          members?: { id: string; online: boolean; lastSeenAt: string }[];
        };
        const row = data.members?.find((item) => item.id === memberId);
        if (!row || cancelled) return;
        setOnline(row.online);
        setLastSeen(row.lastSeenAt);
      } catch {
        // Keep last known values.
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), MEMBER_ADMIN_PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [memberId]);

  const liveOnline = isMemberOnlineFromPresence({ online, lastSeenAt: lastSeen || null });

  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <PresenceDot online={liveOnline} />
      {liveOnline ? "Online" : "Offline"}
    </span>
  );
}
