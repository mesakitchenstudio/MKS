import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  absolutePageTitle,
  PAGE_TITLE_BRAND,
  PAGE_TITLE_DEFAULT,
  PAGE_TITLE_TEMPLATE,
  pageTitleSegment,
} from "./page-title.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readApp(rel: string) {
  return readFileSync(path.join(root, "../app", rel), "utf8");
}

describe("page title system", () => {
  it("defines the canonical brand template without nesting the brand twice", () => {
    assert.equal(PAGE_TITLE_BRAND, "Mesa Kitchen Studio");
    assert.equal(PAGE_TITLE_TEMPLATE, "%s | Mesa Kitchen Studio");
    assert.equal(PAGE_TITLE_DEFAULT, "Home | Mesa Kitchen Studio");
    assert.equal(pageTitleSegment("About"), "About");
    assert.equal(pageTitleSegment("About | Mesa Kitchen Studio"), "About");
    assert.equal(pageTitleSegment("About Mesa Kitchen Studio"), "About");
    assert.equal(pageTitleSegment("Iced Horchata Coffee | Mesa Kitchen Studio"), "Iced Horchata Coffee");
    assert.equal(absolutePageTitle("Reviews"), "Reviews | Mesa Kitchen Studio");
    assert.equal(
      absolutePageTitle("Reviews | Mesa Kitchen Studio"),
      "Reviews | Mesa Kitchen Studio",
    );
    assert.doesNotMatch(absolutePageTitle("About Mesa Kitchen Studio"), /Mesa Kitchen Studio \| Mesa Kitchen Studio/);
  });

  it("wires the root layout to the shared template and Home default", () => {
    const layout = readApp("layout.tsx");
    assert.match(layout, /PAGE_TITLE_DEFAULT/);
    assert.match(layout, /PAGE_TITLE_TEMPLATE/);
    assert.doesNotMatch(layout, /default: `\$\{site\.name\} \| \$\{site\.tagline\}`/);
  });

  it("normalizes representative public route title segments", () => {
    assert.match(readApp("page.tsx"), /title:\s*"Home"/);
    assert.match(readApp("about/page.tsx"), /title:\s*"About"/);
    assert.doesNotMatch(readApp("about/page.tsx"), /About \$\{site\.name\}/);
    assert.match(readApp("videos/page.tsx"), /title:\s*"Videos"/);
    assert.match(readApp("contact/page.tsx"), /title:\s*"Contact"/);
    assert.match(readApp("privacy/page.tsx"), /title:\s*"Privacy"/);
    assert.match(readApp("disclosures/page.tsx"), /title:\s*"Disclosures"/);
    assert.match(readApp("profile/page.tsx"), /title:\s*"Profile"/);
    assert.match(readApp("studio/page.tsx"), /title:\s*"Studio"/);
    assert.match(readApp("series/page.tsx"), /title:\s*"Series"/);

    const recipes = readApp("recipes/page.tsx");
    assert.match(recipes, /pageTitleSegment/);
    assert.doesNotMatch(recipes, /\$\{collectionTitles\[params\.collection\].*\| \$\{site\.name\}/);

    const recipe = readApp("recipes/[slug]/page.tsx");
    assert.match(recipe, /title: recipe\.title/);
    assert.match(recipe, /title: `\$\{recipe\.title\} \| \$\{site\.name\}`/);

    const seriesDetail = readApp("series/[slug]/page.tsx");
    assert.match(seriesDetail, /title: series\.title/);
    assert.match(seriesDetail, /const documentTitle = series\.title/);
  });

  it("normalizes representative admin route title segments", () => {
    assert.match(readApp("admin/layout.tsx"), /title:\s*"Admin"/);
    assert.match(readApp("admin/(app)/reviews/page.tsx"), /title:\s*"Reviews"/);
    assert.match(readApp("admin/(app)/members/page.tsx"), /title:\s*"Members"/);
    assert.match(readApp("admin/(app)/types/page.tsx"), /title:\s*"Recipe Types"/);
    assert.match(readApp("admin/(app)/visitors/page.tsx"), /title:\s*"Visitors"/);
    assert.match(readApp("admin/(app)/youtube/page.tsx"), /title:\s*"YouTube"/);
    assert.match(readApp("admin/(app)/staff/page.tsx"), /title:\s*"Team Access"/);
    assert.match(readApp("admin/(app)/categories/page.tsx"), /title:\s*"Categories"/);
    assert.match(readApp("admin/(app)/series/page.tsx"), /title:\s*"Series"/);
    assert.match(readApp("admin/(app)/studio/page.tsx"), /title:\s*"Studio"/);
    assert.match(readApp("admin/(app)/profile/page.tsx"), /title:\s*"Profile"/);
    assert.match(readApp("admin/(app)/page.tsx"), /title:\s*"Admin"/);

    const recipeEditor = readApp("admin/(app)/recipes/[id]/page.tsx");
    assert.match(recipeEditor, /generateMetadata/);
    assert.match(recipeEditor, /title: recipe\.title/);

    const seriesEditor = readApp("admin/(app)/series/[id]/page.tsx");
    assert.match(seriesEditor, /generateMetadata/);
    assert.match(seriesEditor, /title: series\.title/);
  });
});
