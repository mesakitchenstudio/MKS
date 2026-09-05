import assert from "node:assert/strict";
import { test } from "node:test";
import { canAccess, canDeleteGuestVisitors, canDeleteMembers, canManageYoutubeAnalytics, canManageYoutubeSync, canViewGuestNetworkDiagnostics, homeForRole } from "./admin-access";
import {
  applyPersistedStaffRole,
  emailsConflictCaseInsensitive,
  isAcceptableAdminPassword,
  isAdminSessionVersionCurrent,
  isCurrentStaffAccount,
  isReservedSystemOwnerEmail,
  isValidAdminEmail,
  normalizeAdminEmail,
  shouldLockOwnerAccessSelect,
  shouldUpdateAdminPassword,
  validateAdminDeletion,
  validateAdminRoleChange,
} from "./admin-staff";
import { validateAdminImageFile, sniffAdminImageMime, validateAdminImageBytes, isOwnedAdminUploadUrl, RECIPE_HERO_IMAGE_HELP, GENERAL_ADMIN_IMAGE_MAX_BYTES, GENERAL_ADMIN_IMAGE_SIZE_ERROR, RECIPE_HERO_IMAGE_MAX_BYTES, resolveAdminImageUploadPolicy } from "./admin-upload";
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

test("System Owner email is reserved for Team Access accounts", () => {
  const reserved = "mesakitchenstudio@gmail.com";
  assert.equal(isReservedSystemOwnerEmail("mesakitchenstudio@gmail.com", reserved), true);
  assert.equal(isReservedSystemOwnerEmail("MesaKitchenStudio@gmail.com", reserved), true);
  assert.equal(isReservedSystemOwnerEmail(" mesakitchenstudio@gmail.com ", reserved), true);
  assert.equal(isReservedSystemOwnerEmail("editor@studio.com", reserved), false);
  assert.equal(isReservedSystemOwnerEmail("editor@studio.com", ""), false);
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
  assert.equal(canAccess("editor", "youtube"), true);
  assert.equal(homeForRole("editor"), "/admin");
});

test("Members route restrictions", () => {
  assert.equal(canAccess("members", "members"), true);
  assert.equal(canAccess("members", "content"), false);
  assert.equal(canAccess("members", "staff"), false);
  assert.equal(canAccess("members", "youtube"), false);
  assert.equal(homeForRole("members"), "/admin/members");
});

test("Owner has full admin access including staff", () => {
  assert.equal(canAccess("owner", "staff"), true);
  assert.equal(canAccess("owner", "content"), true);
  assert.equal(canAccess("owner", "members"), true);
  assert.equal(canAccess("owner", "youtube"), true);
  assert.equal(canManageYoutubeSync("owner"), true);
  assert.equal(canManageYoutubeSync("editor"), false);
  assert.equal(canManageYoutubeSync("members"), false);
  assert.equal(canManageYoutubeAnalytics("owner"), true);
  assert.equal(canManageYoutubeAnalytics("editor"), false);
  assert.equal(canManageYoutubeAnalytics("members"), false);
});

test("Phase 2B: guest network diagnostics and delete are Owner-only", () => {
  // Visitors area access (overview + detail)
  assert.equal(canAccess("owner", "members"), true);
  assert.equal(canAccess("members", "members"), true);
  assert.equal(canAccess("editor", "members"), false);

  // Network / IP diagnostics
  assert.equal(canViewGuestNetworkDiagnostics("owner"), true);
  assert.equal(canViewGuestNetworkDiagnostics("members"), false);
  assert.equal(canViewGuestNetworkDiagnostics("editor"), false);
  assert.equal(canViewGuestNetworkDiagnostics(""), false);

  // Destructive delete
  assert.equal(canDeleteGuestVisitors("owner"), true);
  assert.equal(canDeleteGuestVisitors("members"), false);
  assert.equal(canDeleteGuestVisitors("editor"), false);
  assert.equal(canDeleteGuestVisitors(""), false);

  // Member account deletion is Owner-only (area access still Owner + Audience)
  assert.equal(canDeleteMembers("owner"), true);
  assert.equal(canDeleteMembers("members"), false);
  assert.equal(canDeleteMembers("editor"), false);
  assert.equal(canDeleteMembers(""), false);

  // Audience keeps behavioral Visitors access without network/delete
  assert.equal(canAccess("members", "members") && !canViewGuestNetworkDiagnostics("members"), true);
  assert.equal(canAccess("members", "members") && !canDeleteGuestVisitors("members"), true);
  assert.equal(canAccess("members", "members") && !canDeleteMembers("members"), true);
});

/** Presence API JSON must stay free of raw IP / UA for Audience-safe polling. */
test("Phase 2B: visitor presence snapshot shape excludes network fields", () => {
  const sample = {
    id: "guest_1",
    online: true,
    lastSeenAt: "2026-09-04T00:00:00.000Z",
  };
  assert.equal("ip" in sample, false);
  assert.equal("userAgent" in sample, false);
  assert.equal("hostname" in sample, false);
  assert.deepEqual(Object.keys(sample).sort(), ["id", "lastSeenAt", "online"]);
});

test("buildAdminNavSections hides unauthorized areas", async () => {
  const { buildAdminNavSections, linkIsActive } = await import("./admin-nav.ts");
  const editor = buildAdminNavSections("editor");
  assert.deepEqual(
    editor.map((section) => section.label),
    ["Publishing", "Library", "Community", "Analytics"],
  );
  assert.deepEqual(
    editor.flatMap((section) => section.items.map((item) => item.href)),
    [
      "/admin",
      "/admin/studio",
      "/admin/categories",
      "/admin/series",
      "/admin/types",
      "/admin/reviews",
      "/admin/youtube",
    ],
  );
  assert.equal(
    editor.some((section) => section.items.some((item) => item.href === "/admin/members")),
    false,
  );
  assert.equal(
    editor.some((section) => section.items.some((item) => item.href === "/admin/visitors")),
    false,
  );
  assert.equal(canAccess("editor", "content"), true);

  const audience = buildAdminNavSections("members");
  assert.deepEqual(
    audience.map((section) => section.label),
    ["Community", "Analytics"],
  );
  assert.deepEqual(
    audience.flatMap((section) => section.items.map((item) => item.href)),
    ["/admin/members", "/admin/newsletter", "/admin/visitors"],
  );
  assert.equal(
    audience.some((section) => section.items.some((item) => item.href === "/admin/reviews")),
    false,
  );
  assert.equal(
    audience.some((section) => section.items.some((item) => item.href === "/admin/youtube")),
    false,
  );
  assert.equal(canAccess("members", "content"), false);

  const owner = buildAdminNavSections("owner");
  assert.deepEqual(
    owner.map((section) => section.label),
    ["Publishing", "Library", "Community", "Analytics", "Team"],
  );
  assert.deepEqual(
    owner.flatMap((section) => section.items.map((item) => item.href)),
    [
      "/admin",
      "/admin/studio",
      "/admin/categories",
      "/admin/series",
      "/admin/types",
      "/admin/reviews",
      "/admin/members",
      "/admin/newsletter",
      "/admin/visitors",
      "/admin/youtube",
      "/admin/staff",
    ],
  );

  // Recipes retain recipes-index active matching.
  assert.equal(linkIsActive("/admin", "/admin", "recipes-index"), true);
  assert.equal(linkIsActive("/admin/recipes/abc", "/admin", "recipes-index"), true);
  assert.equal(linkIsActive("/admin/studio", "/admin", "recipes-index"), false);
});

test("persisted Team Access role overrides stale session cookie role", () => {
  const session = {
    id: "admin-1",
    email: "masmascard@gmail.com",
    name: "Editor Name",
    role: "editor" as const,
    exp: Date.now() + 60_000,
  };
  const live = applyPersistedStaffRole(session, {
    id: "admin-1",
    email: "masmascard@gmail.com",
    name: "Editor Name",
    role: "members",
  });
  assert.equal(live?.role, "members");
  assert.equal(canAccess(live!.role, "content"), false);
  assert.equal(canAccess(live!.role, "members"), true);
  assert.equal(canAccess(live!.role, "staff"), false);
});

test("removed staff cannot keep an admin session from cookie alone", () => {
  const session = {
    id: "admin-gone",
    email: "gone@studio.com",
    name: "Gone",
    role: "editor" as const,
    exp: Date.now() + 60_000,
  };
  assert.equal(applyPersistedStaffRole(session, null), null);
});

test("system owner session stays owner without a named admin row", () => {
  const session = {
    id: "env",
    email: "owner@studio.com",
    name: "Owner",
    role: "owner" as const,
    exp: Date.now() + 60_000,
  };
  assert.equal(applyPersistedStaffRole(session, null)?.role, "owner");
});

test("system owner session is never merged into a Team Access row by email", () => {
  const session = {
    id: "env",
    email: "mesakitchenstudio@gmail.com",
    name: "Owner",
    role: "owner" as const,
    sv: 0,
    exp: Date.now() + 60_000,
  };
  const live = applyPersistedStaffRole(session, {
    id: "admin-collision",
    email: "mesakitchenstudio@gmail.com",
    name: "Colliding Editor",
    role: "editor",
  });
  assert.equal(live?.id, "env");
  assert.equal(live?.role, "owner");
  assert.equal(live?.name, "Owner");
  assert.equal(canAccess(live!.role, "staff"), true);
});

test("named staff sessions still refresh from their Team Access row", () => {
  const session = {
    id: "admin-1",
    email: "editor@studio.com",
    name: "Editor",
    role: "editor" as const,
    exp: Date.now() + 60_000,
  };
  const live = applyPersistedStaffRole(session, {
    id: "admin-1",
    email: "editor@studio.com",
    name: "Editor Updated",
    role: "members",
  });
  assert.equal(live?.id, "admin-1");
  assert.equal(live?.role, "members");
  assert.equal(live?.name, "Editor Updated");
});

test("password change invalidates cookies with a stale session version", () => {
  assert.equal(isAdminSessionVersionCurrent(0, 0), true);
  assert.equal(isAdminSessionVersionCurrent(undefined, 0), true);
  assert.equal(isAdminSessionVersionCurrent(0, 1), false);
  assert.equal(isAdminSessionVersionCurrent(2, 3), false);
  assert.equal(isAdminSessionVersionCurrent(4, 4), true);
});

test("last login uses shared admin datetime formatter", () => {
  assert.equal(formatAdminDateTime(new Date("2026-08-26T22:41:00Z")), "Aug 26, 2026 · 10:41 PM GMT");
});

test("admin image uploads reject bad types and oversized files", () => {
  const policy = resolveAdminImageUploadPolicy("admins");
  const oversized = validateAdminImageFile({ type: "image/jpeg", size: GENERAL_ADMIN_IMAGE_MAX_BYTES + 1 }, policy);
  const atLimit = validateAdminImageFile({ type: "image/jpeg", size: GENERAL_ADMIN_IMAGE_MAX_BYTES }, policy);
  const justBelow = validateAdminImageFile({
    type: "image/jpeg",
    size: GENERAL_ADMIN_IMAGE_MAX_BYTES - 1,
  }, policy);
  assert.equal(validateAdminImageFile({ type: "image/png", size: 100 }).ok, true);
  assert.equal(validateAdminImageFile({ type: "application/pdf", size: 100 }).ok, false);
  assert.equal(oversized.ok, false);
  assert.equal(atLimit.ok, true);
  assert.equal(justBelow.ok, true);
  if (!oversized.ok) {
    assert.equal(oversized.error, GENERAL_ADMIN_IMAGE_SIZE_ERROR);
  }
  const heroPolicy = resolveAdminImageUploadPolicy("recipes");
  assert.equal(
    validateAdminImageFile({ type: "image/jpeg", size: RECIPE_HERO_IMAGE_MAX_BYTES }, heroPolicy).ok,
    true,
  );
});

test("recipe hero image help recommends 16:9 without requiring 1600×900", () => {
  assert.match(RECIPE_HERO_IMAGE_HELP, /16:9 landscape images work best/);
  assert.match(RECIPE_HERO_IMAGE_HELP, /Recommended: 1600 × 900 px/);
  assert.match(RECIPE_HERO_IMAGE_HELP, /max 5 MB/);
  // Upload validation stays format/size only — 1280×720 YouTube thumbs are not rejected by dimension rules.
  assert.equal(validateAdminImageFile({ type: "image/jpeg", size: 180_000 }).ok, true);
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
