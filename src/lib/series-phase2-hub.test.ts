import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("Collections Phase 2 hub quality contracts", () => {
  it("uses CollectionCard on the public index and related shelf", () => {
    const index = read("../app/series/page.tsx");
    const detail = read("../components/series/SeriesDetailView.tsx");
    const card = read("../components/series/CollectionCard.tsx");
    assert.match(index, /CollectionCard/);
    assert.match(detail, /Explore more collections/);
    assert.match(detail, /CollectionCard/);
    assert.match(card, /Explore collection →/);
    assert.doesNotMatch(card, /Mesa Collection|YouTube Collection/);
  });

  it("shows a purposeful empty state and related shelf placement", () => {
    const detail = read("../components/series/SeriesDetailView.tsx");
    assert.match(detail, /Recipes for this collection are being prepared/);
    assert.match(detail, /Explore more collections/);
    const emptyIdx = detail.indexOf("Recipes for this collection are being prepared");
    const relatedIdx = detail.indexOf("Explore more collections");
    const continueIdx = detail.indexOf("<SeriesContinueWithMesa");
    assert.ok(emptyIdx > 0 && relatedIdx > emptyIdx);
    assert.ok(continueIdx > relatedIdx);
  });

  it("noindexes empty published Collections while keeping canonical", () => {
    const route = read("../app/series/[slug]/page.tsx");
    assert.match(route, /robots: \{ index: false, follow: true \}/);
    assert.match(route, /canonical: `\/series\/\$\{series\.slug\}`/);
    assert.match(route, /listRelatedPublishedSeriesCards/);
    assert.match(route, /dynamicParams = true/);
  });

  it("noindexes empty Collections hub", () => {
    const index = read("../app/series/page.tsx");
    assert.match(index, /empty \? \{ robots: \{ index: false, follow: true \} \}/);
    assert.match(index, /canonical: "\/series"/);
  });

  it("excludes zero-visible Collections from listPublishedSeries browse/sitemap source", () => {
    const series = read("./series.ts");
    assert.match(series, /filter\(\(card\) => card\.itemCount > 0\)/);
    assert.match(series, /listRelatedPublishedSeriesCards/);
    assert.match(series, /selectRelatedSeries/);
  });

  it("enforces zero-visible publish on the server", () => {
    const actions = read("../app/admin/actions.ts");
    assert.match(actions, /isSeriesMembershipPubliclyRenderable/);
    assert.match(
      actions,
      /Add at least one publicly available recipe or video before publishing this Collection/,
    );
    assert.match(actions, /publishingNow/);
  });

  it("surfaces Admin visibility counts and thin warnings", () => {
    const editor = read("../components/admin/SeriesEditor.tsx");
    assert.match(editor, /Publicly visible/);
    assert.match(editor, /fewer than 3 public items/);
    assert.match(editor, /Recommended for stronger Collection pages/);
    assert.match(editor, /countSeriesMembershipVisibility/);
  });

  it("keeps visitor-facing Collection terminology on public surfaces", () => {
    const meta = read("./series-public-meta.ts");
    const homepage = read("../components/HomepageFeaturedSeries.tsx");
    const continueBlock = read("../components/series/SeriesContinueWithMesa.tsx");
    assert.match(meta, /Watch playlist on YouTube/);
    assert.doesNotMatch(meta, /PART SERIES/);
    assert.match(homepage, /Featured collection/);
    assert.match(homepage, />\s*Collections\s*</);
    assert.match(continueBlock, /complete playlist on YouTube/);
    assert.doesNotMatch(continueBlock, /complete Series playlist/);
  });

  it("does not introduce /collections routes", () => {
    const index = read("../app/series/page.tsx");
    const detail = read("../app/series/[slug]/page.tsx");
    assert.doesNotMatch(index, /href="\/collections"/);
    assert.doesNotMatch(detail, /href="\/collections"/);
  });
});
