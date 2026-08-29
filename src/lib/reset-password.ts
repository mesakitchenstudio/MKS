import { createHash, randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import {
  sendTransactionalEmailDetailed,
  siteUrl,
  type SendTransactionalEmailResult,
} from "@/lib/email";
import { hashPassword } from "@/lib/passwords";

export type ResetKind = "admin" | "member";

/** Public redirect status only — never encode account existence or mail setup. */
export type ResetRequestPublicStatus = "ok";

/** Same browser copy for every completed forgot-password submission. */
export const FORGOT_PASSWORD_GENERIC_MESSAGE =
  "If that account exists, a reset link is on its way. Check your inbox and spam folder.";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function buildPasswordResetUrl(kind: ResetKind, token: string, baseUrl = siteUrl()) {
  const path = kind === "admin" ? "/admin/reset-password" : "/reset-password";
  return `${baseUrl.replace(/\/$/, "")}${path}?token=${encodeURIComponent(token)}`;
}

export function evaluatePasswordResetRow(
  row: { expiresAt: Date | string; kind: string } | null | undefined,
  expectedKind?: ResetKind,
  now = Date.now(),
): "ok" | "missing" | "expired" | "kind_mismatch" {
  if (!row) return "missing";
  if (expectedKind && row.kind !== expectedKind) return "kind_mismatch";
  const expiresAt = row.expiresAt instanceof Date ? row.expiresAt.getTime() : Date.parse(String(row.expiresAt));
  if (!Number.isFinite(expiresAt) || expiresAt < now) return "expired";
  return "ok";
}

export { siteUrl };

export type PasswordResetMailer = (input: {
  to: string;
  subject: string;
  html: string;
}) => Promise<SendTransactionalEmailResult>;

export type RequestPasswordResetDeps = {
  findAdminByIdentifier?: (identifier: string) => Promise<{ email: string } | null>;
  findMemberByIdentifier?: (identifier: string) => Promise<{ email: string } | null>;
  ownerEmail?: string;
  createResetRecord?: (input: {
    email: string;
    kind: ResetKind;
    tokenHash: string;
    expiresAt: Date;
  }) => Promise<void>;
  clearResetRecords?: (email: string) => Promise<void>;
  deleteResetByHash?: (tokenHash: string) => Promise<void>;
  sendEmail?: PasswordResetMailer;
  now?: () => number;
};

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

async function defaultCreateResetRecord(input: {
  email: string;
  kind: ResetKind;
  tokenHash: string;
  expiresAt: Date;
}) {
  const db = getDb();
  await db.passwordReset.create({ data: input });
}

async function defaultClearResetRecords(email: string) {
  await getDb().passwordReset.deleteMany({ where: { email } });
}

async function defaultDeleteResetByHash(tokenHash: string) {
  await getDb().passwordReset.deleteMany({ where: { tokenHash } });
}

async function defaultSendResetEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendTransactionalEmailResult> {
  return sendTransactionalEmailDetailed(input);
}

/**
 * Start a password reset when possible. Always returns the same public status so
 * the browser cannot tell whether the account exists or whether email is configured.
 */
export async function requestPasswordReset(
  identifier: string,
  preferred: ResetKind,
  deps: RequestPasswordResetDeps = {},
): Promise<ResetRequestPublicStatus> {
  const token = randomBytes(32).toString("hex");
  const tokenDigest = hashResetToken(token);
  const now = deps.now?.() ?? Date.now();
  const findAdminByIdentifier = deps.findAdminByIdentifier ?? findAdmin;
  const findMemberByIdentifier = deps.findMemberByIdentifier ?? findMember;
  const clearResetRecords = deps.clearResetRecords ?? defaultClearResetRecords;
  const createResetRecord = deps.createResetRecord ?? defaultCreateResetRecord;
  const deleteResetByHash = deps.deleteResetByHash ?? defaultDeleteResetByHash;
  const sendEmail = deps.sendEmail ?? defaultSendResetEmail;
  const ownerEmail = (deps.ownerEmail ?? process.env.ADMIN_EMAIL)?.trim().toLowerCase() || "";
  const typed = identifier.trim().toLowerCase();

  let email = "";
  let kind: ResetKind = preferred;

  if (preferred === "admin" && ownerEmail && typed === ownerEmail) {
    // Env owner cannot be reset by email — do not reveal that to the client.
    console.info("Password reset skipped for system owner account");
    return "ok";
  }

  if (preferred === "admin") {
    const admin = await findAdminByIdentifier(identifier);
    if (admin) {
      email = admin.email;
      kind = "admin";
    }
  } else {
    const staff = await findAdminByIdentifier(identifier);
    if (staff) {
      email = staff.email;
      kind = "admin";
    } else {
      const member = await findMemberByIdentifier(identifier);
      if (member) {
        email = member.email;
        kind = "member";
      }
    }
  }

  if (!email) {
    // Nonexistent email/username — same public response as a real account.
    // Touch the digest so work is closer to the known-account path.
    void tokenDigest;
    return "ok";
  }

  await clearResetRecords(email);
  const expiresAt = new Date(now + PASSWORD_RESET_TTL_MS);
  await createResetRecord({
    email,
    kind,
    tokenHash: tokenDigest,
    expiresAt,
  });

  const url = buildPasswordResetUrl(kind, token);
  const sent = await sendEmail({
    to: email,
    subject: "Reset your Mesa Kitchen Studio password",
    html: `<p>Reset your password with this link. It expires in one hour.</p><p><a href="${url}">${url}</a></p>`,
  });

  if (!sent.ok) {
    // Do not leave a usable token when the recipient never received the link.
    await deleteResetByHash(tokenDigest);
    console.error("Password reset email was not delivered", {
      kind,
      reason: sent.reason,
      emailDomain: email.includes("@") ? email.split("@")[1] : "unknown",
    });
  }

  return "ok";
}

export async function getPasswordResetByToken(token: string, expectedKind?: ResetKind) {
  if (!token) return null;
  const db = getDb();
  const row = await db.passwordReset.findUnique({ where: { tokenHash: hashResetToken(token) } });
  const status = evaluatePasswordResetRow(row, expectedKind);
  if (status !== "ok" || !row) {
    if (row && status === "expired") {
      await db.passwordReset.delete({ where: { id: row.id } }).catch(() => undefined);
    }
    return null;
  }
  return row;
}

export type ResetPasswordWithTokenDeps = {
  findResetByHash?: (tokenHash: string) => Promise<{
    id: string;
    email: string;
    kind: string;
    expiresAt: Date;
  } | null>;
  deleteResetById?: (id: string) => Promise<void>;
  updateAdminPassword?: (email: string, passwordHash: string) => Promise<boolean>;
  updateMemberPassword?: (email: string, passwordHash: string) => Promise<boolean>;
  now?: () => number;
};

export async function resetPasswordWithToken(
  token: string,
  password: string,
  deps: ResetPasswordWithTokenDeps = {},
) {
  if (!token || password.length < 6) return { ok: false as const, error: "invalid" };
  const now = deps.now?.() ?? Date.now();
  const findResetByHash =
    deps.findResetByHash ??
    (async (tokenHash: string) =>
      getDb().passwordReset.findUnique({ where: { tokenHash } }));
  const deleteResetById =
    deps.deleteResetById ??
    (async (id: string) => {
      await getDb().passwordReset.delete({ where: { id } });
    });
  const updateAdminPassword =
    deps.updateAdminPassword ??
    (async (email: string, passwordHash: string) => {
      const admin = await getDb().admin.findUnique({ where: { email } });
      if (!admin) return false;
      await getDb().admin.update({
        where: { id: admin.id },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
      return true;
    });
  const updateMemberPassword =
    deps.updateMemberPassword ??
    (async (email: string, passwordHash: string) => {
      const user = await getDb().user.findUnique({ where: { email } });
      if (!user) return false;
      await getDb().user.update({ where: { id: user.id }, data: { passwordHash } });
      return true;
    });

  const row = await findResetByHash(hashResetToken(token));
  const status = evaluatePasswordResetRow(row, undefined, now);
  if (status !== "ok" || !row) {
    if (row && status === "expired") {
      await deleteResetById(row.id);
    }
    return { ok: false as const, error: status === "expired" ? "expired" : "invalid" };
  }
  if (row.kind === "admin" && password.length < 10) {
    return { ok: false as const, error: "short" };
  }

  const passwordHash = hashPassword(password);
  const updated =
    row.kind === "admin"
      ? await updateAdminPassword(row.email, passwordHash)
      : await updateMemberPassword(row.email, passwordHash);
  if (!updated) return { ok: false as const, error: "expired" };

  // Single-use: remove the reset row after a successful password change.
  await deleteResetById(row.id);
  return { ok: true as const, kind: row.kind as ResetKind };
}
