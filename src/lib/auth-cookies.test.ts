import assert from "node:assert/strict";
import { test } from "node:test";
import { clearAllAuthCookies, isPublicAuthCookieName } from "./auth-cookies";

test("isPublicAuthCookieName matches Auth.js and legacy NextAuth cookies", () => {
  assert.equal(isPublicAuthCookieName("authjs.session-token"), true);
  assert.equal(isPublicAuthCookieName("__Secure-authjs.session-token"), true);
  assert.equal(isPublicAuthCookieName("__Secure-authjs.session-token.0"), true);
  assert.equal(isPublicAuthCookieName("next-auth.session-token"), true);
  assert.equal(isPublicAuthCookieName("mesa_admin_session"), false);
  assert.equal(isPublicAuthCookieName("other"), false);
});

test("clearAllAuthCookies expires admin and public auth cookies", () => {
  const expired: string[] = [];
  const writer = {
    delete(name: string) {
      expired.push(`delete:${name}`);
    },
    set(name: string, value: string, options?: { maxAge?: number }) {
      expired.push(`set:${name}:${value}:${options?.maxAge ?? ""}`);
    },
  };

  clearAllAuthCookies(
    writer,
    ["mesa_admin_session", "__Secure-authjs.session-token", "theme"],
    "mesa_admin_session",
    { httpOnly: true, sameSite: "lax", secure: true, path: "/" },
  );

  assert.ok(expired.some((entry) => entry.includes("mesa_admin_session")));
  assert.ok(expired.some((entry) => entry.includes("__Secure-authjs.session-token")));
  assert.equal(
    expired.some((entry) => entry.includes("theme")),
    false,
  );
});
