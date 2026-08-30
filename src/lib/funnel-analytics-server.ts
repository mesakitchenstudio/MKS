import "server-only";
import { getDb } from "@/lib/db";
import {
  isFunnelEventName,
  sanitizeFunnelMeta,
  type FunnelEventName,
} from "@/lib/funnel-analytics";
import { normalizeGuestVisitorKey } from "@/lib/guest-tracking";

export type PersistFunnelEventInput = {
  visitorKey: string;
  name: string;
  recipeId?: string;
  recipeSlug?: string;
  youtubeVideoId?: string;
  targetRecipeId?: string;
  targetVideoId?: string;
  placement?: string;
  chapterLabel?: string;
  chapterTimeSeconds?: number | null;
  chapterIndex?: number | null;
  meta?: Record<string, unknown>;
};

function clip(value: unknown, max = 200) {
  return String(value || "").trim().slice(0, max);
}

export async function persistFunnelEvent(
  input: PersistFunnelEventInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const name = clip(input.name, 80);
  if (!isFunnelEventName(name)) {
    return { ok: false, reason: "invalid_event" };
  }
  const visitorKey = normalizeGuestVisitorKey(input.visitorKey);
  if (!visitorKey) {
    return { ok: false, reason: "missing_visitor" };
  }

  const db = getDb();
  const visitor = await db.guestVisitor.findUnique({
    where: { visitorKey },
    select: { id: true },
  });
  if (!visitor) {
    // Ensure a visitor row exists so early CTA clicks (before first heartbeat) still record.
    try {
      const created = await db.guestVisitor.create({
        data: {
          visitorKey,
          lastPath: "",
        },
        select: { id: true },
      });
      return writeEvent(created.id, name as FunnelEventName, input);
    } catch {
      const again = await db.guestVisitor.findUnique({
        where: { visitorKey },
        select: { id: true },
      });
      if (!again) return { ok: false, reason: "visitor_missing" };
      return writeEvent(again.id, name as FunnelEventName, input);
    }
  }

  return writeEvent(visitor.id, name as FunnelEventName, input);
}

async function writeEvent(
  visitorId: string,
  name: FunnelEventName,
  input: PersistFunnelEventInput,
) {
  const db = getDb();
  const meta = sanitizeFunnelMeta(input.meta);
  await db.funnelEvent.create({
    data: {
      visitorId,
      name,
      recipeId: clip(input.recipeId),
      recipeSlug: clip(input.recipeSlug),
      youtubeVideoId: clip(input.youtubeVideoId, 40),
      targetRecipeId: clip(input.targetRecipeId),
      targetVideoId: clip(input.targetVideoId, 40),
      placement: clip(input.placement, 40),
      chapterLabel: clip(input.chapterLabel, 300),
      chapterTimeSeconds:
        typeof input.chapterTimeSeconds === "number" && Number.isFinite(input.chapterTimeSeconds)
          ? Math.max(0, Math.round(input.chapterTimeSeconds))
          : null,
      chapterIndex:
        typeof input.chapterIndex === "number" && Number.isFinite(input.chapterIndex)
          ? Math.max(0, Math.round(input.chapterIndex))
          : null,
      meta: JSON.stringify(meta),
    },
  });
  return { ok: true as const };
}
