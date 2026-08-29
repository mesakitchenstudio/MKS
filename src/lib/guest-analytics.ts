import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { isHumanGuestUserAgent } from "@/lib/guest-client";
import { guestPathTitle, isPopularGuestPath } from "@/lib/guest-path-labels";
import {
  guestAnalyticsPath,
  guestPresenceLastSeenForGraceDisconnect,
  GUEST_PRESENCE_STALE_MS,
  GUEST_PRESENCE_WRITE_THROTTLE_MS,
  normalizeGuestConnectionKey,
  normalizeGuestNavId,
  normalizeGuestVisitorIds,
  shouldInsertGuestPageView,
} from "@/lib/guest-tracking";
import { isSitePrivate } from "@/lib/flags";
import { connectionMeta } from "@/lib/request-meta";
import { getAllRecipes } from "@/lib/recipes";

function trafficUserAgent(pageViewUa: string, visitorUa?: string) {
  return pageViewUa.trim() || visitorUa?.trim() || "";
}

export const GUEST_COOKIE = "mks_guest";
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;
/** Fallback only when clients omit navId (legacy). */
const PAGEVIEW_DEDUPE_MS = 5_000;

export function isTrackablePublicPath(path: string) {
  return Boolean(guestAnalyticsPath(path, isSitePrivate()));
}

export function newGuestVisitorKey() {
  return randomUUID();
}

function normalizePath(path: string) {
  return guestAnalyticsPath(path, isSitePrivate()).slice(0, 500);
}

function normalizeReferer(value: string) {
  return value.trim().slice(0, 500);
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

export async function upsertGuestActivity(input: {
  visitorKey: string;
  path: string;
  referer?: string;
  headers?: unknown;
  recordPageView?: boolean;
  navId?: string;
  connectionKey?: string;
}) {
  const path = normalizePath(input.path);
  if (!isTrackablePublicPath(path)) return null;

  const db = getDb();
  const meta = connectionMeta(input.headers);
  const now = new Date();
  const referer = normalizeReferer(input.referer || meta.referer || "");
  const navId = normalizeGuestNavId(input.navId);
  const connectionKey = normalizeGuestConnectionKey(input.connectionKey);
  const recordPageView = Boolean(input.recordPageView);

  const existing = await db.guestVisitor.findUnique({
    where: { visitorKey: input.visitorKey },
    select: { id: true, lastSeenAt: true, lastPath: true },
  });

  const lastSeenAge = existing
    ? now.getTime() - new Date(existing.lastSeenAt).getTime()
    : Number.POSITIVE_INFINITY;
  const pathChanged = Boolean(existing && existing.lastPath !== path);
  const shouldTouchVisitor =
    !existing ||
    recordPageView ||
    pathChanged ||
    lastSeenAge >= GUEST_PRESENCE_WRITE_THROTTLE_MS;

  let visitor;
  if (!existing) {
    visitor = await db.guestVisitor.create({
      data: {
        visitorKey: input.visitorKey,
        firstSeenAt: now,
        lastSeenAt: now,
        lastPath: path,
        ip: meta.ip,
        country: meta.country,
        city: meta.city,
        region: meta.region,
        userAgent: (meta.userAgent || "").slice(0, 500),
      },
    });
  } else if (shouldTouchVisitor) {
    visitor = await db.guestVisitor.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: now,
        lastPath: path,
        ip: meta.ip && meta.ip !== "unknown" ? meta.ip : undefined,
        country: meta.country || undefined,
        city: meta.city || undefined,
        region: meta.region || undefined,
        userAgent: meta.userAgent ? meta.userAgent.slice(0, 500) : undefined,
      },
    });
  } else {
    visitor = await db.guestVisitor.findUniqueOrThrow({
      where: { id: existing.id },
    });
  }

  if (connectionKey) {
    try {
      const session = await db.guestPresenceSession.findUnique({
        where: {
          visitorId_connectionKey: { visitorId: visitor.id, connectionKey },
        },
        select: { lastSeenAt: true },
      });
      const sessionAge = session
        ? now.getTime() - new Date(session.lastSeenAt).getTime()
        : Number.POSITIVE_INFINITY;

      if (!session || sessionAge >= GUEST_PRESENCE_WRITE_THROTTLE_MS || recordPageView) {
        await db.guestPresenceSession.upsert({
          where: {
            visitorId_connectionKey: { visitorId: visitor.id, connectionKey },
          },
          create: { visitorId: visitor.id, connectionKey, lastSeenAt: now },
          update: { lastSeenAt: now },
        });
      }

      await db.guestPresenceSession.deleteMany({
        where: {
          visitorId: visitor.id,
          lastSeenAt: { lt: new Date(now.getTime() - GUEST_PRESENCE_STALE_MS * 3) },
        },
      });
    } catch (error) {
      console.error("Could not upsert guest presence session", error);
    }
  }

  if (!recordPageView) return visitor;

  let alreadyStoredForNavId = false;
  if (navId) {
    const existingView = await db.guestPageView.findUnique({
      where: { navId },
      select: { id: true },
    });
    alreadyStoredForNavId = Boolean(existingView);
  }

  const latest = navId
    ? null
    : await db.guestPageView.findFirst({
        where: { visitorId: visitor.id },
        orderBy: { createdAt: "desc" },
        select: { path: true, createdAt: true },
      });

  const latestAgeMs = latest ? now.getTime() - latest.createdAt.getTime() : null;

  if (
    !shouldInsertGuestPageView({
      recordPageView,
      navId,
      alreadyStoredForNavId,
      latestPath: latest?.path,
      path,
      latestAgeMs,
      dedupeWindowMs: PAGEVIEW_DEDUPE_MS,
    })
  ) {
    return visitor;
  }

  try {
    await db.guestPageView.create({
      data: {
        visitorId: visitor.id,
        navId: navId || null,
        path,
        referer,
        ip: meta.ip,
        country: meta.country,
        city: meta.city,
        region: meta.region,
        userAgent: (meta.userAgent || "").slice(0, 500),
      },
    });
  } catch (error) {
    // Concurrent duplicate navigation (same visitorId + navId).
    if (isUniqueConstraintError(error)) return visitor;
    throw error;
  }

  return visitor;
}

/** Soft/hard disconnect for one anonymous tab connection only. */
export async function clearGuestPresenceConnection(
  visitorKey: string,
  connectionKey: string,
  options: { immediate?: boolean } = {},
) {
  const key = visitorKey.trim();
  const connection = normalizeGuestConnectionKey(connectionKey);
  if (!key || !connection) return false;

  const db = getDb();
  const visitor = await db.guestVisitor.findUnique({
    where: { visitorKey: key },
    select: { id: true },
  });
  if (!visitor) return false;

  const now = Date.now();
  if (options.immediate) {
    await db.guestPresenceSession.deleteMany({
      where: { visitorId: visitor.id, connectionKey: connection },
    });
  } else {
    await db.guestPresenceSession.updateMany({
      where: { visitorId: visitor.id, connectionKey: connection },
      data: { lastSeenAt: guestPresenceLastSeenForGraceDisconnect(now) },
    });
  }

  const otherLive = await db.guestPresenceSession.count({
    where: {
      visitorId: visitor.id,
      connectionKey: { not: connection },
      lastSeenAt: { gte: new Date(now - GUEST_PRESENCE_STALE_MS) },
    },
  });

  if (otherLive === 0) {
    await db.guestVisitor.update({
      where: { id: visitor.id },
      data: { lastSeenAt: new Date(now) },
    });
  }

  return true;
}

export async function listOnlineGuestVisitorIds(now = Date.now()) {
  const db = getDb();
  const since = new Date(now - GUEST_PRESENCE_STALE_MS);
  const rows = await db.guestPresenceSession.findMany({
    where: { lastSeenAt: { gte: since } },
    select: { visitorId: true },
    distinct: ["visitorId"],
  });
  return new Set(rows.map((row) => row.visitorId));
}

export async function listGuestsPresenceSnapshot(limit = 200) {
  const db = getDb();
  const [guests, onlineIds] = await Promise.all([
    db.guestVisitor.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: limit,
      select: { id: true, lastSeenAt: true, userAgent: true },
    }),
    listOnlineGuestVisitorIds(),
  ]);

  return guests.map((guest) => ({
    id: guest.id,
    online: onlineIds.has(guest.id) && isHumanGuestUserAgent(guest.userAgent),
    lastSeenAt: guest.lastSeenAt.toISOString(),
  }));
}

export type GuestVisitorRow = Prisma.GuestVisitorGetPayload<{
  include: {
    pageViews: true;
    _count: { select: { pageViews: true } };
  };
}>;

export type GuestVisitorListRow = Prisma.GuestVisitorGetPayload<object> & {
  online: boolean;
};

export async function listGuestsForAdmin(limit = 200): Promise<GuestVisitorListRow[]> {
  const [guests, onlineIds] = await Promise.all([
    getDb().guestVisitor.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: limit,
    }),
    listOnlineGuestVisitorIds(),
  ]);

  return guests.map((guest) => ({
    ...guest,
    online: onlineIds.has(guest.id),
  }));
}

export async function getGuestForAdmin(id: string): Promise<(GuestVisitorRow & { online: boolean }) | null> {
  if (!id) return null;
  const guest = await getDb().guestVisitor.findUnique({
    where: { id },
    include: {
      pageViews: {
        orderBy: { createdAt: "desc" },
        take: 500,
      },
      _count: { select: { pageViews: true } },
    },
  });
  if (!guest) return null;
  const onlineIds = await listOnlineGuestVisitorIds();
  return { ...guest, online: onlineIds.has(guest.id) };
}

/**
 * Permanently remove anonymous visitors and all related page-view rows.
 * GuestPageView uses onDelete: Cascade — no orphaned analytics remain.
 */
export async function deleteGuestVisitorsForAdmin(ids: string[]): Promise<number> {
  const unique = normalizeGuestVisitorIds(ids);
  if (!unique.length) return 0;

  const result = await getDb().guestVisitor.deleteMany({
    where: { id: { in: unique } },
  });
  return result.count;
}

export async function deleteGuestVisitorForAdmin(id: string): Promise<boolean> {
  return (await deleteGuestVisitorsForAdmin([id])) > 0;
}

export async function listPopularGuestPaths(days = 7, limit = 20) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const views = await getDb().guestPageView.findMany({
    where: { createdAt: { gte: since } },
    select: {
      path: true,
      userAgent: true,
      visitor: { select: { userAgent: true } },
    },
  });

  const counts = new Map<string, number>();
  for (const view of views) {
    const ua = trafficUserAgent(view.userAgent, view.visitor.userAgent);
    if (!isHumanGuestUserAgent(ua)) continue;
    if (!isPopularGuestPath(view.path)) continue;
    counts.set(view.path, (counts.get(view.path) || 0) + 1);
  }

  const recipes = await getAllRecipes();
  const recipeTitles = new Map(recipes.map((recipe) => [recipe.slug, recipe.title]));

  return [...counts.entries()]
    .map(([path, viewsCount]) => ({
      path,
      views: viewsCount,
      title: guestPathTitle(path, recipeTitles),
    }))
    .sort((left, right) => right.views - left.views || left.path.localeCompare(right.path))
    .slice(0, limit);
}

export async function countOnlineGuests(now = Date.now()) {
  const onlineIds = await listOnlineGuestVisitorIds(now);
  if (!onlineIds.size) return 0;
  const rows = await getDb().guestVisitor.findMany({
    where: { id: { in: [...onlineIds] } },
    select: { userAgent: true },
  });
  return rows.filter((row) => isHumanGuestUserAgent(row.userAgent)).length;
}

export type VisitorAudienceSummary = {
  onlineNow: number;
  visitorsLast7Days: number;
  pageViewsLast7Days: number;
};

/**
 * Human anonymous audience metrics.
 * Members never appear in guest tables; bots are excluded via isHumanGuestUserAgent.
 * Visitors / page views / popular pages share the same human filter.
 */
export async function getVisitorAudienceSummary(
  now = Date.now(),
): Promise<VisitorAudienceSummary> {
  const weekSince = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const db = getDb();

  const [weekGuests, weekViews, onlineIds] = await Promise.all([
    db.guestVisitor.findMany({
      where: { lastSeenAt: { gte: weekSince } },
      select: { id: true, userAgent: true, lastSeenAt: true },
    }),
    db.guestPageView.findMany({
      where: { createdAt: { gte: weekSince } },
      select: {
        path: true,
        userAgent: true,
        visitor: { select: { userAgent: true } },
      },
    }),
    listOnlineGuestVisitorIds(now),
  ]);

  const humans = weekGuests.filter((guest) => isHumanGuestUserAgent(guest.userAgent));
  const onlineNow = humans.filter((guest) => onlineIds.has(guest.id)).length;
  const visitorsLast7Days = humans.length;
  const pageViewsLast7Days = weekViews.filter((view) => {
    const ua = trafficUserAgent(view.userAgent, view.visitor.userAgent);
    return isHumanGuestUserAgent(ua) && isPopularGuestPath(view.path);
  }).length;

  return { onlineNow, visitorsLast7Days, pageViewsLast7Days };
}
