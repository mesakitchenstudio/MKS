import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemberSessionExpiredError } from "./auth-client.ts";

/** Mirrors favorites/presence API + Auth.js handling for deleted members. */
export function shouldRejectDeletedMemberSession(input: {
  hasAuthCookieEmail: boolean;
  memberRowExists: boolean;
}) {
  if (!input.hasAuthCookieEmail) return { httpStatus: 401 as const, recreateMember: false };
  if (!input.memberRowExists) return { httpStatus: 401 as const, recreateMember: false };
  return { httpStatus: 200 as const, recreateMember: false };
}

describe("deleted member session handling", () => {
  it("rejects leftover cookies when the member row is gone without recreating", () => {
    assert.deepEqual(
      shouldRejectDeletedMemberSession({ hasAuthCookieEmail: true, memberRowExists: false }),
      { httpStatus: 401, recreateMember: false },
    );
  });

  it("allows active members through", () => {
    assert.deepEqual(
      shouldRejectDeletedMemberSession({ hasAuthCookieEmail: true, memberRowExists: true }),
      { httpStatus: 200, recreateMember: false },
    );
  });

  it("uses a client error so favorite UI can roll back and open sign-in", () => {
    const error = new MemberSessionExpiredError();
    assert.equal(error.name, "MemberSessionExpiredError");
    assert.match(error.message, /sign in again/i);
  });
});
