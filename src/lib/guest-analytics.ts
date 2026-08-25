import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { MEMBER_ONLINE_WITHIN_MS } from "@/lib/member-presence";
import { connectionMeta } from "@/lib/request-meta";

export const GUEST_COOKIE = "mks_guest";
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;
const PAGEVIEW_DEDUPE_MS = 5_000;

export function isTrackablePublicPath(path: string) {
  if (!path || !path.startsWith("/")) return false;
  if (path.startsWith("/admin")) return false;
  if (path.startsWith("/api")) return false;
  return true;
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

export async function upsertGuestActivity(input: {
  visitorKey: string;
  path: string;
  referer?: string;
  headers?: unknown;
  recordPageView?: boolean;
}) {
  const path = normalizePath(input.path);
  if (!isTrackablePublicPath(path)) return null;

  const db = getDb();
  const meta = connectionMeta(input.headers);
  const now = new Date();
  const referer = normalizeReferer(input.referer || meta.referer || "");

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
      lastPath: path,
      ip: meta.ip && meta.ip !== "unknown" ? meta.ip : undefined,
      country: meta.country || undefined,
      city: meta.city || undefined,
      region: meta.region || undefined,
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 500) : undefined,
    },
  });

  if (!input.recordPageView) return visitor;

  const latest = await db.guestPageView.findFirst({
    where: { visitorId: visitor.id },
    orderBy: { createdAt: "desc" },
  });

  const samePathRecently =
    latest &&
    latest.path === path &&
    now.getTime() - latest.createdAt.getTime() < PAGEVIEW_DEDUPE_MS;

  if (!samePathRecently) {
    await db.guestPageView.create({
      data: {
        visitorId: visitor.id,
        path,
        referer,
        ip: meta.ip,
        country: meta.country,
        city: meta.city,
        region: meta.region,
        userAgent: (meta.userAgent || "").slice(0, 500),
      },
    });
  }

  return visitor;
}

export type GuestVisitorRow = Prisma.GuestVisitorGetPayload<{
  include: {
    pageViews: true;
  };
}>;

export async function listGuestsForAdmin(limit = 200): Promise<GuestVisitorRow[]> {
  return getDb().guestVisitor.findMany({
    orderBy: { lastSeenAt: "desc" },
    take: limit,
    include: {
      pageViews: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
}

export async function listPopularGuestPaths(days = 7, limit = 12) {
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
