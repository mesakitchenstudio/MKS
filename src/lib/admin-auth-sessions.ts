import { createHash, randomBytes } from "crypto";
import {
  detectGuestBrowser,
  detectGuestBrowserVersion,
  detectGuestDevice,
} from "@/lib/guest-client";
import { connectionMeta, formatApproxLocation, type ConnectionMeta } from "@/lib/request-meta";
import { getDb } from "@/lib/db";
import { isAdminSessionVersionCurrent } from "@/lib/admin-staff";
import { ADMIN_SESSION_TTL_MS, type AdminSession as AdminCookieSession } from "@/lib/admin-session-token";

export { ADMIN_SESSION_TTL_MS };

/** Avoid writing lastSeenAt on every admin navigation. */
export const ADMIN_SESSION_LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

/** Revoked/expired rows eligible for cleanup after this window (document for future cron). */
export const ADMIN_SESSION_RETENTION_DAYS = 60;

export type AdminSessionClientLabels = {
  primary: string;
  secondary: string;
  location: string;
};

export function adminSessionSubjectKey(adminId: string) {
  return adminId === "env" ? "env" : adminId;
}

export function mintAdminSessionTokenId() {
  return randomBytes(32).toString("base64url");
}

/** Stable sid for a legacy cookie so RSC + /api/admin/me bootstrap once. */
export function legacyAdminSessionTokenId(session: Pick<AdminCookieSession, "id" | "exp" | "sv">) {
  return createHash("sha256")
    .update(`mesa-admin-legacy|${session.id}|${session.exp}|${session.sv}`)
    .digest("base64url");
}

/**
 * Live authorization for staff-preview / AdminSession binding.
 * Crypto-valid cookies alone are not enough after revoke or staff removal.
 */
export async function isLiveAdminCookieSession(session: AdminCookieSession): Promise<boolean> {
  if (!session.sid) return false;
  try {
    const db = getDb();
    const row = await db.adminSession.findUnique({
      where: { sessionTokenId: session.sid },
    });
    if (!row) return false;
    if (row.subjectKey !== adminSessionSubjectKey(session.id)) return false;
    if (!isAdminAuthSessionActive(row)) return false;

    if (session.id === "env") return true;

    const admin = await db.admin.findUnique({
      where: { id: session.id },
      select: { id: true, sessionVersion: true },
    });
    if (!admin) return false;
    return isAdminSessionVersionCurrent(session.sv, admin.sessionVersion);
  } catch {
    return false;
  }
}

export function parseAdminSessionClient(userAgent: string): {
  browser: string;
  browserVersion: string;
  operatingSystem: string;
  deviceType: string;
} {
  const ua = userAgent.trim();
  const { device, os } = detectGuestDevice(ua);
  const browser = detectGuestBrowser(ua);
  return {
    browser: browser || "",
    browserVersion: detectGuestBrowserVersion(ua),
    operatingSystem: os || "",
    deviceType: device || "",
  };
}

/** Primary “Chrome · Windows”, secondary OS/device line for session rows. */
export function formatAdminSessionClientLabels(input: {
  userAgent?: string;
  browser?: string;
  operatingSystem?: string;
  deviceType?: string;
  city?: string;
  region?: string;
  country?: string;
  ipAddress?: string | null;
}): AdminSessionClientLabels {
  const ua = input.userAgent?.trim() || "";
  const parsed = ua ? parseAdminSessionClient(ua) : null;
  const browser = (input.browser || parsed?.browser || "").trim();
  const device = (input.deviceType || parsed?.deviceType || "").trim();
  const os = (input.operatingSystem || parsed?.operatingSystem || "").trim();
  const platform = device || os;

  let primary = "Unknown device";
  if (browser && platform) primary = `${browser} · ${platform}`;
  else if (browser) primary = browser;
  else if (platform) primary = platform;

  const secondary = os || device || "Unknown";
  const location =
    formatApproxLocation({
      city: input.city,
      region: input.region,
      country: input.country,
      ip: input.ipAddress,
    }) || "Location unavailable";

  return { primary, secondary, location };
}

function metaFromHeaders(headers?: Headers | ConnectionMeta | null): ConnectionMeta {
  if (!headers) return connectionMeta();
  if ("ip" in headers && "userAgent" in headers) return headers as ConnectionMeta;
  return connectionMeta(headers);
}

export type CreateAdminAuthSessionInput = {
  adminId: string;
  headers?: Headers | ConnectionMeta | null;
  expiresAt?: Date;
};

export async function createAdminAuthSession(input: CreateAdminAuthSessionInput) {
  const db = getDb();
  const meta = metaFromHeaders(input.headers);
  const client = parseAdminSessionClient(meta.userAgent);
  const sessionTokenId = mintAdminSessionTokenId();
  const subjectKey = adminSessionSubjectKey(input.adminId);
  const expiresAt = input.expiresAt ?? new Date(Date.now() + ADMIN_SESSION_TTL_MS);
  const now = new Date();

  const row = await db.adminSession.create({
    data: {
      adminId: input.adminId === "env" ? null : input.adminId,
      sessionTokenId,
      subjectKey,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      userAgent: meta.userAgent.slice(0, 512),
      browser: client.browser,
      browserVersion: client.browserVersion,
      operatingSystem: client.operatingSystem,
      deviceType: client.deviceType,
      ipAddress: meta.ip && meta.ip !== "unknown" ? meta.ip.slice(0, 128) : null,
      country: meta.country.slice(0, 64),
      region: meta.region.slice(0, 64),
      city: meta.city.slice(0, 128),
    },
  });

  return row;
}

export function isAdminAuthSessionActive(
  row: { revokedAt: Date | null; expiresAt: Date },
  now = new Date(),
) {
  if (row.revokedAt) return false;
  return row.expiresAt.getTime() > now.getTime();
}

/**
 * Validate cookie sid against the registry. Bootstraps a row for legacy cookies
 * that predate the registry (crypto + staff already verified).
 */
export async function bindAdminCookieToRegistry(
  session: AdminCookieSession,
  headers?: Headers | ConnectionMeta | null,
): Promise<{ sid: string; expiresAt: Date } | null> {
  const db = getDb();
  const subjectKey = adminSessionSubjectKey(session.id);
  const now = new Date();

  if (session.sid) {
    const row = await db.adminSession.findUnique({
      where: { sessionTokenId: session.sid },
    });
    if (!row) return null;
    if (row.subjectKey !== subjectKey) return null;
    if (!isAdminAuthSessionActive(row, now)) return null;

    const elapsed = now.getTime() - row.lastSeenAt.getTime();
    if (elapsed >= ADMIN_SESSION_LAST_SEEN_THROTTLE_MS) {
      await db.adminSession.update({
        where: { id: row.id },
        data: { lastSeenAt: now },
      });
    }
    return { sid: row.sessionTokenId, expiresAt: row.expiresAt };
  }

  // Legacy cookie without sid — seamless, idempotent bootstrap.
  const expiresAt = new Date(session.exp);
  if (expiresAt.getTime() <= now.getTime()) return null;
  const sessionTokenId = legacyAdminSessionTokenId(session);
  const existing = await db.adminSession.findUnique({ where: { sessionTokenId } });
  if (existing) {
    if (existing.subjectKey !== subjectKey) return null;
    if (!isAdminAuthSessionActive(existing, now)) return null;
    const elapsed = now.getTime() - existing.lastSeenAt.getTime();
    if (elapsed >= ADMIN_SESSION_LAST_SEEN_THROTTLE_MS) {
      await db.adminSession.update({
        where: { id: existing.id },
        data: { lastSeenAt: now },
      });
    }
    return { sid: existing.sessionTokenId, expiresAt: existing.expiresAt };
  }

  const meta = metaFromHeaders(headers);
  const client = parseAdminSessionClient(meta.userAgent);
  const created = await db.adminSession.create({
    data: {
      adminId: session.id === "env" ? null : session.id,
      sessionTokenId,
      subjectKey,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      userAgent: meta.userAgent.slice(0, 512),
      browser: client.browser,
      browserVersion: client.browserVersion,
      operatingSystem: client.operatingSystem,
      deviceType: client.deviceType,
      ipAddress: meta.ip && meta.ip !== "unknown" ? meta.ip.slice(0, 128) : null,
      country: meta.country.slice(0, 64),
      region: meta.region.slice(0, 64),
      city: meta.city.slice(0, 128),
    },
  });
  return { sid: created.sessionTokenId, expiresAt: created.expiresAt };
}

export async function revokeAdminAuthSessionByTokenId(
  sessionTokenId: string,
  reason: string,
) {
  const db = getDb();
  const now = new Date();
  const result = await db.adminSession.updateMany({
    where: { sessionTokenId, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason.slice(0, 120) },
  });
  return result.count > 0;
}

export async function revokeAdminAuthSessionsForSubject(
  subjectKey: string,
  reason: string,
  exceptTokenId?: string,
) {
  const db = getDb();
  const now = new Date();
  return db.adminSession.updateMany({
    where: {
      subjectKey,
      revokedAt: null,
      ...(exceptTokenId ? { sessionTokenId: { not: exceptTokenId } } : {}),
    },
    data: { revokedAt: now, revokedReason: reason.slice(0, 120) },
  });
}

export async function listActiveAdminAuthSessionsForSubject(subjectKey: string) {
  const db = getDb();
  const now = new Date();
  return db.adminSession.findMany({
    where: {
      subjectKey,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { lastSeenAt: "desc" },
  });
}

export async function listAllActiveAdminAuthSessions() {
  const db = getDb();
  const now = new Date();
  return db.adminSession.findMany({
    where: {
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: [{ subjectKey: "asc" }, { lastSeenAt: "desc" }],
    include: {
      admin: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  });
}

export function formatAdminSessionActivity(value: Date | string | null | undefined, now = new Date()) {
  if (!value) return "Unknown";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 60_000) return "Active now";
  if (diffMs < 60 * 60_000) {
    const minutes = Math.max(1, Math.round(diffMs / 60_000));
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const sameUtcDay =
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate();

  const time = date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });

  if (sameUtcDay) return `Today at ${time}`;

  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  if (year === now.getUTCFullYear()) {
    return `${month} ${day} at ${time}`;
  }
  return `${month} ${day}, ${year} at ${time}`;
}
