import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countMembersMatchingDisplayName,
  defaultNotifyForMemberCreation,
  evaluatePasswordRegistration,
  findMemberForCredentialSignIn,
  isMemberSessionVersionCurrent,
} from "./member-session.ts";

describe("member credential sign-in", () => {
  const users = [
    { email: "jane@example.com", name: "Jane Smith", passwordHash: "hash-a" },
    { email: "john@example.com", name: "Jane Smith", passwordHash: "hash-b" },
    { email: "victim@example.com", name: "Victim", passwordHash: null },
  ];

  it("resolves sign-in by unique email only", () => {
    assert.equal(findMemberForCredentialSignIn("jane@example.com", users)?.email, "jane@example.com");
    assert.equal(findMemberForCredentialSignIn("Jane Smith", users), null);
  });

  it("does not treat duplicate display names as a login identifier", () => {
    assert.equal(countMembersMatchingDisplayName("Jane Smith", users), 2);
    assert.equal(findMemberForCredentialSignIn("Jane Smith", users), null);
  });
});

describe("password registration against existing accounts", () => {
  it("blocks attaching a password to a Google-only account", () => {
    assert.deepEqual(evaluatePasswordRegistration({ passwordHash: null }), {
      allowed: false,
      reason: "google_only_account",
    });
  });

  it("blocks duplicate password registration", () => {
    assert.deepEqual(evaluatePasswordRegistration({ passwordHash: "hash" }), {
      allowed: false,
      reason: "password_account_exists",
    });
  });

  it("allows registration when no account exists", () => {
    assert.deepEqual(evaluatePasswordRegistration(null), { allowed: true });
  });
});

describe("member notify defaults", () => {
  it("requires explicit opt-in for email registration", () => {
    assert.equal(defaultNotifyForMemberCreation({ method: "email", explicitNotify: false }), false);
    assert.equal(defaultNotifyForMemberCreation({ method: "email", explicitNotify: true }), true);
  });

  it("defaults Google-created accounts to notify=false", () => {
    assert.equal(defaultNotifyForMemberCreation({ method: "google" }), false);
  });
});

describe("member session version", () => {
  it("invalidates JWTs after password reset increments sessionVersion", () => {
    assert.equal(isMemberSessionVersionCurrent(0, 1), false);
    assert.equal(isMemberSessionVersionCurrent(1, 1), true);
  });

  it("treats missing cookie version as zero", () => {
    assert.equal(isMemberSessionVersionCurrent(undefined, 0), true);
    assert.equal(isMemberSessionVersionCurrent(undefined, 1), false);
  });
});

describe("google-only account takeover scenario", () => {
  it("would have allowed password attachment before the hardening fix", () => {
    const existingGoogleOnly = { passwordHash: null };
    const decision = evaluatePasswordRegistration(existingGoogleOnly);
    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.equal(decision.reason, "google_only_account");
    }
  });
});
