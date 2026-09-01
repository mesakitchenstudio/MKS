import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMAIL_CONSENT_LABEL,
  isValidSignupEmail,
  MEMBER_EXISTING_ACCOUNT_API_ERROR,
  MEMBER_PASSWORD_MIN_LENGTH,
  MEMBER_PASSWORD_REQUIREMENT,
  validateSignupFields,
} from "./auth-credentials.ts";

describe("auth credentials", () => {
  it("requires a valid email for signup", () => {
    assert.equal(isValidSignupEmail("you@email.com"), true);
    assert.equal(isValidSignupEmail("not-an-email"), false);
    assert.equal(
      validateSignupFields({
        name: "Jane",
        email: "bad",
        password: "long-enough",
      })?.message,
      "Enter a valid email.",
    );
  });

  it("enforces the real member password minimum", () => {
    assert.equal(MEMBER_PASSWORD_MIN_LENGTH, 6);
    assert.equal(MEMBER_PASSWORD_REQUIREMENT, "At least 6 characters");
    assert.equal(
      validateSignupFields({
        name: "Jane",
        email: "jane@example.com",
        password: "short",
      })?.message,
      "Use at least 6 characters.",
    );
  });

  it("uses explicit email consent wording", () => {
    assert.match(EMAIL_CONSENT_LABEL, /Email me about new recipes/i);
    assert.doesNotMatch(EMAIL_CONSENT_LABEL, /Notify me about new content/i);
  });

  it("uses a stable existing-account API error", () => {
    assert.equal(
      MEMBER_EXISTING_ACCOUNT_API_ERROR,
      "An account with this email already exists.",
    );
  });
});
