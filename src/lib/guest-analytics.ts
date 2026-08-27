import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import {
  normalizeGuestNavId,
  shouldInsertGuestPageView,
  shouldTrackGuestPath,
} from "@/lib/guest-tracking";
import { MEMBER_ONLINE_WITHIN_MS } from "@/lib/member-presence";
import { connectionMeta } from "@/lib/request-meta";

export const GUEST_COOKIE = "mks_guest";
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;
/** Fallback only when clients omit navId (legacy). */
const PAGEVIEW_DEDUPE_MS = 5_000;

export function isTrackablePublicPath(path: string) {
  return shouldTrackGuestPath(path);
}

export function newGuestVisitorKey() {
  return randomUUID();
}

function normalizePath(path: string) {
  const trimmed = path.trim().slice(0, 500);
  if (!trimmed.startsWith("/")) return "";
  return trimmed.split("?")[0]?.split("#")[0] || "";
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
        take: 100,
      },
      _count: { select: { pageViews: true } },
    },
  });
}

export async function listPopularGuestPaths(days = 7, limit = 20) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await getDb().guestPageView.groupBy({
    by: ["path"],
    where: { createdAt: { gte: since } },
    _count: { path: true },
    orderBy: { _count: { path: "desc" } },
    take: limit,
  });
  return rows.map((row) => ({ path: row.path, views: row._count.path }));
}

export async function countOnlineGuests(now = Date.now()) {
  const since = new Date(now - MEMBER_ONLINE_WITHIN_MS);
  return getDb().guestVisitor.count({
    where: { lastSeenAt: { gte: since } },
  });
}
