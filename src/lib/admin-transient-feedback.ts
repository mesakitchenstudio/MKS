"use client";

import { createElement, useEffect, useState } from "react";

/** How long inline “Saved.” feedback stays visible after a redirect success. */
export const ADMIN_SAVED_FEEDBACK_MS = 3000;

export const TYPE_FIELD_SAVED_PARAMS = ["saved", "fieldId"] as const;
export const TYPE_DETAILS_SAVED_PARAMS = ["saved"] as const;
export const CATEGORY_SAVED_PARAMS = ["saved", "categoryId"] as const;
export const CATEGORY_DELETED_PARAMS = ["deleted"] as const;
export const TYPE_FIELD_DELETED_PARAMS = ["deleted"] as const;
export const REVIEW_REMOVED_PARAMS = ["removed"] as const;
export const REVIEW_REPLY_REMOVED_PARAMS = ["replyRemoved"] as const;
export const REVIEW_REPLIED_PARAMS = ["replied"] as const;
export const MEMBER_REMOVED_PARAMS = ["removed"] as const;
export const STAFF_SAVED_PARAMS = ["saved", "admin"] as const;
export const STAFF_CREATED_PARAMS = ["created"] as const;
export const STAFF_REMOVED_PARAMS = ["removed"] as const;
export const PROFILE_SAVED_PARAMS = ["saved"] as const;
export { ANALYTICS_FLASH_PARAMS as YOUTUBE_ANALYTICS_FLASH_PARAMS } from "@/lib/youtube-analytics/status";

/** Strip transient query keys while preserving pathname and hash. */
export function stripSearchParams(href: string, keys: readonly string[]): string {
  const url = new URL(href, "http://localhost");
  for (const key of keys) {
    url.searchParams.delete(key);
  }
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}

/** Replace the current history entry so refresh/back do not replay success UI. */
export function clearTransientSearchParams(keys: readonly string[]) {
  if (typeof window === "undefined") return;
  const next = stripSearchParams(window.location.href, keys);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  window.history.replaceState(window.history.state, "", next);
}

/**
 * Consume a redirect success id from props, clear its query params once, and
 * hide the signal after a short delay.
 */
export function useTransientSavedId(
  savedId: string | null | undefined,
  clearParams: readonly string[],
  durationMs = ADMIN_SAVED_FEEDBACK_MS,
): string | null {
  const [visibleId, setVisibleId] = useState<string | null>(savedId ?? null);

  useEffect(() => {
    if (!savedId) {
      setVisibleId(null);
      return;
    }
    setVisibleId(savedId);
    clearTransientSearchParams(clearParams);
    const timer = window.setTimeout(() => setVisibleId(null), durationMs);
    return () => window.clearTimeout(timer);
  }, [savedId, durationMs, clearParams]);

  return visibleId;
}

/** Boolean variant for pages that only set `?saved=…` without an entity id. */
export function useTransientSavedFlag(
  saved: boolean | undefined,
  clearParams: readonly string[],
  durationMs = ADMIN_SAVED_FEEDBACK_MS,
): boolean {
  const signal = saved ? "1" : null;
  return useTransientSavedId(signal, clearParams, durationMs) !== null;
}

export function AdminSavedStatus({ show }: { show: boolean }) {
  if (!show) return null;
  return createElement(
    "span",
    { className: "text-sm text-olive", role: "status", "aria-live": "polite" },
    "Saved.",
  );
}

/** One-time flash banner that clears its query params after mount. */
export function AdminFlashStatus({
  active,
  clearParams,
  children,
  className = "mt-4 text-sm text-olive",
}: {
  active: boolean;
  clearParams: readonly string[];
  children: string;
  className?: string;
}) {
  const show = useTransientSavedFlag(active, clearParams);
  if (!show) return null;
  return createElement(
    "p",
    { className, role: "status", "aria-live": "polite" },
    children,
  );
}
