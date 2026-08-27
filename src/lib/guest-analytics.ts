import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { isHumanGuestUserAgent } from "@/lib/guest-client";
import { guestPathTitle, isPopularGuestPath } from "@/lib/guest-path-labels";
import {
  guestAnalyticsPath,
  normalizeGuestNavId,
  shouldInsertGuestPageView,
} from "@/lib/guest-tracking";
import { isSitePrivate } from "@/lib/flags";
import { MEMBER_ONLINE_WITHIN_MS } from "@/lib/member-presence";
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
}) {
  const path = normalizePath(input.path);
  if (!isTrackablePublicPath(path)) return null;

  const db = getDb();
  const meta = connectionMeta(input.headers);
  const now = new Date();
  const referer = normalizeReferer(input.referer || meta.referer || "");
  const navId = normalizeGuestNavId(input.navId);
  const recordPageView = Boolean(input.recordPageView);

  const visitor = await db.guestVisitor.upsert({
    where: { visitorKey: input.visitorKey },
    create: {
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
    update: {
      lastSeenAt: now,
      // Keep current page in sync for presence; page-view rows only on navigation.
      lastPath: path,
      ip: meta.ip && meta.ip !== "unknown" ? meta.ip : undefined,
      country: meta.country || undefined,
      city: meta.city || undefined,
      region: meta.region || undefined,
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 500) : undefined,
    },
  });

  if (!recordPageView) return visitor;

  let alreadyStoredForNavId = false;
  if (navId) {
    const existing = await db.guestPageView.findUnique({
      where: { navId },
      select: { id: true },
    });
    alreadyStoredForNavId = Boolean(existing);
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

export type GuestVisitorRow = Prisma.GuestVisitorGetPayload<{
  include: {
    pageViews: true;
    _count: { select: { pageViews: true } };
  };
}>;

export type GuestVisitorListRow = Prisma.GuestVisitorGetPayload<object>;

export async function listGuestsForAdmin(limit = 200): Promise<GuestVisitorListRow[]> {
  return getDb().guestVisitor.findMany({
    orderBy: { lastSeenAt: "desc" },
    take: limit,
  });
}

export async function getGuestForAdmin(id: string): Promise<GuestVisitorRow | null> {
  if (!id) return null;
  return getDb().guestVisitor.findUnique({
    where: { id },
    include: {
      pageViews: {
        orderBy: { createdAt: "desc" },
        take: 500,
      },
      _count: { select: { pageViews: true } },
    },
  });
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
  const since = new Date(now - MEMBER_ONLINE_WITHIN_MS);
  const rows = await getDb().guestVisitor.findMany({
    where: { lastSeenAt: { gte: since } },
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
  const onlineSince = new Date(now - MEMBER_ONLINE_WITHIN_MS);
  const weekSince = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const db = getDb();

  const [weekGuests, weekViews] = await Promise.all([
    db.guestVisitor.findMany({
      where: { lastSeenAt: { gte: weekSince } },
      select: { userAgent: true, lastSeenAt: true },
    }),
    db.guestPageView.findMany({
      where: { createdAt: { gte: weekSince } },
      select: {
        path: true,
        userAgent: true,
        visitor: { select: { userAgent: true } },
      },
    }),
  ]);

  const humans = weekGuests.filter((guest) => isHumanGuestUserAgent(guest.userAgent));
  const onlineNow = humans.filter((guest) => guest.lastSeenAt.getTime() >= onlineSince.getTime())
    .length;
  const visitorsLast7Days = humans.length;
  const pageViewsLast7Days = weekViews.filter((view) => {
    const ua = trafficUserAgent(view.userAgent, view.visitor.userAgent);
    return isHumanGuestUserAgent(ua) && isPopularGuestPath(view.path);
  }).length;

  return { onlineNow, visitorsLast7Days, pageViewsLast7Days };
}
