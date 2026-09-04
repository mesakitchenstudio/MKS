"use client";

import { useEffect, useState } from "react";
import { formatAdminShortDateTime } from "@/lib/datetime";
import {
  isMemberOnlineFromPresence,
  MEMBER_ADMIN_PRESENCE_POLL_MS,
} from "@/lib/member-presence";

function toIso(value: Date | string | null | undefined) {
  if (!value) return "";
  return typeof value === "string" ? value : new Date(value).toISOString();
}

/** Live Last seen value for member detail metadata (Online now when live). */
export function MemberLiveLastSeen({
  memberId,
  initialOnline,
  initialLastSeen,
}: {
  memberId: string;
  initialOnline: boolean;
  initialLastSeen: Date | string | null | undefined;
}) {
  const [online, setOnline] = useState(initialOnline);
  const [lastSeen, setLastSeen] = useState(() => toIso(initialLastSeen));
  const [trackedKey, setTrackedKey] = useState(
    () => `${memberId}:${initialOnline}:${toIso(initialLastSeen)}`,
  );
  const nextKey = `${memberId}:${initialOnline}:${toIso(initialLastSeen)}`;
  if (nextKey !== trackedKey) {
    setTrackedKey(nextKey);
    setOnline(initialOnline);
    setLastSeen(toIso(initialLastSeen));
  }

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

  if (liveOnline) {
    return <span className="font-medium text-olive">Online now</span>;
  }

  return (
    <>
      {lastSeen
        ? formatAdminShortDateTime(lastSeen, new Date(), { includeYear: true })
        : "—"}
    </>
  );
}
