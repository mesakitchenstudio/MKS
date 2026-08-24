import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { canAccess, homeForRole, isAccessLevel, type AccessLevel, type AdminArea } from "@/lib/admin-access";
import { getDb } from "@/lib/db";
import { verifyPassword as verifyStoredPassword } from "@/lib/passwords";

export const ADMIN_COOKIE = "mesa_admin_session";

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

export async function writeAdminSession(admin: Omit<AdminSession, "exp">) {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, createSessionToken(admin), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 2,
  });
  if (admin.id !== "env") {
    try {
      await getDb().admin.update({ where: { id: admin.id }, data: { lastSeenAt: new Date() } });
    } catch {
      // Named admin row may have been removed.
    }
  }
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
  const trimmed = email.trim().toLowerCase();
  if (!trimmed && verifyEnvAdminPassword(password)) {
    return { id: "env", email: "owner", name: "Owner", role: "owner" };
  }
  if (!trimmed) return null;

  try {
    const admin = await getDb().admin.findUnique({ where: { email: trimmed } });
    if (!admin || !verifyStoredPassword(password, admin.passwordHash)) return null;
    await getDb().admin.update({ where: { id: admin.id }, data: { lastSeenAt: new Date() } });
    const role = isAccessLevel(admin.role) ? admin.role : "editor";
    return { id: admin.id, email: admin.email, name: admin.name, role };
  } catch {
    return null;
  }
}
