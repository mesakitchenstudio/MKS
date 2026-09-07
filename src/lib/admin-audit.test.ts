import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canViewAdminActivity } from "./admin-access.ts";
import {
  humanizeAdminAuditAction,
  summarizeRecipeAuditChanges,
} from "./admin-audit.ts";
import { buildAdminNavSections, flattenAdminNavItemLabels } from "./admin-nav.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

describe("admin audit log", () => {
  it("adds AdminAuditEvent model with SetNull admin relation", () => {
    const schema = readFileSync(path.join(srcRoot, "..", "prisma", "schema.prisma"), "utf8");
    assert.match(schema, /model AdminAuditEvent/);
    assert.match(schema, /onDelete:\s*SetNull/);
    assert.match(schema, /auditEvents\s+AdminAuditEvent\[\]/);
  });

  it("exposes shared recordAdminAuditEvent helper", () => {
    const helper = read("lib/admin-audit.ts");
    assert.match(helper, /export async function recordAdminAuditEvent/);
    assert.match(helper, /export async function recordRecipeSaveAudit/);
    assert.match(helper, /SENSITIVE_META_KEYS/);
  });

  it("summarizes recipe changes into coarse sections", () => {
    const changed = summarizeRecipeAuditChanges({
      before: {
        title: "Old",
        slug: "old",
        excerpt: "a",
        status: "draft",
        featured: false,
        seasonal: false,
        typeId: "t1",
        categoryIds: ["c1"],
        values: JSON.stringify({ ingredients: [{ title: "", items: ["flour"] }] }),
      },
      after: {
        title: "New",
        slug: "old",
        excerpt: "a",
        status: "draft",
        featured: false,
        seasonal: false,
        typeId: "t1",
        categoryIds: ["c1"],
        values: {
          ingredients: [{ title: "", items: ["flour", "water"] }],
          instructions: [{ title: "", steps: ["mix"] }],
        },
      },
    });
    assert.ok(changed.includes("title"));
    assert.ok(changed.includes("ingredients"));
    assert.ok(changed.includes("instructions"));
    assert.equal(changed.includes("slug"), false);
  });

  it("summarizes public update note changes without embedding note text", () => {
    const changed = summarizeRecipeAuditChanges({
      before: {
        title: "A",
        slug: "a",
        excerpt: "e",
        status: "published",
        featured: false,
        seasonal: false,
        typeId: "t1",
        categoryIds: [],
        values: "{}",
        publicUpdateNote: null,
        publicUpdatedAt: null,
      },
      after: {
        title: "A",
        slug: "a",
        excerpt: "e",
        status: "published",
        featured: false,
        seasonal: false,
        typeId: "t1",
        categoryIds: [],
        values: "{}",
        publicUpdateNote: "We retested this recipe and adjusted the baking time.",
        publicUpdatedAt: "2026-09-07T12:00:00.000Z",
      },
    });
    assert.deepEqual(changed, ["publicUpdateNote"]);
    assert.equal(JSON.stringify(changed).includes("retested"), false);
  });

  it("humanizes stable action names", () => {
    assert.equal(humanizeAdminAuditAction("recipe.slug_changed"), "Changed recipe slug");
    assert.equal(humanizeAdminAuditAction("staff.role_changed"), "Changed staff role");
  });

  it("restricts Activity to owners via staff area + helper", () => {
    assert.equal(canViewAdminActivity("owner"), true);
    assert.equal(canViewAdminActivity("editor"), false);
    assert.equal(canViewAdminActivity("members"), false);

    const ownerLabels = flattenAdminNavItemLabels(buildAdminNavSections("owner"));
    assert.ok(ownerLabels.includes("Activity"));
    assert.equal(
      flattenAdminNavItemLabels(buildAdminNavSections("editor")).includes("Activity"),
      false,
    );

    const page = read("app/admin/(app)/activity/page.tsx");
    assert.match(page, /canViewAdminActivity/);
    assert.match(page, /requireAccess\("staff"\)/);
    assert.match(page, /title:\s*"Activity"/);
  });

  it("instruments recipe saves and redirect toggles through shared audit helper", () => {
    const actions = read("app/admin/actions.ts");
    assert.match(actions, /recordRecipeSaveAudit/);
    assert.match(actions, /redirect\.activated/);
    assert.match(actions, /redirect\.deactivated/);
    assert.match(actions, /staff\.role_changed/);
    assert.doesNotMatch(actions, /recipe\.values/);
  });
});
