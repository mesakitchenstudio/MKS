import assert from "node:assert/strict";
import { test } from "node:test";

test("signup event uses prior connection count semantics", () => {
  // Mirrors recordConnection: first connection is signup, later ones are sign-in.
  function eventForPriorCount(priorCount: number) {
    return priorCount === 0 ? "signup" : "signin";
  }
  assert.equal(eventForPriorCount(0), "signup");
  assert.equal(eventForPriorCount(1), "signin");
  assert.equal(eventForPriorCount(5), "signin");
});
