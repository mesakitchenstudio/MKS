import { createHash, randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";

export type ResetKind = "admin" | "member";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function siteUrl() {
  const value = process.env.AUTH_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (value) {
    return value.startsWith("http") ? value.replace(/\/$/, "") : `https://${value.replace(/\/$/, "")}`;
  }
  return "https://www.mesakitchenstudio.com";
}

async function findAdmin(identifier: string) {
  const trimmed = identifier.trim();
  if (!trimmed) return null;
  const db = getDb();
  const byEmail = await db.admin.findUnique({ where: { email: trimmed.toLowerCase() } });
  if (byEmail) return byEmail;
  const admins = await db.admin.findMany();
  return admins.find((admin) => admin.name.toLowerCase() === trimmed.toLowerCase()) ?? null;
}

async function findMember(identifier: string) {
  const trimmed = identifier.trim();
  if (!trimmed) return null;
  const db = getDb();
  const byEmail = await db.user.findUnique({ where: { email: trimmed.toLowerCase() } });
  if (byEmail) return byEmail;
  const users = await db.user.findMany();
  return users.find((user) => user.name.toLowerCase() === trimmed.toLowerCase()) ?? null;
}

export async function requestPasswordReset(identifier: string, preferred: ResetKind) {
  const token = randomBytes(32).toString("hex");
  let email = "";
  let kind: ResetKind = preferred;

  if (preferred === "admin") {
    const admin = await findAdmin(identifier);
    if (admin) {
      email = admin.email;
      kind = "admin";
    }
  } else {
    const staff = await findAdmin(identifier);
    if (staff) {
      email = staff.email;
      kind = "admin";
    } else {
      const member = await findMember(identifier);
      if (member) {
        email = member.email;
        kind = "member";
      }
    }
  }

  if (!email) return true;

  const db = getDb();
  await db.passwordReset.deleteMany({ where: { email } });
  await db.passwordReset.create({
    data: {
      email,
      kind,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const path = kind === "admin" ? "/admin/reset-password" : "/reset-password";
  const url = `${siteUrl()}${path}?token=${token}`;
  await sendResetEmail(email, url);
  return true;
}

export async function resetPasswordWithToken(token: string, password: string) {
  if (!token || password.length < 6) return { ok: false as const, error: "invalid" };
  const db = getDb();
  const row = await db.passwordReset.findUnique({ where: { tokenHash: tokenHash(token) } });
  if (!row || row.expiresAt.getTime() < Date.now()) {
    if (row) await db.passwordReset.delete({ where: { id: row.id } });
    return { ok: false as const, error: "expired" };
  }
  if (row.kind === "admin" && password.length < 10) {
    return { ok: false as const, error: "short" };
  }

  const passwordHash = hashPassword(password);
  if (row.kind === "admin") {
    const admin = await db.admin.findUnique({ where: { email: row.email } });
    if (!admin) return { ok: false as const, error: "expired" };
    await db.admin.update({ where: { id: admin.id }, data: { passwordHash } });
  } else {
    const user = await db.user.findUnique({ where: { email: row.email } });
    if (!user) return { ok: false as const, error: "expired" };
    await db.user.update({ where: { id: user.id }, data: { passwordHash } });
  }
  await db.passwordReset.delete({ where: { id: row.id } });
  return { ok: true as const, kind: row.kind as ResetKind };
}

async function sendResetEmail(to: string, url: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "Mesa Kitchen Studio <hello@mesakitchenstudio.com>";
  if (!key) {
    console.info("Password reset link (email not configured):", to, url);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Reset your Mesa Kitchen Studio password",
      html: `<p>Reset your password with this link. It expires in one hour.</p><p><a href="${url}">${url}</a></p>`,
    }),
  });
  if (!response.ok) {
    console.error("Could not send reset email", await response.text());
  }
}
