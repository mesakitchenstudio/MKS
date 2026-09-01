import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPasswordResetEmailHtml,
  buildPasswordResetUrl,
  evaluatePasswordResetRow,
  FORGOT_PASSWORD_GENERIC_MESSAGE,
  hashResetToken,
  PASSWORD_RESET_EMAIL_TERRACOTTA,
  requestPasswordReset,
  resetPasswordWithToken,
} from "./reset-password.ts";
import { isTransactionalEmailConfigured, transactionalEmailFromAddress } from "./email.ts";

describe("password reset email delivery", () => {
  it("builds production reset URLs without embedding passwords", () => {
    const url = buildPasswordResetUrl("admin", "abc123token", "https://www.mesakitchenstudio.com");
    assert.equal(url, "https://www.mesakitchenstudio.com/admin/reset-password?token=abc123token");
    assert.doesNotMatch(url, /password=/i);
  });

  it("renders a terracotta Reset password button as the primary CTA", () => {
    const url = "https://www.mesakitchenstudio.com/admin/reset-password?token=abc123token";
    const html = buildPasswordResetEmailHtml(url, "admin");
    assert.match(html, /Reset your password/);
    assert.match(html, /admin account/);
    assert.match(html, /expires in 1 hour/i);
    assert.match(html, new RegExp(`href="${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(html, />Reset password</);
    assert.match(html, new RegExp(`background-color:${PASSWORD_RESET_EMAIL_TERRACOTTA}`));
    assert.match(html, /border-radius:999px/);
    assert.match(html, /If the button doesn't work/);
    assert.match(html, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    // Button label must not include the token.
    assert.doesNotMatch(html, />Reset password[^<]*abc123token/i);
  });

  it("hashes reset tokens so raw tokens are not stored", () => {
    const token = "a".repeat(64);
    const digest = hashResetToken(token);
    assert.notEqual(digest, token);
    assert.equal(digest.length, 64);
    assert.equal(hashResetToken(token), digest);
  });

  it("rejects missing, expired, and kind-mismatched rows", () => {
    assert.equal(evaluatePasswordResetRow(null), "missing");
    assert.equal(
      evaluatePasswordResetRow({ expiresAt: new Date(Date.now() - 1000), kind: "admin" }),
      "expired",
    );
    assert.equal(
      evaluatePasswordResetRow(
        { expiresAt: new Date(Date.now() + 60_000), kind: "member" },
        "admin",
      ),
      "kind_mismatch",
    );
    assert.equal(
      evaluatePasswordResetRow({ expiresAt: new Date(Date.now() + 60_000), kind: "admin" }, "admin"),
      "ok",
    );
  });

  it("invokes the mailer for a known Team Access email and keeps the public status generic", async () => {
    const sent: Array<{ to: string; subject: string; html: string }> = [];
    const created: Array<{ email: string; tokenHash: string; kind: string }> = [];
    const status = await requestPasswordReset("chef@studio.com", "admin", {
      findAdminByIdentifier: async () => ({ email: "chef@studio.com" }),
      createResetRecord: async (row) => {
        created.push(row);
      },
      clearResetRecords: async () => undefined,
      deleteResetByHash: async () => undefined,
      sendEmail: async (input) => {
        sent.push(input);
        return { ok: true };
      },
    });

    assert.equal(status, "ok");
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.to, "chef@studio.com");
    assert.match(sent[0]?.html || "", /\/admin\/reset-password\?token=/);
    assert.match(sent[0]?.html || "", />Reset password</);
    assert.match(sent[0]?.html || "", new RegExp(`background-color:${PASSWORD_RESET_EMAIL_TERRACOTTA}`));
    assert.doesNotMatch(sent[0]?.html || "", />\s*Reset password[^<]*token=/i);
    assert.doesNotMatch(sent[0]?.html || "", /password=/i);
    assert.equal(created.length, 1);
    assert.equal(created[0]?.email, "chef@studio.com");
    assert.equal(created[0]?.kind, "admin");
    assert.notEqual(created[0]?.tokenHash, "");
    assert.match(FORGOT_PASSWORD_GENERIC_MESSAGE, /If that account exists/);
  });

  it("does not send email for an unknown address and still returns ok", async () => {
    const sent: unknown[] = [];
    const created: unknown[] = [];
    const status = await requestPasswordReset("nobody@example.com", "admin", {
      findAdminByIdentifier: async () => null,
      createResetRecord: async (row) => {
        created.push(row);
      },
      sendEmail: async (input) => {
        sent.push(input);
        return { ok: true };
      },
    });

    assert.equal(status, "ok");
    assert.equal(sent.length, 0);
    assert.equal(created.length, 0);
  });

  it("does not send email for an unknown username and still returns ok", async () => {
    const sent: unknown[] = [];
    const status = await requestPasswordReset("not-a-real-username", "admin", {
      findAdminByIdentifier: async () => null,
      sendEmail: async (input) => {
        sent.push(input);
        return { ok: true };
      },
    });
    assert.equal(status, "ok");
    assert.equal(sent.length, 0);
  });

  it("removes the stored reset token when email delivery fails", async () => {
    const deleted: string[] = [];
    const created: string[] = [];
    const status = await requestPasswordReset("chef@studio.com", "admin", {
      findAdminByIdentifier: async () => ({ email: "chef@studio.com" }),
      createResetRecord: async (row) => {
        created.push(row.tokenHash);
      },
      clearResetRecords: async () => undefined,
      deleteResetByHash: async (tokenHash) => {
        deleted.push(tokenHash);
      },
      sendEmail: async () => ({ ok: false, reason: "not_configured" }),
    });

    assert.equal(status, "ok");
    assert.equal(created.length, 1);
    assert.deepEqual(deleted, created);
  });
});

describe("password reset token consumption", () => {
  it("rejects invalid/random tokens", async () => {
    const result = await resetPasswordWithToken("totally-random-token", "long-enough-password", {
      findResetByHash: async () => null,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "invalid");
  });

  it("rejects expired tokens and deletes them", async () => {
    const deleted: string[] = [];
    const result = await resetPasswordWithToken("expired-token-value", "long-enough-password", {
      findResetByHash: async () => ({
        id: "row-1",
        email: "chef@studio.com",
        kind: "admin",
        expiresAt: new Date(Date.now() - 60_000),
      }),
      deleteResetById: async (id) => {
        deleted.push(id);
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "expired");
    assert.deepEqual(deleted, ["row-1"]);
  });

  it("rejects an already-used token (row already gone)", async () => {
    const result = await resetPasswordWithToken("used-token-value", "long-enough-password", {
      findResetByHash: async () => null,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "invalid");
  });

  it("accepts a valid token, updates the password, and invalidates the reset row", async () => {
    const deleted: string[] = [];
    const updates: Array<{ email: string; passwordHash: string; sessionVersionIncrement?: boolean }> = [];
    const token = "valid-reset-token-hex";
    const result = await resetPasswordWithToken(token, "brand-new-password", {
      findResetByHash: async (tokenHash) => {
        assert.equal(tokenHash, hashResetToken(token));
        return {
          id: "row-ok",
          email: "chef@studio.com",
          kind: "admin",
          expiresAt: new Date(Date.now() + 60_000),
        };
      },
      updateAdminPassword: async (email, passwordHash) => {
        updates.push({ email, passwordHash });
        return true;
      },
      deleteResetById: async (id) => {
        deleted.push(id);
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.kind, "admin");
    assert.equal(updates.length, 1);
    assert.equal(updates[0]?.email, "chef@studio.com");
    assert.ok(updates[0]?.passwordHash);
    assert.deepEqual(deleted, ["row-ok"]);
  });

  it("increments member sessionVersion when a member password reset succeeds", async () => {
    const memberUpdates: Array<{ email: string; sessionVersionIncrement: boolean }> = [];
    const result = await resetPasswordWithToken("member-reset-token", "new-member-password", {
      findResetByHash: async () => ({
        id: "member-row",
        email: "member@example.com",
        kind: "member",
        expiresAt: new Date(Date.now() + 60_000),
      }),
      updateMemberPassword: async (email) => {
        memberUpdates.push({ email, sessionVersionIncrement: true });
        return true;
      },
      deleteResetById: async () => undefined,
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.kind, "member");
    assert.deepEqual(memberUpdates, [
      { email: "member@example.com", sessionVersionIncrement: true },
    ]);
  });

  it("treats a valid unexpired token as openable by evaluatePasswordResetRow", () => {
    // Mirrors getPasswordResetByToken /admin/reset-password page gate.
    assert.equal(
      evaluatePasswordResetRow(
        { expiresAt: new Date(Date.now() + 30_000), kind: "admin" },
        "admin",
      ),
      "ok",
    );
  });
});

describe("email configuration helpers", () => {
  it("reports configuration from RESEND_API_KEY without requiring a live provider", () => {
    const previous = process.env.RESEND_API_KEY;
    try {
      delete process.env.RESEND_API_KEY;
      assert.equal(isTransactionalEmailConfigured(), false);
      process.env.RESEND_API_KEY = "re_test_key";
      assert.equal(isTransactionalEmailConfigured(), true);
      assert.match(transactionalEmailFromAddress(), /mesa|@/i);
    } finally {
      if (previous === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previous;
    }
  });
});
