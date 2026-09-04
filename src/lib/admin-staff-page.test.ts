import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ACCESS_LEVELS } from "@/lib/admin-access";
import {
  validateAdminDeletion,
  validateAdminRoleChange,
} from "@/lib/admin-staff";

const root = path.dirname(fileURLToPath(import.meta.url));
const staffPageSource = readFileSync(
  path.join(root, "../app/admin/(app)/staff/page.tsx"),
  "utf8",
);
const teamListSource = readFileSync(
  path.join(root, "../components/admin/StaffTeamList.tsx"),
  "utf8",
);
const addPanelSource = readFileSync(
  path.join(root, "../components/admin/StaffAddMemberPanel.tsx"),
  "utf8",
);

describe("admin Team Access page structure", () => {
  it("uses Team access H1 without Studio access eyebrow or global owner-rule lede", () => {
    assert.match(staffPageSource, />\s*Team access\s*</);
    assert.doesNotMatch(staffPageSource, /Studio access/i);
    assert.match(staffPageSource, /Who can use Mesa/);
    assert.doesNotMatch(staffPageSource, /Multiple owners are allowed/);
    assert.doesNotMatch(staffPageSource, /always keeps at least one owner/);
  });

  it("orders sections Team → System owner → Access levels", () => {
    const team = staffPageSource.indexOf("<StaffTeamSection");
    const system = staffPageSource.indexOf("system-owner-heading");
    const levels = staffPageSource.indexOf("access-levels-heading");
    assert.ok(team >= 0 && system > team && levels > system);
  });

  it("keeps System Owner as quiet recovery metadata without badge pile or Edit", () => {
    assert.match(staffPageSource, /Owner · Recovery/);
    assert.match(
      staffPageSource,
      /Recovery sign-in for Mesa\. It is managed outside Team Access/,
    );
    assert.doesNotMatch(staffPageSource, />\s*System\s*</);
    assert.doesNotMatch(staffPageSource, /roleTone/);
    assert.doesNotMatch(staffPageSource, /server configuration/i);
    // System Owner block has no Edit control
    const systemBlock = staffPageSource.slice(
      staffPageSource.indexOf("system-owner-heading"),
      staffPageSource.indexOf("access-levels-heading"),
    );
    assert.doesNotMatch(systemBlock, />\s*Edit\s*</);
  });

  it("shows Access levels as a definition list with updated matrix copy", () => {
    assert.match(staffPageSource, /<dl /);
    assert.doesNotMatch(staffPageSource, /sm:grid-cols-3/);
    assert.deepEqual(
      ACCESS_LEVELS.map((level) => level.help),
      [
        "Full admin access, including Team access.",
        "Publishing, library, reviews, and YouTube.",
        "Members and Visitors only.",
      ],
    );
  });

  it("forces a single You indicator for System Owner sessions", () => {
    assert.match(staffPageSource, /signedInAsSystemOwner \? false/);
  });
});

describe("admin Team Access list chrome", () => {
  it("uses a divided list without per-member cards or role pills", () => {
    assert.match(teamListSource, /divide-y divide-line/);
    assert.doesNotMatch(teamListSource, /<li[^>]*border border-line bg-paper/);
    assert.doesNotMatch(teamListSource, /rounded-full bg-terracotta\/15/);
    assert.doesNotMatch(teamListSource, /roleTone/);
    assert.match(teamListSource, /aria-label=\{open \? `Close editing/);
    assert.match(teamListSource, /Edit \$\{member\.name\}/);
  });

  it("labels Add team member without a trailing plus", () => {
    assert.match(addPanelSource, />\s*Add team member\s*</);
    assert.doesNotMatch(addPanelSource, /Add team member \+/);
  });
});

describe("admin Team Access Add/Edit form chrome", () => {
  const photoFieldSource = readFileSync(
    path.join(root, "../components/admin/AdminPhotoField.tsx"),
    "utf8",
  );
  const compactPhotoStart = photoFieldSource.indexOf("export function AdminPhotoField");
  const compactPhotoEnd = photoFieldSource.indexOf("export function AdminProfilePhotoForm");
  const compactPhoto = photoFieldSource.slice(compactPhotoStart, compactPhotoEnd);
  const profilePhotoForm = photoFieldSource.slice(compactPhotoEnd);

  it("keeps the edit panel inside the same member list item as an expanded row", () => {
    assert.match(teamListSource, /<li id=\{`admin-\$\{member\.id\}`\}/);
    assert.match(teamListSource, /id=\{panelId\}/);
    assert.match(teamListSource, /border-y border-line\/80 bg-cream\/30/);
    assert.doesNotMatch(
      teamListSource.slice(teamListSource.indexOf("{open ?"), teamListSource.indexOf("{confirmRemove")),
      /className="border border-line bg-paper"/,
    );
    assert.match(teamListSource, /Save changes/);
    assert.match(teamListSource, /Full name/);
    assert.match(teamListSource, /New password/);
    assert.match(teamListSource, /Access level/);
    assert.match(teamListSource, /You cannot remove your own account/);
    assert.match(teamListSource, /Mesa must keep at least one owner/);
    assert.match(teamListSource, /deleteAdminAction/);
    assert.match(teamListSource, /Remove \{member\.name\} from Mesa admin\?/);
    assert.match(teamListSource, /aria-expanded=\{open\}/);
    assert.match(teamListSource, /aria-controls=\{panelId\}/);
  });

  it("shows a visible leave-blank helper for New password", () => {
    assert.match(teamListSource, /Leave blank to keep current/);
    assert.match(teamListSource, /aria-describedby=\{passwordHelpId\}/);
    assert.match(teamListSource, /autoComplete="new-password"/);
    assert.match(teamListSource, /minLength=\{MIN_ADMIN_PASSWORD_LENGTH\}/);
    assert.doesNotMatch(teamListSource, /placeholder="Leave blank to keep current"/);
  });

  it("softens the Add panel without a boxed cream header strip", () => {
    const panelStart = addPanelSource.indexOf('id="staff-add-member"');
    const panel = addPanelSource.slice(panelStart, addPanelSource.indexOf("{children}"));
    assert.match(panel, /border-y border-line\/80 bg-cream\/30/);
    assert.doesNotMatch(panel, /className="[^"]*border border-line bg-paper/);
    assert.doesNotMatch(panel, /border-b border-line bg-cream px-5 py-4/);
    assert.match(addPanelSource, />\s*Add team member\s*</);
    assert.match(panel, /Create a Mesa admin account/);
    assert.match(panel, /name="name"/);
    assert.match(panel, /name="email"/);
    assert.match(panel, /name="password"/);
    assert.match(panel, /name="role"/);
    assert.match(panel, />\s*Add admin\s*</);
    assert.match(addPanelSource, /aria-controls="staff-add-member"/);
    assert.match(panel, /saveAdminAction/);
  });

  it("aligns compact AdminPhotoField with Profile photo language", () => {
    assert.match(compactPhoto, /displayInitials\(actorName\)/);
    assert.doesNotMatch(compactPhoto, /No photo/);
    assert.match(compactPhoto, /Upload photo/);
    assert.match(compactPhoto, /Change photo/);
    assert.match(compactPhoto, /Remove photo/);
    assert.doesNotMatch(compactPhoto, /Upload profile photo/);
    assert.doesNotMatch(compactPhoto, /Change profile photo/);
    assert.doesNotMatch(compactPhoto, /recipe comment replies/);
    assert.doesNotMatch(compactPhoto, /Google sign-in sets this by default/);
    assert.match(compactPhoto, /adminProfileGooglePhotoHelper\(savedUrl\)/);
    assert.match(compactPhoto, /ADMIN_PROFILE_PHOTO_FILE_HELP/);
    assert.match(compactPhoto, /h-20 w-20/);
    assert.match(teamListSource, /actorName=\{member\.name\}/);
    // Immediate upload path preserved
    assert.match(compactPhoto, /fetch\("\/api\/admin\/upload"/);
    assert.match(compactPhoto, /setUrl\(data\.url\)/);
  });

  it("does not regress AdminProfilePhotoForm presentation", () => {
    assert.match(profilePhotoForm, /displayInitials/);
    assert.match(profilePhotoForm, /Upload photo/);
    assert.match(profilePhotoForm, /Change photo/);
    assert.match(profilePhotoForm, /adminProfileGooglePhotoHelper\(savedUrl\)/);
    assert.match(profilePhotoForm, /ADMIN_PROFILE_PHOTO_FILE_HELP/);
    assert.match(profilePhotoForm, /saveOwnAdminProfileAction/);
    assert.doesNotMatch(profilePhotoForm, /No photo/);
    assert.doesNotMatch(profilePhotoForm, /recipe comment replies/);
  });
});

describe("admin Team Access owner safety unchanged", () => {
  it("still blocks demoting or deleting the final named owner", () => {
    const demote = validateAdminRoleChange({
      actorId: "a1",
      actorEmail: "a@example.com",
      targetId: "o1",
      targetEmail: "owner@example.com",
      currentRole: "owner",
      nextRole: "editor",
      ownerCount: 1,
    });
    assert.equal(demote.ok, false);
    if (!demote.ok) assert.equal(demote.error, "last-owner");

    assert.deepEqual(
      validateAdminDeletion({
        actorId: "a1",
        targetId: "o1",
        targetRole: "owner",
        ownerCount: 1,
      }),
      { ok: false, error: "last-owner" },
    );
  });

  it("still blocks self owner role changes", () => {
    const result = validateAdminRoleChange({
      actorId: "o1",
      actorEmail: "owner@example.com",
      targetId: "o1",
      targetEmail: "owner@example.com",
      currentRole: "owner",
      nextRole: "editor",
      ownerCount: 2,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "self-role");
  });
});
