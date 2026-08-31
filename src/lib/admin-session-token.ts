import { createHmac, timingSafeEqual } from "crypto";
import { isAccessLevel, type AccessLevel } from "@/lib/admin-access";

/** HttpOnly cookie set by Studio admin login (`path: "/"`). */
export const ADMIN_COOKIE = "mesa_admin_session";

export type AdminSession = {
  id: string;
  email: string;
  name: string;
  role: AccessLevel;
  /** Matches Admin.sessionVersion; stale cookies are rejected after password change. */
  sv: number;
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

export function createSessionToken(admin: Omit<AdminSession, "exp">) {
  const payload = Buffer.from(
    JSON.stringify({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      sv: admin.sv ?? 0,
      exp: Date.now() + 2 * 24 * 60 * 60 * 1000,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Cryptographic cookie check only (no DB). Safe for proxy / edge-adjacent use. */
export function verifySessionToken(token: string | undefined): AdminSession | null {
  if (!token) return null;
  let expectedSecret: string;
  try {
    expectedSecret = secret();
  } catch {
    return null;
  }
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", expectedSecret).update(payload).digest("hex");
  if (!safeEqual(signature, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<AdminSession> & {
      exp?: number;
      sv?: number;
    };
    if (!data.exp || Date.now() >= data.exp) return null;
    const role: AccessLevel = data.role && isAccessLevel(data.role) ? data.role : "owner";
    return {
      id: data.id || "env",
      email: data.email || "owner",
      name: data.name || "Owner",
      role,
      sv: typeof data.sv === "number" && Number.isFinite(data.sv) ? data.sv : 0,
      exp: data.exp,
    };
  } catch {
    return null;
  }
}

/** Read `mesa_admin_session` from a Cookie header string. */
export function adminSessionTokenFromCookieHeader(cookieHeader: string | null | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    if (name !== ADMIN_COOKIE) continue;
    return decodeURIComponent(trimmed.slice(eq + 1).trim());
  }
  return undefined;
}

export function hasValidAdminSessionCookie(cookieHeader: string | null | undefined): boolean {
  return Boolean(verifySessionToken(adminSessionTokenFromCookieHeader(cookieHeader)));
}
