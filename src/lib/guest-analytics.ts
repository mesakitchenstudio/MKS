import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import {
  classifyGuestClient,
  formatGuestOsBrowserLabel,
  isHumanGuestUserAgent,
  type GuestClientKind,
} from "@/lib/guest-client";
import {
  deriveGuestAcquisition,
  guestTrafficSourceLabel,
  type GuestTrafficSource,
} from "@/lib/guest-acquisition";
import {
  guestUtmFieldsAreEmpty,
  parseGuestUtmFromRequestBody,
  type GuestUtmFields,
} from "@/lib/guest-utm";
import {
  guestPathTitle,
  isComingSoonGuestPath,
  isEditorialPopularGuestPath,
  isPopularGuestPath,
  isRecipeDetailGuestPath,
} from "@/lib/guest-path-labels";
import {
  guestAnalyticsPath,
  guestPresenceLastSeenForGraceDisconnect,
  GUEST_PRESENCE_STALE_MS,
  GUEST_PRESENCE_WRITE_THROTTLE_MS,
  normalizeGuestConnectionKey,
  normalizeGuestNavId,
  normalizeGuestVisitorIds,
  normalizeGuestVisitorKey,
  shouldInsertGuestPageView,
} from "@/lib/guest-tracking";
import { isSitePrivate } from "@/lib/flags";
import { connectionMeta, formatCountryCityLocation } from "@/lib/request-meta";
import { getAllRecipes } from "@/lib/recipes";
import {
  funnelDateWindow,
  type AnalyticsRangeDays,
} from "@/lib/youtube-funnel/aggregate";
import { parseAnalyticsRangeDays } from "@/lib/youtube-analytics/ranges";

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

/**
 * First-touch UTM write: only fill null columns (never overwrite).
 * Per-field updateMany avoids races where concurrent first hits clobber each other.
 */
async function applyFirstTouchUtms(visitorId: string, utm: GuestUtmFields) {
  if (guestUtmFieldsAreEmpty(utm)) return;
  const db = getDb();
  if (utm.utmSource) {
    await db.guestVisitor.updateMany({
      where: { id: visitorId, utmSource: null },
      data: { utmSource: utm.utmSource },
    });
  }
  if (utm.utmMedium) {
    await db.guestVisitor.updateMany({
      where: { id: visitorId, utmMedium: null },
      data: { utmMedium: utm.utmMedium },
    });
  }
  if (utm.utmCampaign) {
    await db.guestVisitor.updateMany({
      where: { id: visitorId, utmCampaign: null },
      data: { utmCampaign: utm.utmCampaign },
    });
  }
}

export async function upsertGuestActivity(input: {
  visitorKey: string;
  path: string;
  referer?: string;
  headers?: unknown;
  recordPageView?: boolean;
  navId?: string;
  connectionKey?: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
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
  const utm = parseGuestUtmFromRequestBody({
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
  });

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
    lastSeenAge >= GUEST_PRESENCE_WRITE_THROTTLE_MS ||
    !guestUtmFieldsAreEmpty(utm);

  let visitor;
  if (!existing) {
    try {
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
          utmSource: utm.utmSource,
          utmMedium: utm.utmMedium,
          utmCampaign: utm.utmCampaign,
        },
      });
    } catch (error) {
      // Concurrent first-create from another tab with the same bootstrap key.
      if (!isUniqueConstraintError(error)) throw error;
      visitor = await db.guestVisitor.findUnique({
        where: { visitorKey: input.visitorKey },
      });
      if (!visitor) return null;
      await applyFirstTouchUtms(visitor.id, utm);
      visitor = (await db.guestVisitor.findUnique({ where: { id: visitor.id } })) || visitor;
    }
  } else if (shouldTouchVisitor) {
    try {
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
      await applyFirstTouchUtms(visitor.id, utm);
      visitor = (await db.guestVisitor.findUnique({ where: { id: visitor.id } })) || visitor;
    } catch {
      // Row vanished mid-request (admin delete) — signal caller to rotate identity.
      return null;
    }
  } else {
    visitor = await db.guestVisitor.findUnique({
      where: { id: existing.id },
    });
    if (!visitor) return null;
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

/**
 * End all anonymous presence for a visitor identity after Member conversion.
 * Preserves the GuestVisitor row and page-view history; only clears live sessions.
 */
export async function endGuestPresenceForVisitor(visitorKey: string) {
  const key = normalizeGuestVisitorKey(visitorKey) || visitorKey.trim();
  if (!key) return false;

  const db = getDb();
  const visitor = await db.guestVisitor.findUnique({
    where: { visitorKey: key },
    select: { id: true },
  });
  if (!visitor) return false;

  const now = new Date();
  await db.guestPresenceSession.deleteMany({ where: { visitorId: visitor.id } });
  await db.guestVisitor.update({
    where: { id: visitor.id },
    data: { lastSeenAt: now },
  });
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

export async function getGuestForAdmin(
  id: string,
): Promise<(GuestVisitorRow & { online: boolean; activeConnections: number }) | null> {
  if (!id) return null;
  const guest = await getDb().guestVisitor.findUnique({
    where: { id },
    include: {
      pageViews: {
        orderBy: { createdAt: "asc" },
        take: 500,
      },
      _count: { select: { pageViews: true } },
    },
  });
  if (!guest) return null;
  const [onlineIds, activeConnections] = await Promise.all([
    listOnlineGuestVisitorIds(),
    getDb().guestPresenceSession.count({
      where: {
        visitorId: guest.id,
        lastSeenAt: { gte: new Date(Date.now() - GUEST_PRESENCE_STALE_MS) },
      },
    }),
  ]);
  return {
    ...guest,
    online: onlineIds.has(guest.id),
    activeConnections,
  };
}

/**
 * Permanently remove anonymous visitors and all related page-view / presence rows.
 * Presence is deleted explicitly first so active Online connections cannot linger
 * as orphans if cascade behavior changes; page views still cascade with the visitor.
 */
export async function deleteGuestVisitorsForAdmin(ids: string[]): Promise<number> {
  const unique = normalizeGuestVisitorIds(ids);
  if (!unique.length) return 0;

  const db = getDb();
  await db.guestPresenceSession.deleteMany({
    where: { visitorId: { in: unique } },
  });
  const result = await db.guestVisitor.deleteMany({
    where: { id: { in: unique } },
  });
  return result.count;
}

export async function deleteGuestVisitorForAdmin(id: string): Promise<boolean> {
  return (await deleteGuestVisitorsForAdmin([id])) > 0;
}

export async function listPopularGuestPaths(days: AnalyticsRangeDays = 7, limit = 20) {
  const window = funnelDateWindow(days);
  const views = await getDb().guestPageView.findMany({
    where: {
      createdAt: { gte: window.start, lt: window.endExclusive },
    },
    select: {
      path: true,
      userAgent: true,
      visitorId: true,
      visitor: { select: { userAgent: true } },
    },
  });

  const counts = new Map<string, number>();
  const uniques = new Map<string, Set<string>>();
  let comingSoonViews = 0;

  for (const view of views) {
    const ua = trafficUserAgent(view.userAgent, view.visitor.userAgent);
    if (!isHumanGuestUserAgent(ua)) continue;
    if (!isPopularGuestPath(view.path)) continue;
    if (isComingSoonGuestPath(view.path)) {
      comingSoonViews += 1;
      continue;
    }
    if (!isEditorialPopularGuestPath(view.path)) continue;
    counts.set(view.path, (counts.get(view.path) || 0) + 1);
    const set = uniques.get(view.path) || new Set<string>();
    set.add(view.visitorId);
    uniques.set(view.path, set);
  }

  const recipes = await getAllRecipes();
  const recipeTitles = new Map(recipes.map((recipe) => [recipe.slug, recipe.title]));

  const items = [...counts.entries()]
    .map(([path, viewsCount]) => ({
      path,
      views: viewsCount,
      uniqueVisitors: uniques.get(path)?.size || 0,
      title: guestPathTitle(path, recipeTitles),
    }))
    .sort((left, right) => right.views - left.views || left.path.localeCompare(right.path))
    .slice(0, limit);

  return { items, comingSoonViews, rangeDays: days };
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
  visitors: number;
  pageViews: number;
  recipeViews: number;
  /** @deprecated use visitors — kept for older call sites */
  visitorsLast7Days: number;
  /** @deprecated use pageViews */
  pageViewsLast7Days: number;
  rangeDays: AnalyticsRangeDays;
};

/**
 * Human anonymous audience metrics for a Funnel-style date window (includes today).
 * Members never appear in guest tables; known bots are excluded via isHumanGuestUserAgent.
 * Unknown UA classifications remain in the non-bot pool (same as before).
 */
export async function getVisitorAudienceSummary(
  daysOrNow: AnalyticsRangeDays | number = 7,
  maybeNow?: number,
): Promise<VisitorAudienceSummary> {
  // Back-compat: getVisitorAudienceSummary(now) used a timestamp as the only arg.
  const days: AnalyticsRangeDays =
    daysOrNow === 7 || daysOrNow === 28 || daysOrNow === 90
      ? daysOrNow
      : 7;
  const now =
    typeof daysOrNow === "number" && daysOrNow !== 7 && daysOrNow !== 28 && daysOrNow !== 90
      ? daysOrNow
      : (maybeNow ?? Date.now());

  const window = funnelDateWindow(days, new Date(now));
  const db = getDb();

  const [periodGuests, periodViews, onlineIds] = await Promise.all([
    db.guestVisitor.findMany({
      where: { lastSeenAt: { gte: window.start } },
      select: { id: true, userAgent: true, lastSeenAt: true },
    }),
    db.guestPageView.findMany({
      where: { createdAt: { gte: window.start, lt: window.endExclusive } },
      select: {
        path: true,
        userAgent: true,
        visitor: { select: { userAgent: true } },
      },
    }),
    listOnlineGuestVisitorIds(now),
  ]);

  const nonBots = periodGuests.filter((guest) => isHumanGuestUserAgent(guest.userAgent));
  const onlineNow = nonBots.filter((guest) => onlineIds.has(guest.id)).length;
  const visitors = nonBots.length;
  const humanViews = periodViews.filter((view) => {
    const ua = trafficUserAgent(view.userAgent, view.visitor.userAgent);
    return isHumanGuestUserAgent(ua) && isPopularGuestPath(view.path);
  });
  const pageViews = humanViews.length;
  const recipeViews = humanViews.filter((view) => isRecipeDetailGuestPath(view.path)).length;

  return {
    onlineNow,
    visitors,
    pageViews,
    recipeViews,
    visitorsLast7Days: visitors,
    pageViewsLast7Days: pageViews,
    rangeDays: days,
  };
}

export type GuestTrafficSourceRow = {
  source: GuestTrafficSource;
  label: string;
  visitors: number;
};

/** Unique non-bot visitors in range, attributed by first-touch UTM then referrer. */
export async function listGuestTrafficSources(
  days: AnalyticsRangeDays = 7,
): Promise<GuestTrafficSourceRow[]> {
  const window = funnelDateWindow(days);
  const guests = await getDb().guestVisitor.findMany({
    where: { lastSeenAt: { gte: window.start } },
    select: {
      id: true,
      userAgent: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      pageViews: {
        orderBy: { createdAt: "asc" },
        select: { path: true, referer: true, createdAt: true },
      },
    },
  });

  const counts = new Map<GuestTrafficSource, number>();
  for (const source of [
    "youtube",
    "google",
    "pinterest",
    "instagram",
    "facebook",
    "direct",
    "other",
  ] as GuestTrafficSource[]) {
    counts.set(source, 0);
  }

  for (const guest of guests) {
    if (!isHumanGuestUserAgent(guest.userAgent)) continue;
    const acquisition = deriveGuestAcquisition(guest.pageViews, {
      utmSource: guest.utmSource,
      utmMedium: guest.utmMedium,
      utmCampaign: guest.utmCampaign,
    });
    counts.set(acquisition.source, (counts.get(acquisition.source) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([source, visitors]) => ({
      source,
      label: guestTrafficSourceLabel(source),
      visitors,
    }))
    .filter((row) => row.visitors > 0)
    .sort((a, b) => b.visitors - a.visitors || a.label.localeCompare(b.label));
}

export const GUEST_VISITORS_PAGE_SIZE = 25;

export type GuestKindFilter = "humans" | "bots" | "unknown" | "all";

export type GuestVisitorAdminListRow = {
  id: string;
  visitorKey: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastPath: string;
  lastPathTitle: string;
  landingPath: string;
  landingTitle: string;
  online: boolean;
  kind: GuestClientKind;
  kindLabel: string;
  source: GuestTrafficSource;
  sourceLabel: string;
  location: string;
  device: string;
  returning: boolean;
};

export type GuestVisitorAdminListResult = {
  rows: GuestVisitorAdminListRow[];
  total: number;
  page: number;
  pageSize: number;
  rangeDays: AnalyticsRangeDays;
};

function matchesKindFilter(kind: GuestClientKind, filter: GuestKindFilter) {
  if (filter === "all") return true;
  if (filter === "humans") return kind === "visitor";
  if (filter === "bots") return kind === "bot";
  return kind === "unknown";
}

export function parseGuestKindFilter(value: unknown): GuestKindFilter {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "bots" || raw === "bot") return "bots";
  if (raw === "unknown") return "unknown";
  if (raw === "all") return "all";
  return "humans";
}

/**
 * Server-filtered, server-paginated visitor list for the admin overview.
 * Active-in-range guests are loaded, enriched, filtered, then sliced (page size 25).
 */
export async function listGuestsForAdminPaginated(input: {
  days?: AnalyticsRangeDays;
  kind?: GuestKindFilter;
  source?: GuestTrafficSource | "all";
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<GuestVisitorAdminListResult> {
  const days = input.days ?? 7;
  const kind = input.kind ?? "humans";
  const sourceFilter = input.source ?? "all";
  const q = String(input.q ?? "")
    .trim()
    .toLowerCase();
  const pageSize = Math.max(1, Math.min(100, input.pageSize ?? GUEST_VISITORS_PAGE_SIZE));
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const window = funnelDateWindow(days);

  const [guests, onlineIds, recipes] = await Promise.all([
    getDb().guestVisitor.findMany({
      where: { lastSeenAt: { gte: window.start } },
      orderBy: { lastSeenAt: "desc" },
      include: {
        pageViews: {
          orderBy: { createdAt: "asc" },
          select: { path: true, referer: true, createdAt: true },
        },
      },
    }),
    listOnlineGuestVisitorIds(),
    getAllRecipes(),
  ]);

  const recipeTitles = new Map(recipes.map((recipe) => [recipe.slug, recipe.title]));

  const enriched: GuestVisitorAdminListRow[] = [];
  for (const guest of guests) {
    const client = classifyGuestClient(guest.userAgent || "");
    if (!matchesKindFilter(client.kind, kind)) continue;

    const acquisition = deriveGuestAcquisition(guest.pageViews, {
      utmSource: guest.utmSource,
      utmMedium: guest.utmMedium,
      utmCampaign: guest.utmCampaign,
    });
    if (sourceFilter !== "all" && acquisition.source !== sourceFilter) continue;

    const lastPath = guest.lastPath || "";
    const lastPathTitle = lastPath ? guestPathTitle(lastPath, recipeTitles) : "";
    const landingPath = acquisition.landingPath || lastPath;
    const landingTitle = landingPath ? guestPathTitle(landingPath, recipeTitles) : "";

    if (q) {
      const hay = [
        guest.visitorKey,
        guest.id,
        lastPath,
        lastPathTitle,
        landingPath,
        landingTitle,
        acquisition.sourceLabel,
        client.label,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) continue;
    }

    enriched.push({
      id: guest.id,
      visitorKey: guest.visitorKey,
      firstSeenAt: guest.firstSeenAt.toISOString(),
      lastSeenAt: guest.lastSeenAt.toISOString(),
      lastPath,
      lastPathTitle,
      landingPath,
      landingTitle,
      online: onlineIds.has(guest.id) && client.kind !== "bot",
      kind: client.kind,
      kindLabel:
        client.kind === "bot"
          ? client.label
          : client.kind === "unknown"
            ? "Unknown"
            : "Human",
      source: acquisition.source,
      sourceLabel: acquisition.sourceLabel,
      location: formatCountryCityLocation(guest),
      device: formatGuestOsBrowserLabel(guest.userAgent || ""),
      returning: guest.firstSeenAt.getTime() < window.start.getTime(),
    });
  }

  const total = enriched.length;
  const start = (page - 1) * pageSize;
  const rows = enriched.slice(start, start + pageSize);

  return { rows, total, page, pageSize, rangeDays: days };
}

export { parseAnalyticsRangeDays, funnelDateWindow };
export type { AnalyticsRangeDays };
