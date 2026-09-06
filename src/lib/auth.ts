import { timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { canAccess, homeForRole, isAccessLevel, type AdminArea } from "@/lib/admin-access";
import {
  bindAdminCookieToRegistry,
  createAdminAuthSession,
  revokeAdminAuthSessionByTokenId,
} from "@/lib/admin-auth-sessions";
import { applyPersistedStaffRole, isAdminSessionVersionCurrent } from "@/lib/admin-staff";
import {
  ADMIN_COOKIE,
  createSessionToken,
  verifySessionToken,
  type AdminSession,
} from "@/lib/admin-session-token";
import { clearAllAuthCookies as clearAllAuthCookiesBase } from "@/lib/auth-cookies";
import { getDb } from "@/lib/db";
import { verifyPassword as verifyStoredPassword } from "@/lib/passwords";

export { ADMIN_COOKIE, createSessionToken, verifySessionToken };
export type { AdminSession };
export { isPublicAuthCookieName, expireAuthCookie } from "@/lib/auth-cookies";
export { applyPersistedStaffRole };

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  const size = Math.max(left.length, right.length, 1);
  const paddedLeft = Buffer.alloc(size);
  const paddedRight = Buffer.alloc(size);
  left.copy(paddedLeft);
  right.copy(paddedRight);
  return timingSafeEqual(paddedLeft, paddedRight) && left.length === right.length;
}

export function verifyEnvAdminPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected) return false;
  return safeEqual(password, expected);
}

async function loadPersistedStaff(session: AdminSession) {
  // System Owner stays independent of any Team Access row that might share ADMIN_EMAIL.
  if (session.id === "env") return null;

  const db = getDb();
  const byId = await db.admin.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, name: true, role: true, sessionVersion: true },
  });
  if (byId) return byId;

  const email = session.email.trim().toLowerCase();
  if (!email) return null;
  return db.admin.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, sessionVersion: true },
  });
}

/**
 * Live staff + registry checks. Cookies must map to an active AdminSession row
 * (bootstrapped on first request for legacy cookies without `sid`).
 */
export async function resolveLiveAdminSession(session: AdminSession): Promise<AdminSession | null> {
  try {
    const persisted = await loadPersistedStaff(session);
    const live = applyPersistedStaffRole(session, persisted);
    if (!live) return null;

    if (persisted && !isAdminSessionVersionCurrent(session.sv, persisted.sessionVersion)) {
      return null;
    }

    const requestHeaders = await headers().catch(() => null);
    const bound = await bindAdminCookieToRegistry(session, requestHeaders);
    if (!bound) return null;

    const next: AdminSession = {
      ...live,
      sv: persisted ? persisted.sessionVersion : 0,
      sid: bound.sid,
      exp: bound.expiresAt.getTime(),
    };

    // Best-effort cookie rewrite when bootstrapping sid (Route Handlers / Server Actions only).
    if (!session.sid) {
      try {
        const jar = await cookies();
        jar.set(
          ADMIN_COOKIE,
          createSessionToken({
            id: next.id,
            email: next.email,
            name: next.name,
            role: next.role,
            sv: next.sv,
            sid: next.sid!,
            exp: next.exp,
          }),
          adminCookieOptions(),
        );
      } catch {
        // Server Components cannot set cookies; /api/admin/me rewrites shortly after.
      }
    }

    return next;
  } catch (error) {
    console.error("Could not refresh admin access level", error);
    return null;
  }
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 2,
  };
}

export function clearAllAuthCookies(
  writer: Parameters<typeof clearAllAuthCookiesBase>[0],
  presentCookieNames: string[],
) {
  const options = adminCookieOptions();
  clearAllAuthCookiesBase(writer, presentCookieNames, ADMIN_COOKIE, {
    httpOnly: options.httpOnly,
    sameSite: options.sameSite,
    secure: options.secure,
    path: options.path,
  });
}

export async function persistAdminLastSeen(admin: Omit<AdminSession, "exp" | "sid">) {
  if (admin.id === "env") return;
  try {
    await getDb().admin.update({ where: { id: admin.id }, data: { lastSeenAt: new Date() } });
  } catch {
    // Named admin row may have been removed.
  }
}

/** Mint a new registry row and set the admin cookie (login / bridge). */
export async function writeAdminSession(admin: Omit<AdminSession, "exp" | "sid">) {
  const requestHeaders = await headers().catch(() => null);
  const row = await createAdminAuthSession({
    adminId: admin.id,
    headers: requestHeaders,
  });
  const jar = await cookies();
  jar.set(
    ADMIN_COOKIE,
    createSessionToken({
      ...admin,
      sv: admin.sv ?? 0,
      sid: row.sessionTokenId,
      exp: row.expiresAt.getTime(),
    }),
    adminCookieOptions(),
  );
  await persistAdminLastSeen(admin);
}

/**
 * Rewrite cookie fields while keeping the same registry session id
 * (role / profile sync — must not mint a new device session).
 */
export async function rewriteAdminSessionCookie(admin: AdminSession & { sid: string }) {
  const jar = await cookies();
  jar.set(
    ADMIN_COOKIE,
    createSessionToken({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      sv: admin.sv ?? 0,
      sid: admin.sid,
      exp: admin.exp,
    }),
    adminCookieOptions(),
  );
}

export async function getAdminSession() {
  const jar = await cookies();
  const session = verifySessionToken(jar.get(ADMIN_COOKIE)?.value);
  if (!session) return null;
  return resolveLiveAdminSession(session);
}

export async function getCurrentAdminSessionTokenId() {
  const session = await getAdminSession();
  return session?.sid || null;
}

/** Revoke the current registry row (if any) then clear cookies — used by logout. */
export async function revokeCurrentAdminSession(reason = "sign_out") {
  const jar = await cookies();
  const session = verifySessionToken(jar.get(ADMIN_COOKIE)?.value);
  if (session?.sid) {
    await revokeAdminAuthSessionByTokenId(session.sid, reason);
  }
}

export async function isAdmin() {
  return Boolean(await getAdminSession());
}

export async function requireAccess(area: AdminArea) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  if (!canAccess(admin.role, area)) redirect(homeForRole(admin.role));
  return admin;
}

export async function authenticateAdmin(
  email: string,
  password: string,
): Promise<Omit<AdminSession, "exp" | "sid"> | null> {
  const identifier = email.trim();
  if (!identifier || !password) return null;

  if (verifyEnvAdminPassword(password)) {
    const ownerEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() || identifier.toLowerCase();
    // System Owner is always the env session — never a Team Access row with the same email.
    return { id: "env", email: ownerEmail, name: "Owner", role: "owner", sv: 0 };
  }

  try {
    const db = getDb();
    let admin = await db.admin.findUnique({ where: { email: identifier.toLowerCase() } });
    if (!admin) {
      const admins = await db.admin.findMany();
      admin = admins.find((item: { name: string }) => item.name.toLowerCase() === identifier.toLowerCase()) ?? null;
    }
    if (!admin || !verifyStoredPassword(password, admin.passwordHash)) return null;
    await db.admin.update({ where: { id: admin.id }, data: { lastSeenAt: new Date() } });
    const role = isAccessLevel(admin.role) ? admin.role : "editor";
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role,
      sv: admin.sessionVersion,
    };
  } catch (error) {
    console.error("Admin database login failed", error);
    return null;
  }
}
