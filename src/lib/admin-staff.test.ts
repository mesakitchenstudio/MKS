import assert from "node:assert/strict";
import { test } from "node:test";
import { canAccess, homeForRole } from "./admin-access";
import {
  emailsConflictCaseInsensitive,
  isAcceptableAdminPassword,
  isCurrentStaffAccount,
  isValidAdminEmail,
  normalizeAdminEmail,
  shouldLockOwnerAccessSelect,
  shouldUpdateAdminPassword,
  validateAdminDeletion,
  validateAdminRoleChange,
} from "./admin-staff";
import { validateAdminImageFile, sniffAdminImageMime, validateAdminImageBytes, isOwnedAdminUploadUrl } from "./admin-upload";
import { formatAdminDateTime } from "./datetime";
import { hashPassword, verifyPassword } from "./passwords";
import { isGooglePhotoUrl } from "./accounts";

test("normalizes and validates admin emails", () => {
  assert.equal(normalizeAdminEmail("  Owner@Studio.COM "), "owner@studio.com");
  assert.equal(isValidAdminEmail("owner@studio.com"), true);
  assert.equal(isValidAdminEmail("not-an-email"), false);
  assert.equal(isValidAdminEmail(""), false);
});

test("duplicate admin emails are detected case-insensitively", () => {
  assert.equal(emailsConflictCaseInsensitive("Owner@Studio.com", "owner@studio.com"), true);
  assert.equal(emailsConflictCaseInsensitive("a@b.com", "c@d.com"), false);
});

test("admin passwords require 10+ characters when set", () => {
  assert.equal(isAcceptableAdminPassword("", { required: true }), false);
  assert.equal(isAcceptableAdminPassword("", { required: false }), true);
  assert.equal(isAcceptableAdminPassword("short", { required: true }), false);
  assert.equal(isAcceptableAdminPassword("long-enough", { required: true }), true);
});

test("password update only when New password is non-empty and long enough", () => {
  assert.equal(shouldUpdateAdminPassword(""), false);
  assert.equal(shouldUpdateAdminPassword("short"), false);
  assert.equal(shouldUpdateAdminPassword("long-enough"), true);
});

test("passwords are hashed with scrypt and never stored plaintext", () => {
  const plain = "studio-secret-password";
  const stored = hashPassword(plain);
  assert.notEqual(stored, plain);
  assert.equal(stored.includes(plain), false);
  assert.match(stored, /^[a-f0-9]+:[a-f0-9]+$/i);
  assert.equal(verifyPassword(plain, stored), true);
  assert.equal(verifyPassword("wrong-password", stored), false);
});

test("signed-in owner cannot demote themselves", () => {
  const result = validateAdminRoleChange({
    actorId: "me",
    actorEmail: "owner@studio.com",
    targetId: "me",
    targetEmail: "owner@studio.com",
    currentRole: "owner",
    nextRole: "editor",
    ownerCount: 2,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "self-role");
});

test("env owner session cannot demote matching email owner row", () => {
  const result = validateAdminRoleChange({
    actorId: "env",
    actorEmail: "owner@studio.com",
    targetId: "named",
    targetEmail: "owner@studio.com",
    currentRole: "owner",
    nextRole: "editor",
    ownerCount: 2,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "self-role");
});

test("signed-in owner access select is locked", () => {
  assert.equal(
    shouldLockOwnerAccessSelect(
      { id: "cmt", email: "mesakitchenstudio@gmail.com", role: "owner" },
      { id: "cmt", email: "mesakitchenstudio@gmail.com", role: "owner" },
    ),
    true,
  );
  assert.equal(
    shouldLockOwnerAccessSelect(
      { id: "env", email: "mesakitchenstudio@gmail.com", role: "owner" },
      { id: "named", email: "mesakitchenstudio@gmail.com", role: "owner" },
      "mesakitchenstudio@gmail.com",
    ),
    true,
  );
  assert.equal(
    shouldLockOwnerAccessSelect(
      { id: "owner", email: "owner@studio.com", role: "owner" },
      { id: "editor", email: "editor@studio.com", role: "editor" },
    ),
    false,
  );
});

test("isCurrentStaffAccount matches id, email, and env owner email", () => {
  assert.equal(
    isCurrentStaffAccount(
      { id: "a1", email: "a@b.com" },
      { id: "a1", email: "a@b.com" },
    ),
    true,
  );
  assert.equal(
    isCurrentStaffAccount(
      { id: "env", email: "x@y.com" },
      { id: "named", email: "owner@studio.com" },
      "owner@studio.com",
    ),
    true,
  );
  assert.equal(
    isCurrentStaffAccount(
      { id: "env", email: "x@y.com" },
      { id: "named", email: "other@studio.com" },
      "owner@studio.com",
    ),
    false,
  );
});

test("final owner cannot be demoted or deleted", () => {
  const demote = validateAdminRoleChange({
    actorId: "me",
    targetId: "them",
    currentRole: "owner",
    nextRole: "members",
    ownerCount: 1,
  });
  assert.equal(demote.ok, false);
  if (!demote.ok) assert.equal(demote.error, "last-owner");

  assert.deepEqual(
    validateAdminDeletion({
      actorId: "me",
      targetId: "them",
      targetRole: "owner",
      ownerCount: 1,
    }),
    { ok: false, error: "last-owner" },
  );
});

test("another owner can be demoted when a spare owner remains", () => {
  const result = validateAdminRoleChange({
    actorId: "me",
    targetId: "them",
    currentRole: "owner",
    nextRole: "editor",
    ownerCount: 2,
  });
  assert.deepEqual(result, { ok: true, role: "editor" });
});

test("cannot delete self", () => {
  assert.deepEqual(
    validateAdminDeletion({
      actorId: "me",
      targetId: "me",
      targetRole: "editor",
      ownerCount: 2,
    }),
    { ok: false, error: "self" },
  );
});

test("Editor route restrictions", () => {
  assert.equal(canAccess("editor", "content"), true);
  assert.equal(canAccess("editor", "members"), false);
  assert.equal(canAccess("editor", "staff"), false);
  assert.equal(homeForRole("editor"), "/admin");
});

test("Members route restrictions", () => {
  assert.equal(canAccess("members", "members"), true);
  assert.equal(canAccess("members", "content"), false);
  assert.equal(canAccess("members", "staff"), false);
  assert.equal(homeForRole("members"), "/admin/members");
});

test("Owner has full admin access including staff", () => {
  assert.equal(canAccess("owner", "staff"), true);
  assert.equal(canAccess("owner", "content"), true);
  assert.equal(canAccess("owner", "members"), true);
});

test("last login uses shared admin datetime formatter", () => {
  assert.equal(formatAdminDateTime(new Date("2026-08-26T22:41:00Z")), "Aug 26, 2026 · 10:41 PM GMT");
});

test("admin image uploads reject bad types and oversized files", () => {
  const oversized = validateAdminImageFile({ type: "image/jpeg", size: 3 * 1024 * 1024 });
  assert.equal(validateAdminImageFile({ type: "image/png", size: 100 }).ok, true);
  assert.equal(validateAdminImageFile({ type: "application/pdf", size: 100 }).ok, false);
  assert.equal(oversized.ok, false);
  if (!oversized.ok) {
    assert.equal(oversized.error, "Choose an image smaller than 2 MB.");
  }
});

test("admin image sniffing accepts real signatures and rejects spoofed files", () => {
  const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0);
  const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
  const gif = Uint8Array.of(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0);
  const webp = Uint8Array.of(
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
  );
  const fake = new TextEncoder().encode("%PDF-1.4 not an image!!");

  assert.equal(sniffAdminImageMime(jpeg), "image/jpeg");
  assert.equal(sniffAdminImageMime(png), "image/png");
  assert.equal(sniffAdminImageMime(gif), "image/gif");
  assert.equal(sniffAdminImageMime(webp), "image/webp");
  assert.equal(sniffAdminImageMime(fake), null);
  assert.equal(validateAdminImageBytes(fake).ok, false);
  assert.equal(isOwnedAdminUploadUrl("/uploads/a.jpg"), true);
  assert.equal(isOwnedAdminUploadUrl("https://lh3.googleusercontent.com/a/x"), false);
});

test("custom admin photos are not treated as Google avatars", () => {
  assert.equal(isGooglePhotoUrl("https://lh3.googleusercontent.com/a/abc"), true);
  assert.equal(isGooglePhotoUrl("/uploads/admin-photo.jpg"), false);
  assert.equal(isGooglePhotoUrl("https://blob.vercel-storage.com/admins/x.png"), false);
});
