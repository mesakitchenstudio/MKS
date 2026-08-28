import assert from "node:assert/strict";
import { test } from "node:test";
import { homeForRole } from "./admin-access";

test("homeForRole keeps editors on content home after bridge", () => {
  assert.equal(homeForRole("owner"), "/admin");
  assert.equal(homeForRole("editor"), "/admin");
  assert.equal(homeForRole("members"), "/admin/members");
});
