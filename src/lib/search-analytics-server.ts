import "server-only";
import { getDb } from "@/lib/db";
import { normalizeGuestVisitorKey } from "@/lib/guest-tracking";
import {
  clipSearchAnalyticsQueryRaw,
  isSearchAnalyticsPlacement,
  normalizeSearchAnalyticsQuery,
  sanitizeSearchAnalyticsFilters,
  type SearchAnalyticsPlacement,
} from "@/lib/search-analytics";

export type PersistSearchEventInput = {
  visitorKey: string;
  queryRaw?: string;
  queryNorm?: string;
  resultCount?: number;
  zeroResult?: boolean;
  placement?: string;
  filters?: Record<string, string | number | boolean | undefined | null>;
};

export async function persistSearchEvent(
  input: PersistSearchEventInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isSearchAnalyticsPlacement(input.placement)) {
    return { ok: false, reason: "invalid_placement" };
  }
  const placement = input.placement as SearchAnalyticsPlacement;
  const queryRaw = clipSearchAnalyticsQueryRaw(input.queryRaw ?? input.queryNorm);
  const queryNorm =
    normalizeSearchAnalyticsQuery(input.queryNorm) || normalizeSearchAnalyticsQuery(queryRaw);
  const filters = sanitizeSearchAnalyticsFilters(input.filters);
  if (!queryNorm && Object.keys(filters).length === 0) {
    return { ok: false, reason: "empty_query" };
  }

  const visitorKey = normalizeGuestVisitorKey(input.visitorKey);
  if (!visitorKey) return { ok: false, reason: "missing_visitor" };

  const resultCount = Math.max(0, Math.round(Number(input.resultCount) || 0));
  const zeroResult = Boolean(input.zeroResult) || resultCount === 0;

  const db = getDb();
  let visitorId: string | null = null;
  const existing = await db.guestVisitor.findUnique({
    where: { visitorKey },
    select: { id: true },
  });
  if (existing) {
    visitorId = existing.id;
  } else {
    try {
      const created = await db.guestVisitor.create({
        data: { visitorKey, lastPath: "" },
        select: { id: true },
      });
      visitorId = created.id;
    } catch {
      const again = await db.guestVisitor.findUnique({
        where: { visitorKey },
        select: { id: true },
      });
      visitorId = again?.id ?? null;
    }
  }
  if (!visitorId) return { ok: false, reason: "visitor_missing" };

  await db.searchEvent.create({
    data: {
      visitorId,
      queryNorm,
      queryRaw: queryRaw || queryNorm,
      resultCount,
      zeroResult,
      placement,
      filters: JSON.stringify(filters),
    },
  });
  return { ok: true };
}
