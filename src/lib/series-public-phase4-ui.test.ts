import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { mapSourceToPlacement } from "./funnel-analytics";

const root = path.dirname(fileURLToPath(import.meta.url));
const page = readFileSync(path.join(root, "../app/series/[slug]/page.tsx"), "utf8");
const conclusion = readFileSync(
  path.join(root, "../components/series/SeriesContinueWithMesa.tsx"),
  "utf8",
);

describe("Series public Phase 4 visual/conversion polish", () => {
  it("adapts item grid width from visible item count (no implied empty third column for 2)", () => {
    assert.match(page, /visibleItemCount/);
    assert.match(page, /visibleItemCount <= 1/);
    assert.match(page, /visibleItemCount === 2/);
    assert.match(page, /data-mesa-series-grid=\{itemGridMode\}/);
    assert.match(page, /max-w-xl/);
    // Exactly two columns for 2 items; three-column class only on the 3+ branch.
    assert.match(page, /\? "mt-6 grid gap-6 sm:grid-cols-2"/);
    assert.match(page, /: "mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"/);
    assert.doesNotMatch(page, /\? "mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"/);
  });

  it("keeps Phase 2 architecture: no standalone Featured showcase", () => {
    assert.match(page, /data-mesa-series-layout="phase2-collection"/);
    assert.doesNotMatch(page, /featured\.thumbnail|featured\.title/);
    assert.doesNotMatch(page, /bg-cream\/40 p-4 md:p-6/);
    assert.match(page, /effectiveFeaturedId === item\.id/);
    assert.equal((page.match(/series\.items\.map/g) || []).length, 1);
  });

  it("keeps header playlist as quiet text CTA and conclusion playlist as primary button", () => {
    assert.match(page, /placement="series_page_header"/);
    assert.match(
      page,
      /text-muted underline-offset-2 hover:text-ink hover:underline[\s\S]*?placement="series_page_header"/,
    );
    assert.doesNotMatch(
      page,
      /bg-terracotta[\s\S]{0,400}placement="series_page_header"/,
    );
    assert.match(conclusion, /placement="series_page_conclusion"/);
    assert.match(conclusion, /primaryButtonClass/);
    assert.match(conclusion, /bg-terracotta/);
    assert.match(conclusion, /secondaryButtonClass/);
    assert.match(conclusion, /border border-line/);
    assert.match(conclusion, /hasPlaylist \? secondaryButtonClass : primaryButtonClass/);
    assert.equal((page.match(/series_watch_playlist_on_youtube_click/g) || []).length, 1);
    assert.equal((conclusion.match(/series_watch_playlist_on_youtube_click/g) || []).length, 1);
  });

  it("uses full collection width for conclusion with conservative xl text/actions split", () => {
    assert.doesNotMatch(page, /max-w-3xl[\s\S]{0,80}SeriesContinueWithMesa/);
    assert.match(page, /SeriesContinueWithMesa/);
    assert.match(conclusion, /xl:flex-row xl:items-end xl:justify-between/);
    assert.doesNotMatch(conclusion, /\bmd:flex-row\b|\blg:flex-row\b/);
    assert.match(conclusion, /border-y border-line/);
    assert.doesNotMatch(conclusion, /shadow|bg-red|youtube\.com\/s\/img|#ff0000/i);
  });

  it("preserves Subscribe presence and analytics placements/events", () => {
    assert.match(conclusion, /Subscribe on YouTube/);
    assert.match(conclusion, /recipe_youtube_subscribe_click/);
    assert.match(conclusion, /source: "series_page"/);
    assert.equal(mapSourceToPlacement("series_page_header"), "series_page");
    assert.equal(mapSourceToPlacement("series_page_conclusion"), "series_page");
    assert.match(page, /event="series_item_click"/);
    assert.match(page, /event="series_watch_click"/);
  });

  it("preserves recipe-only / video-only card actions and a11y labels", () => {
    assert.match(page, /item\.recipeSlug \?/);
    assert.match(page, /item\.watchUrl \?/);
    assert.match(page, />\s*Read recipe\s*</);
    assert.match(page, />\s*Watch video/);
    assert.match(page, /ariaLabel=\{`Read recipe: \$\{item\.title\}`\}/);
    assert.match(page, /ariaLabel=\{`Watch video: \$\{item\.title\} \(opens in a new tab\)`\}/);
    assert.match(page, /min-h-11/);
    assert.match(page, /gap-x-5 gap-y-3/);
  });

  it("bottom-anchors card CTAs via equal-height flex layout (no fixed-height hacks)", () => {
    assert.match(page, /flex h-full min-w-0 flex-col border border-line bg-paper/);
    assert.match(page, /flex min-w-0 flex-1 flex-col px-4 py-4/);
    assert.match(page, /mt-auto flex min-w-0 flex-wrap gap-x-5 gap-y-3 pt-4/);
    // Same structural card for Featured and non-Featured — only the label is conditional.
    assert.match(page, /isEffectiveFeatured \? \([\s\S]*Featured[\s\S]*\) : null/);
    // No fixed card/description height — exclude hero's intentional xl:h-[30rem].
    const cardRegion = page.slice(page.indexOf("In this series"), page.indexOf("SeriesContinueWithMesa"));
    assert.doesNotMatch(cardRegion, /min-h-\[|h-\[(?:\d)|h-96|h-80|h-72/);
    assert.doesNotMatch(cardRegion, /invisible|opacity-0/);
  });

  it("modestly reduces large-desktop hero height without changing source logic", () => {
    assert.match(page, /xl:aspect-auto xl:h-\[30rem\]/);
    assert.doesNotMatch(page, /xl:h-\[34rem\]/);
    assert.match(page, /series\.heroImage/);
    assert.match(page, /object-cover object-center/);
  });
});
