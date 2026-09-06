import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homeForRole } from "./admin-access";

const root = path.dirname(fileURLToPath(import.meta.url));

test("homeForRole keeps editors on content home after bridge", () => {
  assert.equal(homeForRole("owner"), "/admin");
  assert.equal(homeForRole("editor"), "/admin");
  assert.equal(homeForRole("members"), "/admin/members");
});

test("public staff resolve must not mint AdminSession", () => {
  const bridge = readFileSync(path.join(root, "admin-bridge.ts"), "utf8");
  const sessionRoute = readFileSync(path.join(root, "..", "app", "admin", "session", "route.ts"), "utf8");
  const login = readFileSync(
    path.join(root, "..", "app", "admin", "(auth)", "login", "page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(bridge, /writeAdminSession/);
  assert.match(sessionRoute, /ADMIN_GOOGLE_SESSION_SOURCE/);
  assert.doesNotMatch(login, /redirect\("\/admin\/session"\)/);
});
