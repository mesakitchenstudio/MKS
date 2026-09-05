import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canDeleteGuestVisitors } from "./admin-access.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const tableSource = readFileSync(
  path.join(root, "../components/admin/VisitorsTable.tsx"),
  "utf8",
);
const recentSource = readFileSync(
  path.join(root, "../components/admin/VisitorsRecentSection.tsx"),
  "utf8",
);
const overviewSource = readFileSync(
  path.join(root, "../components/admin/VisitorsOverview.tsx"),
  "utf8",
);
const visitorsPageSource = readFileSync(
  path.join(root, "../app/admin/(app)/visitors/page.tsx"),
  "utf8",
);
const actionsSource = readFileSync(
  path.join(root, "../app/admin/actions.ts"),
  "utf8",
);
const analyticsSource = readFileSync(
  path.join(root, "./guest-analytics.ts"),
  "utf8",
);
const schema = readFileSync(
  path.join(root, "../../prisma/schema.prisma"),
  "utf8",
);

describe("Visitors Owner-only bulk delete UI", () => {
  it("passes canDeleteGuestVisitors from the visitors page into the overview", () => {
    assert.match(visitorsPageSource, /canDeleteGuestVisitors\(admin\.role\)/);
    assert.match(visitorsPageSource, /canDeleteVisitors=\{canDelete\}/);
  });

  it("Owner sees Select visitors; Audience does not (gated by canDelete)", () => {
    assert.equal(canDeleteGuestVisitors("owner"), true);
    assert.equal(canDeleteGuestVisitors("members"), false);
    assert.match(tableSource, /if \(!canDelete\) return null/);
    assert.match(tableSource, /Select visitors/);
    assert.match(recentSource, /VisitorsSelectModeToggle/);
    assert.match(recentSource, /canDelete=\{canDeleteVisitors\}/);
  });

  it("default browsing mode has no always-visible checkboxes", () => {
    assert.match(tableSource, /showSelectionChrome = canDelete && activeSelectMode/);
    assert.match(tableSource, /\{showSelectionChrome \? \(/);
    assert.doesNotMatch(tableSource, /checked=\{selectedIds\.has\(guest\.id\)\}[\s\S]*canDelete && !activeSelectMode/);
  });

  it("selection mode reveals Select page, row checkboxes, and Cancel selection", () => {
    assert.match(tableSource, /aria-label="Select page"/);
    assert.match(tableSource, />Select page</);
    assert.match(tableSource, /aria-label=\{`Select visitor \$\{short\}`\}/);
    assert.match(tableSource, /Cancel selection/);
    assert.match(tableSource, /Delete selected/);
  });

  it("Select page selects only currently visible visitor ids", () => {
    assert.match(tableSource, /function togglePage\(checked: boolean\)/);
    assert.match(
      tableSource,
      /setSelectedIds\(checked \? new Set\(visibleIds\) : new Set\(\)\)/,
    );
    assert.doesNotMatch(tableSource, /Select all \d+/);
    assert.doesNotMatch(tableSource, /Delete all visitors/i);
  });

  it("shows selected count and requires confirmation before delete", () => {
    assert.match(tableSource, /\{selectedCount\} selected/);
    assert.match(
      tableSource,
      /Permanently delete \$\{countLabel\} selected visitor\$\{selectedCount === 1 \? "" : "s"\} and their associated visitor data\? This cannot be undone\./,
    );
    assert.match(tableSource, /window\.confirm\(/);
  });

  it("Cancel and result-set changes clear selection safely", () => {
    assert.match(overviewSource, /key=\{`\$\{range\}-\$\{kind\}-\$\{source\}-\$\{q\}-\$\{list\.page\}`\}/);
    assert.match(
      recentSource,
      /key=\{resultKey\}/,
    );
    assert.match(tableSource, /selectionModeSnapshot !== activeSelectMode/);
    assert.match(tableSource, /setSelectedIds\(new Set\(\)\)/);
  });

  it("places Select visitors in a left-aligned management row like Reviews, not the heading far-right", () => {
    assert.match(recentSource, /Recent visitors/);
    assert.match(recentSource, /VisitorsSelectModeToggle/);
    assert.doesNotMatch(
      recentSource,
      /justify-between[\s\S]{0,400}VisitorsSelectModeToggle/,
    );
    assert.doesNotMatch(
      recentSource,
      /items-end justify-between/,
    );
    assert.match(
      recentSource,
      /flex flex-wrap items-center gap-3[\s\S]{0,200}VisitorsSelectModeToggle/,
    );
    const heading = recentSource.indexOf('id="recent-visitors-heading"');
    const toggle = recentSource.indexOf("<VisitorsSelectModeToggle");
    const chips = recentSource.indexOf('aria-label="Visitor classification"');
    assert.ok(heading >= 0 && toggle > heading);
    assert.ok(chips > toggle);
  });

  it("keeps selection-mode chrome (Select page / Delete selected) below the entry control", () => {
    assert.match(tableSource, /role="status"/);
    assert.match(tableSource, /showSelectionChrome = canDelete && activeSelectMode/);
    assert.match(tableSource, /Cancel selection/);
    assert.match(tableSource, /Delete selected/);
  });

  it("does not redesign overview analytics chrome", () => {
    assert.match(overviewSource, /Audience summary/);
    assert.match(overviewSource, /Popular content/);
    assert.match(overviewSource, /Traffic sources/);
    assert.match(overviewSource, /VisitorsRecentSection/);
  });
});

describe("Visitors bulk delete server action + cascade", () => {
  it("reuses deleteGuestVisitorsAction with server-side Owner gate", () => {
    assert.match(actionsSource, /export async function deleteGuestVisitorsAction/);
    assert.match(
      actionsSource,
      /if \(!canDeleteGuestVisitors\(admin\.role\)\) \{\s*return \{ ok: false, error: "forbidden" \};/,
    );
    assert.match(actionsSource, /normalizeGuestVisitorIds\(visitorIds\)/);
    assert.match(actionsSource, /deleteGuestVisitorsForAdmin\(ids\)/);
    assert.match(tableSource, /deleteGuestVisitorsAction\(ids\)/);
    assert.doesNotMatch(tableSource, /deleteGuestVisitorAction\(/);
  });

  it("preserves presence explicit delete + pageview/funnel cascade", () => {
    assert.match(
      analyticsSource,
      /guestPresenceSession\.deleteMany\([\s\S]*guestVisitor\.deleteMany/,
    );
    assert.match(
      schema,
      /model GuestPageView[\s\S]*onDelete: Cascade/,
    );
    assert.match(
      schema,
      /model FunnelEvent[\s\S]*onDelete: Cascade/,
    );
    assert.match(
      schema,
      /model GuestPresenceSession[\s\S]*onDelete: Cascade/,
    );
  });
});
