import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canAccess } from "./admin-access";
import {
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminWorkspaceSeries,
  adminWorkspaceStandard,
  adminWorkspaceWide,
} from "./admin-ui";
import { adminWorkspaceWidthForPath } from "./admin-nav";

const root = path.dirname(fileURLToPath(import.meta.url));
const page = readFileSync(path.join(root, "../app/admin/(app)/series/page.tsx"), "utf8");
const editor = readFileSync(path.join(root, "../components/admin/SeriesEditor.tsx"), "utf8");
const aiControls = readFileSync(
  path.join(root, "../components/admin/SeriesEditorialAiControls.tsx"),
  "utf8",
);
const overflow = readFileSync(
  path.join(root, "../components/admin/SeriesIndexRowOverflow.tsx"),
  "utf8",
);
const publicSeries = readFileSync(path.join(root, "../app/series/[slug]/page.tsx"), "utf8");

describe("Series Phase 1 presentation contracts", () => {
  it("uses a Series-specific workspace width without widening unrelated routes", () => {
    assert.equal(adminWorkspaceSeries, "max-w-5xl");
    assert.equal(adminWorkspaceWidthForPath("/admin/series"), adminWorkspaceSeries);
    assert.equal(adminWorkspaceWidthForPath("/admin/series/abc"), adminWorkspaceSeries);
    assert.notEqual(adminWorkspaceWidthForPath("/admin/series"), adminWorkspaceWide);
    assert.notEqual(adminWorkspaceWidthForPath("/admin/series"), adminWorkspaceStandard);
    assert.equal(adminWorkspaceWidthForPath("/admin/youtube"), adminWorkspaceWide);
    assert.equal(adminWorkspaceWidthForPath("/admin/staff"), adminWorkspaceStandard);
  });

  it("keeps content access for Owner and Editor; Audience denied", () => {
    assert.match(page, /requireAccess\("content"\)/);
    assert.equal(canAccess("owner", "content"), true);
    assert.equal(canAccess("editor", "content"), true);
    assert.equal(canAccess("members", "content"), false);
  });

  it("simplifies index columns and drops diagnostic columns from the ledger", () => {
    assert.match(page, /scope="col"/);
    assert.match(page, />\s*Series\s*</);
    assert.match(page, />\s*Source\s*</);
    assert.match(page, />\s*Items\s*</);
    assert.match(page, />\s*Status\s*</);
    assert.match(page, />\s*Actions\s*</);
    assert.doesNotMatch(page, /Last refreshed/);
    assert.doesNotMatch(page, />\s*Linked\s*</);
    assert.doesNotMatch(page, />\s*Video-only\s*</);
    assert.doesNotMatch(page, />\s*Order\s*</);
    assert.doesNotMatch(page, /overflow-x-auto/);
  });

  it("keeps View conditional on published and moves source actions into overflow", () => {
    assert.match(page, /row\.isPublished \? \([\s\S]*View ↗/);
    assert.match(page, /aria-label=\{`Edit \$\{row\.title\}`\}/);
    assert.match(page, /aria-label=\{`View \$\{row\.title\}`\}/);
    assert.match(overflow, /More actions for/);
    assert.match(overflow, /refreshSeriesFromYoutubeAction/);
    assert.match(overflow, /Refresh \$\{seriesTitle\} from YouTube/);
    assert.match(overflow, /Open \$\{seriesTitle\} playlist on YouTube/);
    assert.doesNotMatch(page, /form action=\{refreshSeriesFromYoutubeAction\}/);
  });

  it("uses 2xl desktop table and stacked rows below that threshold", () => {
    assert.match(page, /hidden min-w-0 2xl:block/);
    assert.match(page, /2xl:hidden/);
    assert.match(page, /<table/);
    assert.match(page, /<thead/);
    assert.match(page, /divide-y divide-line\/70 border-y/);
    assert.match(page, /itemsSummary/);
  });

  it("places Import as primary and Create custom as secondary", () => {
    assert.match(page, /href="\/admin\/series\/import"/);
    assert.match(page, /href="\/admin\/series\/new"/);
    const importLink = page.indexOf('href="/admin/series/import"');
    const newLink = page.indexOf('href="/admin/series/new"');
    assert.ok(importLink > 0 && newLink > importLink);
    assert.match(
      page.slice(importLink, importLink + 160),
      /adminPrimaryButtonClass/,
    );
    assert.match(
      page.slice(newLink, newLink + 200),
      /adminSecondaryButtonClass/,
    );
    assert.equal(adminPrimaryButtonClass.includes("bg-terracotta"), true);
    assert.equal(adminSecondaryButtonClass.includes("border border-line"), true);
  });

  it("orders editor sections with editorial before Source and AI", () => {
    const editorial = editor.indexOf("Editorial presentation");
    const visual = editor.indexOf('id="series-visual-heading"');
    const content = editor.indexOf('id="series-content-heading"');
    const discovery = editor.indexOf('id="series-discovery-heading"');
    const source = editor.indexOf('id="series-source-heading"');
    const ai = editor.indexOf('id="series-ai-heading"');
    const del = editor.indexOf("Delete series");
    assert.ok(editorial > 0);
    assert.ok(visual > editorial);
    assert.ok(content > visual);
    assert.ok(discovery > content);
    assert.ok(source > discovery);
    assert.ok(ai > source);
    assert.ok(del > ai);
  });

  it("reserves terracotta primary for save/update and demotes Refresh / Regenerate", () => {
    assert.match(editor, /adminPrimaryButtonClass/);
    assert.match(editor, /Update published series/);
    const refreshBlock = editor.slice(
      editor.indexOf("Refresh from YouTube") - 180,
      editor.indexOf("Refresh from YouTube"),
    );
    assert.match(refreshBlock, /adminSecondaryButtonClass/);
    assert.doesNotMatch(refreshBlock, /adminPrimaryButtonClass/);
    assert.match(aiControls, /Regenerate editorial draft/);
    assert.match(aiControls, /adminSecondaryButtonClass/);
    assert.doesNotMatch(aiControls, /adminPrimaryButtonClass/);
  });

  it("presents slug as immutable metadata after creation", () => {
    assert.match(editor, /Locked after creation/);
    assert.match(editor, /type="hidden" name="slug"/);
    assert.match(editor, /font-mono text-sm text-muted">\{slug\}/);
  });

  it("keeps items serialization and Featured / Remove presentation contracts", () => {
    assert.match(editor, /name="itemsJson" value=\{JSON\.stringify\(items\)\}/);
    assert.match(editor, /Set as featured/);
    assert.match(editor, /Featured item: \$\{item\.label\}/);
    assert.match(editor, /Set \$\{item\.label\} as featured/);
    assert.match(editor, /may return after a future refresh/);
    assert.match(editor, /Remove this item from the Series\?/);
    assert.doesNotMatch(editor, /Remove this item from the Series permanently\?/);
  });

  it("polishes UNKNOWN display and keeps Add accessible names", () => {
    assert.match(editor, /format === "UNKNOWN"/);
    assert.match(editor, /function pickerFormatLabel/);
    assert.match(editor, /aria-label=\{`Add \$\{addLabel\}`\}/);
    assert.match(editor, /Add Mesa items/);
    assert.doesNotMatch(editor, /Format not set/);
  });

  it("retains Source safety copy and follow-order checkbox wording", () => {
    assert.match(
      editor,
      /Refresh updates playlist membership and snapshots only\. Mesa title, intro, SEO, hero,\s*published state, and recipe content are never overwritten\./,
    );
    assert.match(editor, /Follow YouTube playlist order on refresh/);
    assert.match(editor, /formAction=\{refreshSeriesFromYoutubeAction\}/);
  });

  it("summarizes AI states without mutating draftStatus after verification", () => {
    assert.match(aiControls, /AI editorial · Verified by staff/);
    assert.match(aiControls, /AI draft · Review needed/);
    assert.match(aiControls, /seriesAiAssistanceSummary/);
    assert.match(aiControls, /Draft status remains complete after verification/);
  });

  it("uses conservative 2xl field columns and containment", () => {
    assert.match(editor, /2xl:grid-cols-2/);
    assert.doesNotMatch(editor, /md:grid-cols-2/);
    assert.match(editor, /min-w-0/);
    assert.match(editor, /overflow-x-clip/);
    assert.match(editor, /max-w-\[72ch\]/);
    assert.match(editor, /adminRecipeEditorStickyBleedClass/);
  });

  it("does not alter the public Series renderer in Phase 1 assumptions", () => {
    assert.match(publicSeries, /Featured/);
    assert.match(publicSeries, /In this series/);
    assert.doesNotMatch(editor, /app\/series\/\[slug\]/);
  });
});
