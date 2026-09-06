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

/** Mesa brand terracotta from globals.css — inlined for email clients. */
export const PASSWORD_RESET_EMAIL_TERRACOTTA = "#ad4b31";
export const PASSWORD_RESET_EMAIL_INK = "#2a2218";
export const PASSWORD_RESET_EMAIL_MUTED = "#6b5e4e";

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;");
}

function escapeHtmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Transactional password-reset email HTML.
 * Primary CTA is a styled button; the raw URL is a secondary fallback only.
 */
export function buildPasswordResetEmailHtml(resetUrl: string, kind: ResetKind = "admin") {
  const href = escapeHtmlAttribute(resetUrl);
  const visibleUrl = escapeHtmlText(resetUrl);
  const accountLabel =
    kind === "admin"
      ? "your Mesa Kitchen Studio admin account"
      : "your Mesa Kitchen Studio account";

  // Table-based bulletproof button for Outlook + inline styles for Gmail/Apple Mail.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f0e6;color:${PASSWORD_RESET_EMAIL_INK};font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f6f0e6;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:#fffcf7;border:1px solid #d9cbb6;">
          <tr>
            <td style="padding:36px 28px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${PASSWORD_RESET_EMAIL_INK};">
              <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.25;font-weight:400;color:${PASSWORD_RESET_EMAIL_INK};">
                Reset your password
              </h1>
              <p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:${PASSWORD_RESET_EMAIL_INK};">
                We received a request to reset the password for ${accountLabel}.
              </p>
              <p style="margin:0 0 28px;font-size:16px;line-height:1.55;color:${PASSWORD_RESET_EMAIL_INK};">
                Use the button below to choose a new password. This link expires in 1 hour and can only be used once.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px;">
                <tr>
                  <td align="center">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:50px;v-text-anchor:middle;width:280px;" arcsize="50%" stroke="f" fillcolor="${PASSWORD_RESET_EMAIL_TERRACOTTA}">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:Segoe UI,sans-serif;font-size:16px;font-weight:600;">Reset password</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <a href="${href}"
                       style="display:inline-block;width:100%;max-width:360px;box-sizing:border-box;background-color:${PASSWORD_RESET_EMAIL_TERRACOTTA};color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;line-height:22px;text-align:center;text-decoration:none;padding:14px 30px;border-radius:999px;mso-padding-alt:0;min-height:44px;">
                      Reset password
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:${PASSWORD_RESET_EMAIL_MUTED};">
                If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${PASSWORD_RESET_EMAIL_MUTED};">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;color:${PASSWORD_RESET_EMAIL_MUTED};">
                <a href="${href}" style="color:${PASSWORD_RESET_EMAIL_TERRACOTTA};text-decoration:underline;">${visibleUrl}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
  return db.user.findUnique({ where: { email: trimmed.toLowerCase() } });
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
    html: buildPasswordResetEmailHtml(url, kind),
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
      const { revokeAdminAuthSessionsForSubject } = await import("@/lib/admin-auth-sessions");
      await revokeAdminAuthSessionsForSubject(admin.id, "password_reset");
      return true;
    });
  const updateMemberPassword =
    deps.updateMemberPassword ??
    (async (email: string, passwordHash: string) => {
      const user = await getDb().user.findUnique({ where: { email } });
      if (!user) return false;
      await getDb().user.update({
        where: { id: user.id },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
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
