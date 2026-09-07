"use client";

import { getSharedGuestVisitorKey } from "@/lib/guest-tracking";
import {
  recordSearchAnalytics,
  type SearchAnalyticsPlacement,
} from "@/lib/search-analytics";

/** Consent is enforced server-side; this never blocks navigation. */
export function emitRecipeSearchAnalytics(input: {
  searchQuery: string;
  resultCount: number;
  placement: SearchAnalyticsPlacement;
  filters?: Record<string, string | number | boolean | undefined | null>;
}) {
  void getSharedGuestVisitorKey()
    .then((clientVisitorKey) => {
      recordSearchAnalytics({ ...input, clientVisitorKey });
    })
    .catch(() => {
      recordSearchAnalytics(input);
    });
}
