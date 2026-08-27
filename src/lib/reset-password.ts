import { createHash, randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import { sendTransactionalEmail, siteUrl } from "@/lib/email";
import { hashPassword } from "@/lib/passwords";

export type ResetKind = "admin" | "member";
export type ResetRequestStatus = "ok" | "sent" | "owner" | "noemail";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export { siteUrl };

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

export async function requestPasswordReset(
  identifier: string,
  preferred: ResetKind,
): Promise<ResetRequestStatus> {
  const token = randomBytes(32).toString("hex");
  let email = "";
  let kind: ResetKind = preferred;
  const ownerEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const typed = identifier.trim().toLowerCase();

  if (preferred === "admin" && ownerEmail && typed === ownerEmail) {
    return "owner" as const;
  }

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

  if (!email) return "ok" as const;

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
  const sent = await sendResetEmail(email, url);
  return sent ? ("sent" as const) : ("noemail" as const);
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
  return sendTransactionalEmail({
    to,
    subject: "Reset your Mesa Kitchen Studio password",
    html: `<p>Reset your password with this link. It expires in one hour.</p><p><a href="${url}">${url}</a></p>`,
  });
}
