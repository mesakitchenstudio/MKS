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
