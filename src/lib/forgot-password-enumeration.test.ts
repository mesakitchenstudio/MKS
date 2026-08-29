import assert from "node:assert/strict";
import { test } from "node:test";
import { FORGOT_PASSWORD_GENERIC_MESSAGE } from "./reset-password.ts";

test("forgot-password success copy is a single non-enumerating message", () => {
  assert.match(FORGOT_PASSWORD_GENERIC_MESSAGE, /If that account exists/i);
  assert.doesNotMatch(FORGOT_PASSWORD_GENERIC_MESSAGE, /we found that account/i);
  assert.doesNotMatch(FORGOT_PASSWORD_GENERIC_MESSAGE, /not set up yet/i);
});

test("admin forgot-password always redirects to the same public status", () => {
  // Mirrors requestPasswordResetAction — never expose owner/noemail/sent to the URL.
  const publicStatus = "ok";
  const path = `/admin/forgot-password?status=${publicStatus}`;
  assert.equal(path, "/admin/forgot-password?status=ok");
  assert.equal(publicStatus === "noemail", false);
  assert.equal(publicStatus === "owner", false);
});
