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
import {
  adminSeriesPreviewBannerCopy,
  adminSeriesPreviewPath,
} from "./series-admin-preview.ts";

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
const publicSeries = readFileSync(path.join(root, "../components/series/SeriesDetailView.tsx"), "utf8");
const publicPage = readFileSync(path.join(root, "../app/series/[slug]/page.tsx"), "utf8");
const previewPage = readFileSync(
  path.join(root, "../app/admin/(preview)/series/[id]/preview/page.tsx"),
  "utf8",
);
const nav = readFileSync(path.join(root, "../lib/admin-nav.ts"), "utf8");
const labels = readFileSync(path.join(root, "../lib/phase3c-collections.ts"), "utf8");
const importPage = readFileSync(path.join(root, "../app/admin/(app)/series/import/page.tsx"), "utf8");

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

  it("shows Collections terminology on Admin index and sidebar", () => {
    assert.match(nav, /label: "Collections"/);
    assert.match(page, /title="Collections"/);
    assert.match(page, /\+ New collection/);
    assert.match(page, /PHASE3C_MESA_COLLECTION_LABEL/);
    assert.match(page, /PHASE3C_YOUTUBE_COLLECTION_LABEL/);
    assert.match(labels, /PHASE3C_MESA_COLLECTION_LABEL = "Mesa Collection"/);
    assert.match(labels, /PHASE3C_YOUTUBE_COLLECTION_LABEL = "YouTube Collection"/);
    assert.match(page, />\s*Collection\s*</);
    assert.match(page, />\s*Source\s*</);
    assert.match(page, />\s*Items\s*</);
    assert.match(page, />\s*Status\s*</);
    assert.match(page, />\s*Actions\s*</);
    assert.doesNotMatch(page, /Last refreshed/);
    assert.doesNotMatch(page, /href="\/admin\/collections"/);
    assert.doesNotMatch(page, /href="\/collections"/);
  });

  it("keeps View conditional on published and Preview for drafts", () => {
    assert.match(page, /row\.isPublished \? \([\s\S]*View ↗/);
    assert.match(page, /\/admin\/series\/\$\{row\.id\}\/preview/);
    assert.match(page, /aria-label=\{`Edit \$\{row\.title\}`\}/);
    assert.match(page, /aria-label=\{`View \$\{row\.title\}`\}/);
    assert.match(overflow, /More actions for/);
    assert.match(overflow, /refreshSeriesFromYoutubeAction/);
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

  it("places Import as primary and New collection as secondary", () => {
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

  it("orders editor sections with AI assistance before Editorial and Source last", () => {
    const ai = editor.indexOf('id="series-ai-heading"');
    const editorial = editor.indexOf("Editorial presentation");
    const visual = editor.indexOf('id="series-visual-heading"');
    const content = editor.indexOf('id="series-content-heading"');
    const discovery = editor.indexOf('id="series-discovery-heading"');
    const source = editor.indexOf('id="series-source-heading"');
    const del = editor.indexOf("Delete collection");
    assert.ok(ai > 0);
    assert.ok(editorial > ai);
    assert.ok(visual > editorial);
    assert.ok(content > visual);
    assert.ok(discovery > content);
    assert.ok(source > discovery);
    assert.ok(del > source);
    assert.equal((editor.match(/id="series-ai-heading"/g) || []).length, 1);
    assert.ok(ai < editor.indexOf("action={saveSeriesAction}"));
  });

  it("keeps AI assistance above Editorial while Source remains later", () => {
    const ai = editor.indexOf('id="series-ai-heading"');
    const editorial = editor.indexOf('id="series-editorial-heading"');
    const source = editor.indexOf('id="series-source-heading"');
    assert.ok(ai > 0 && editorial > ai && source > editorial);
    assert.match(editor, /SeriesEditorialAiControls/);
    assert.match(aiControls, /\/api\/admin\/series\/ai-generate/);
    assert.match(aiControls, /Regenerate editorial draft/);
    assert.match(aiControls, /2xl:flex-row/);
    assert.doesNotMatch(aiControls, /adminPrimaryButtonClass/);
  });

  it("reserves terracotta primary for save/update and demotes Refresh / Regenerate", () => {
    assert.match(editor, /adminPrimaryButtonClass/);
    assert.match(editor, /Update published collection/);
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
    assert.match(editor, /type="hidden" name="slug"/);
    assert.match(editor, /font-mono text-sm text-muted">\{slug\}/);
    assert.match(editor, /Collection URLs stay fixed after creation/);
    assert.doesNotMatch(editor, /Automatic redirects are not yet created for Collection URLs/);
    assert.doesNotMatch(editor, /Locked after creation/);
  });

  it("keeps items serialization and Featured / Remove presentation contracts", () => {
    assert.match(editor, /name="itemsJson" value=\{JSON\.stringify\(items\)\}/);
    assert.match(editor, /Set as featured/);
    assert.match(editor, /Featured item: \$\{item\.label\}/);
    assert.match(editor, /Set \$\{item\.label\} as featured/);
    assert.match(editor, /may return after a future refresh/);
    assert.match(editor, /Remove this item from the Collection\?/);
    assert.doesNotMatch(editor, /Remove this item from the Collection permanently\?/);
  });

  it("uses recipe-first CUSTOM add copy and Admin Preview by Series.id", () => {
    assert.match(editor, /Add recipes/);
    assert.match(editor, /Create Collection/);
    assert.match(editor, /Mesa Collection/);
    assert.match(editor, /YouTube Collection/);
    assert.match(editor, /\/admin\/series\/\$\{series\.id\}\/preview/);
    assert.match(editor, /← Collections/);
    assert.match(importPage, /Create Mesa Collection instead/);
    assert.match(importPage, /YouTube Collection/);
  });

  it("polishes UNKNOWN display and keeps Add accessible names", () => {
    assert.match(editor, /format === "UNKNOWN"/);
    assert.match(editor, /function pickerFormatLabel/);
    assert.match(editor, /aria-label=\{`Add \$\{addLabel\}`\}/);
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

  it("shares public Collection presentation and keeps /series routes", () => {
    assert.match(publicSeries, /Featured/);
    assert.match(publicSeries, /In this collection/);
    assert.match(publicPage, /SeriesDetailView/);
    assert.match(publicPage, /getPublishedSeriesBySlug/);
    assert.doesNotMatch(publicPage, /href="\/collections/);
  });
});

describe("Series Collection Admin Preview", () => {
  it("builds preview paths by Series.id and banner copy", () => {
    assert.equal(adminSeriesPreviewPath("clr123"), "/admin/series/clr123/preview");
    assert.equal(adminSeriesPreviewBannerCopy(false).eyebrow, "Draft collection preview");
    assert.equal(adminSeriesPreviewBannerCopy(true).eyebrow, "Collection preview");
  });

  it("wires authenticated preview outside AdminShell with noindex and engagement gate", () => {
    assert.match(previewPage, /requireAccess\("content"\)/);
    assert.match(previewPage, /getSeriesDetailByIdForAdminPreview/);
    assert.match(previewPage, /robots: \{ index: false, follow: false \}/);
    assert.match(previewPage, /SeriesPreviewEngagementGate/);
    assert.match(previewPage, /mode="preview"/);
    assert.match(previewPage, /Open live page|liveHref/);
    const chrome = readFileSync(path.join(root, "../components/PublicChrome.tsx"), "utf8");
    assert.match(chrome, /isSeriesPreview/);
    const layout = readFileSync(path.join(root, "../app/admin/(preview)/layout.tsx"), "utf8");
    assert.doesNotMatch(layout, /from ["']@\/components\/admin\/AdminShell["']/);
    assert.doesNotMatch(layout, /<AdminShell/);
  });
});
