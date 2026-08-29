import assert from "node:assert/strict";
import { test } from "node:test";
import { isAdminAuthSurfacePath } from "./admin-auth-surface.ts";

test("password recovery and login always opt out of the admin shell", () => {
  assert.equal(isAdminAuthSurfacePath("/admin/login"), true);
  assert.equal(isAdminAuthSurfacePath("/admin/forgot-password"), true);
  assert.equal(isAdminAuthSurfacePath("/admin/forgot-password?status=ok"), true);
  assert.equal(isAdminAuthSurfacePath("/admin/reset-password"), true);
  assert.equal(isAdminAuthSurfacePath("/admin/reset-password?token=abc"), true);
});

test("authenticated admin workspace routes stay on the shell path", () => {
  assert.equal(isAdminAuthSurfacePath("/admin"), false);
  assert.equal(isAdminAuthSurfacePath("/admin/recipes"), false);
  assert.equal(isAdminAuthSurfacePath("/admin/members"), false);
  assert.equal(isAdminAuthSurfacePath("/admin/staff"), false);
  assert.equal(isAdminAuthSurfacePath("/admin/profile"), false);
});
