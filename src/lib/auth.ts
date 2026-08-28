import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { canAccess, homeForRole, isAccessLevel, type AccessLevel, type AdminArea } from "@/lib/admin-access";
import { clearAllAuthCookies as clearAllAuthCookiesBase } from "@/lib/auth-cookies";
import { getDb } from "@/lib/db";
import { verifyPassword as verifyStoredPassword } from "@/lib/passwords";

export const ADMIN_COOKIE = "mesa_admin_session";
export { isPublicAuthCookieName, expireAuthCookie } from "@/lib/auth-cookies";

export type AdminSession = {
  id: string;
  email: string;
  name: string;
  role: AccessLevel;
  exp: number;
};

function secret() {
  const value = process.env.ADMIN_SECRET?.trim();
  if (!value) {
    throw new Error("ADMIN_SECRET is not set");
  }
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

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

export function createSessionToken(admin: Omit<AdminSession, "exp">) {
  const payload = Buffer.from(
    JSON.stringify({ ...admin, exp: Date.now() + 2 * 24 * 60 * 60 * 1000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): AdminSession | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<AdminSession> & {
      exp?: number;
    };
    if (!data.exp || Date.now() >= data.exp) return null;
    const role: AccessLevel = data.role && isAccessLevel(data.role) ? data.role : "owner";
    return {
      id: data.id || "env",
      email: data.email || "owner",
      name: data.name || "Owner",
      role,
      exp: data.exp,
    };
  } catch {
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

export async function persistAdminLastSeen(admin: Omit<AdminSession, "exp">) {
  if (admin.id === "env") return;
  try {
    await getDb().admin.update({ where: { id: admin.id }, data: { lastSeenAt: new Date() } });
  } catch {
    // Named admin row may have been removed.
  }
}

export async function writeAdminSession(admin: Omit<AdminSession, "exp">) {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, createSessionToken(admin), adminCookieOptions());
  await persistAdminLastSeen(admin);
}

export async function getAdminSession() {
  const jar = await cookies();
  return verifySessionToken(jar.get(ADMIN_COOKIE)?.value);
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

export async function authenticateAdmin(email: string, password: string): Promise<Omit<AdminSession, "exp"> | null> {
  const identifier = email.trim();
  if (!identifier || !password) return null;

  if (verifyEnvAdminPassword(password)) {
    const ownerEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() || identifier.toLowerCase();
    return { id: "env", email: ownerEmail, name: "Owner", role: "owner" };
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
    return { id: admin.id, email: admin.email, name: admin.name, role };
  } catch (error) {
    console.error("Admin database login failed", error);
    return null;
  }
}
