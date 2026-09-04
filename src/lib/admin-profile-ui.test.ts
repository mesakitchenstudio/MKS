import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isGooglePhotoUrl } from "@/lib/accounts";
import {
  ADMIN_PROFILE_PHOTO_FILE_HELP,
  ADMIN_PROFILE_SYSTEM_OWNER_PHOTO_COPY,
  adminProfileGooglePhotoHelper,
  adminProfilePhotoUsageCopy,
  buildAdminProfileAccountView,
} from "@/lib/admin-profile-ui";
import { adminWorkspaceWidthForPath } from "@/lib/admin-nav";
import { adminWorkspaceProfile } from "@/lib/admin-ui";
import { displayInitials } from "@/lib/display-initials";

const root = path.dirname(fileURLToPath(import.meta.url));
const profilePageSource = readFileSync(
  path.join(root, "../app/admin/(app)/profile/page.tsx"),
  "utf8",
);
const photoFormSource = readFileSync(
  path.join(root, "../components/admin/AdminPhotoField.tsx"),
  "utf8",
);

describe("admin profile account view", () => {
  it("shows System owner identity once with environment session metadata", () => {
    const view = buildAdminProfileAccountView({
      isSystemOwner: true,
      name: "Owner",
      role: "owner",
      email: "owner@mesakitchenstudio.com",
    });
    assert.equal(view.displayName, "System owner");
    assert.equal(view.roleLabel, "Owner");
    assert.equal(view.email, "owner@mesakitchenstudio.com");
    assert.equal(view.sessionNote, "Environment session");
    assert.notEqual(`${view.displayName} · ${view.roleLabel}`, "Owner · Owner");
  });

  it("shows named Team Access name, role, and email without a fake provider", () => {
    const view = buildAdminProfileAccountView({
      isSystemOwner: false,
      name: "Maya Chen",
      role: "editor",
      email: "maya@example.com",
    });
    assert.equal(view.displayName, "Maya Chen");
    assert.equal(view.roleLabel, "Editor");
    assert.equal(view.email, "maya@example.com");
    assert.equal(view.sessionNote, undefined);
  });
});

describe("admin profile photo copy", () => {
  it("uses review-reply copy for content roles and staff copy for Audience", () => {
    assert.match(adminProfilePhotoUsageCopy("owner"), /public review replies/);
    assert.match(adminProfilePhotoUsageCopy("editor"), /public review replies/);
    assert.match(adminProfilePhotoUsageCopy("members"), /Mesa staff account/);
    assert.doesNotMatch(adminProfilePhotoUsageCopy("members"), /review replies/);
  });

  it("shows Google helper only for recognized Google photo URLs", () => {
    const google =
      "https://lh3.googleusercontent.com/a/ACg8ocExamplePhoto=s96-c";
    assert.equal(isGooglePhotoUrl(google), true);
    assert.match(adminProfileGooglePhotoHelper(google), /Google provided this photo/);
    assert.equal(
      adminProfileGooglePhotoHelper("https://blob.vercel-storage.com/admins/photo.jpg"),
      "",
    );
    assert.equal(adminProfileGooglePhotoHelper(""), "");
  });

  it("documents the actual upload file rules", () => {
    assert.match(ADMIN_PROFILE_PHOTO_FILE_HELP, /JPEG, PNG, WebP or GIF/);
    assert.match(ADMIN_PROFILE_PHOTO_FILE_HELP, /2 MB/);
    assert.match(ADMIN_PROFILE_PHOTO_FILE_HELP, /square works best/);
  });
});

describe("admin profile page contracts", () => {
  it("uses Profile H1, Account section, and no Your account eyebrow", () => {
    assert.match(profilePageSource, />\s*Profile\s*</);
    assert.doesNotMatch(profilePageSource, /Your account/i);
    assert.doesNotMatch(profilePageSource, /Profile photo<\/h1>/);
    assert.match(profilePageSource, /profile-account-heading/);
    assert.match(profilePageSource, /buildAdminProfileAccountView/);
  });

  it("keeps System Owner photo management fully read-only", () => {
    assert.match(profilePageSource, /actor\.id === "env"/);
    assert.match(profilePageSource, /ADMIN_PROFILE_SYSTEM_OWNER_PHOTO_COPY/);
    assert.equal(
      ADMIN_PROFILE_SYSTEM_OWNER_PHOTO_COPY.includes("Team Access"),
      true,
    );
    assert.match(profilePageSource, /href="\/admin\/staff"/);
    assert.match(profilePageSource, /Team access →/);
    // Photo form only for named accounts
    assert.match(profilePageSource, /isSystemOwner \? \(/);
    assert.match(profilePageSource, /AdminProfilePhotoForm/);
    assert.doesNotMatch(profilePageSource, /canPersist/);
    assert.doesNotMatch(profilePageSource, /namedAccountHint/);
  });

  it("widens only the Profile workspace to max-w-2xl", () => {
    assert.equal(adminWorkspaceProfile, "max-w-2xl");
    assert.equal(adminWorkspaceWidthForPath("/admin/profile"), adminWorkspaceProfile);
    assert.notEqual(adminWorkspaceWidthForPath("/admin/staff"), adminWorkspaceProfile);
  });
});

describe("admin profile photo form contracts", () => {
  it("removes the floating card and NO PHOTO placeholder", () => {
    const formStart = photoFormSource.indexOf("export function AdminProfilePhotoForm");
    const form = photoFormSource.slice(formStart);
    assert.doesNotMatch(form, /border border-line bg-paper px-5 py-4/);
    assert.doesNotMatch(form, /No photo/);
    assert.match(form, /displayInitials/);
    assert.match(form, /h-20 w-20/);
    assert.match(form, /Upload photo/);
    assert.match(form, /Change photo/);
    assert.match(form, /Remove photo/);
    assert.match(form, /ADMIN_PROFILE_PHOTO_FILE_HELP/);
    assert.match(form, /adminProfileGooglePhotoHelper/);
  });

  it("keeps initials helper consistent", () => {
    assert.equal(displayInitials("Maya Chen"), "MC");
    assert.equal(displayInitials("Owner"), "O");
  });
});
