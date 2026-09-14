import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { site } from "@/data/site";
import {
  absolutePublicUrl,
  buildBreadcrumbJsonLd,
} from "@/lib/breadcrumb-jsonld";
import { PHASE3C_PUBLIC_COLLECTIONS_LABEL } from "@/lib/phase3c-collections";
import { buildSitemapEntries, sitemapPathnamesFromEntries } from "@/lib/sitemap-entries";
import {
  COLLECTION_CATEGORY_CLONE_WARNING,
  collectionDocumentTitleSegment,
  collectionMatchesCategoryClone,
  collectionMetaDescription,
} from "@/lib/series-seo";
import { seriesItemListJsonLd, type PublicSeriesDetail, type PublicSeriesItem } from "@/lib/series-types";

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

function sampleItem(overrides: Partial<PublicSeriesItem> = {}): PublicSeriesItem {
  return {
    id: "item-1",
    position: 1,
    title: "Baguettes",
    description: "",
    featured: false,
    thumbnail: "https://cdn.example/thumb.jpg",
    recipeId: "r1",
    recipeSlug: "classic-baguettes",
    recipeTitle: "Baguettes",
    youtubeVideoId: null,
    youtubeTitle: null,
    durationDisplay: "",
    watchUrl: null,
    watchExternal: false,
    typeName: "",
    categorySlugs: [],
    primaryCategoryLabel: "",
    totalTimeMinutes: null,
    ...overrides,
  };
}

function sampleSeries(overrides: Partial<PublicSeriesDetail> = {}): PublicSeriesDetail {
  return {
    id: "s1",
    slug: "french-desserts",
    title: "French Desserts",
    shortTitle: "",
    description: "Visitor lead description.",
    intro: "Long intro body that must not become meta description.",
    heroImage: "https://cdn.example/hero.jpg",
    seoTitle: "Easy French Dessert Recipes",
    seoDescription: "Search-facing SEO description for French desserts.",
    youtubePlaylistId: null,
    youtubePlaylistUrl: null,
    itemCount: 1,
    items: [sampleItem()],
    featured: null,
    ...overrides,
  };
}

describe("Collections Phase 4 — preferred host", () => {
  it("site.url prefers www production host", () => {
    assert.equal(site.url, "https://www.mesakitchenstudio.com");
  });
});

describe("Collections Phase 4 — metadata helpers", () => {
  it("1–3. document title uses seoTitle, falls back to title, then Collections", () => {
    assert.equal(
      collectionDocumentTitleSegment({
        seoTitle: "Easy French Dessert Recipes",
        title: "French Desserts",
      }),
      "Easy French Dessert Recipes",
    );
    assert.equal(
      collectionDocumentTitleSegment({ seoTitle: "  ", title: "French Desserts" }),
      "French Desserts",
    );
    assert.equal(collectionDocumentTitleSegment({ seoTitle: "", title: "" }), "Collections");
  });

  it("4–6. meta description prefers seoDescription → description; never intro", () => {
    assert.equal(
      collectionMetaDescription({
        seoDescription: "SEO desc",
        description: "Lead",
      }),
      "SEO desc",
    );
    assert.equal(
      collectionMetaDescription({ seoDescription: "  ", description: "Lead under title" }),
      "Lead under title",
    );
    const fallback = collectionMetaDescription({
      seoDescription: "",
      description: "",
    });
    assert.match(fallback, /Cooking collections from Mesa Kitchen Studio/);
    assert.doesNotMatch(fallback, /Long intro/);
  });

  it("wires Collection detail metadata through helpers (H1 stays title)", () => {
    const route = read("../app/series/[slug]/page.tsx");
    const view = read("../components/series/SeriesDetailView.tsx");
    assert.match(route, /collectionDocumentTitleSegment/);
    assert.match(route, /collectionMetaDescription/);
    assert.match(view, /\{series\.title\}/);
    assert.doesNotMatch(view, /series\.seoTitle/);
  });
});

describe("Collections Phase 4 — BreadcrumbList", () => {
  it("13–18. hub and detail breadcrumbs with sequential positions and absolute URLs", () => {
    const hub = buildBreadcrumbJsonLd([
      { name: "Home", url: "/" },
      { name: PHASE3C_PUBLIC_COLLECTIONS_LABEL, url: "/series" },
    ]);
    assert.equal(hub["@type"], "BreadcrumbList");
    assert.equal(hub.itemListElement.length, 2);
    assert.equal(hub.itemListElement[0].position, 1);
    assert.equal(hub.itemListElement[1].position, 2);
    assert.equal(hub.itemListElement[0].item, `${site.url}/`);
    assert.equal(hub.itemListElement[1].item, `${site.url}/series`);
    assert.equal(hub.itemListElement[1].name, "Collections");

    const detail = buildBreadcrumbJsonLd([
      { name: "Home", url: "/" },
      { name: "Collections", url: "/series" },
      { name: "French Desserts", url: "/series/french-desserts" },
    ]);
    assert.equal(detail.itemListElement.length, 3);
    assert.equal(detail.itemListElement[2].position, 3);
    assert.equal(detail.itemListElement[2].name, "French Desserts");
    assert.equal(detail.itemListElement[2].item, `${site.url}/series/french-desserts`);

    const cleaned = buildBreadcrumbJsonLd([
      { name: "Home", url: "/" },
      { name: "  ", url: "/series" },
      { name: "Ok", url: "" },
    ]);
    assert.equal(cleaned.itemListElement.length, 1);
    assert.equal(absolutePublicUrl("/series"), `${site.url}/series`);
  });

  it("19. Preview emits no public BreadcrumbList; public pages wire helper", () => {
    const view = read("../components/series/SeriesDetailView.tsx");
    const index = read("../app/series/page.tsx");
    const preview = read("../app/admin/(preview)/series/[id]/preview/page.tsx");
    assert.match(view, /buildBreadcrumbJsonLd/);
    assert.match(view, /showBreadcrumbJsonLd/);
    assert.match(index, /buildBreadcrumbJsonLd/);
    assert.match(preview, /mode="preview"/);
    assert.doesNotMatch(preview, /buildBreadcrumbJsonLd/);
  });
});

describe("Collections Phase 4 — ItemList", () => {
  it("20–28. healthy ItemList retained; empty/preview omit; no CollectionPage/Recipe schema", () => {
    const series = sampleSeries();
    const json = seriesItemListJsonLd(series);
    assert.equal(json["@context"], "https://schema.org");
    assert.equal(json["@type"], "ItemList");
    assert.equal(json.numberOfItems, 1);
    assert.equal(json.itemListElement[0].position, 1);
    assert.equal(json.itemListElement[0].url, `${site.url}/recipes/classic-baguettes`);
    assert.equal(json.url, `${site.url}/series/french-desserts`);

    const videoOnly = seriesItemListJsonLd(
      sampleSeries({
        items: [
          sampleItem({
            recipeSlug: null,
            youtubeVideoId: "vid123",
            watchUrl: "https://www.youtube.com/watch?v=vid123",
            watchExternal: true,
          }),
        ],
      }),
    );
    assert.equal(videoOnly.itemListElement[0].url, "https://www.youtube.com/watch?v=vid123");

    const view = read("../components/series/SeriesDetailView.tsx");
    assert.match(view, /showJsonLd = !isPreview && visibleItemCount > 0/);
    assert.doesNotMatch(view, /CollectionPage/);
    assert.doesNotMatch(view, /recipeJsonLd/);
  });
});

describe("Collections Phase 4 — indexability + sitemap hub", () => {
  it("29–39. empty hub noindex; detail empty noindex; sitemap omits empty hub", () => {
    const index = read("../app/series/page.tsx");
    const detail = read("../app/series/[slug]/page.tsx");
    assert.match(index, /empty \? \{ robots: \{ index: false, follow: true \} \}/);
    assert.match(detail, /robots: \{ index: false, follow: true \}/);
    assert.match(detail, /dynamicParams = true/);

    const withSeries = buildSitemapEntries({
      siteUrl: site.url,
      recipes: [],
      categories: [],
      series: [{ slug: "french-desserts" }],
    });
    const withPaths = sitemapPathnamesFromEntries(withSeries, site.url);
    assert.ok(withPaths.includes("/series"));
    assert.ok(withPaths.includes("/series/french-desserts"));

    const emptyHub = buildSitemapEntries({
      siteUrl: site.url,
      recipes: [],
      categories: [],
      series: [],
    });
    const emptyPaths = sitemapPathnamesFromEntries(emptyHub, site.url);
    assert.equal(emptyPaths.includes("/series"), false);
  });

  it("51–54. static params exclude empties via listPublishedSeries eligibility", () => {
    const series = read("./series.ts");
    assert.match(series, /listSeriesSlugsForStaticParams/);
    assert.match(series, /const cards = await listPublishedSeries\(\)/);
    assert.match(series, /filter\(\(card\) => card\.itemCount > 0\)/);
  });
});

describe("Collections Phase 4 — slug policy + Category warning", () => {
  it("40–44. immutable slug copy; no /collections; save preserves slug", () => {
    const editor = read("../components/admin/SeriesEditor.tsx");
    const actions = read("../app/admin/actions.ts");
    assert.match(editor, /Collection URLs stay fixed after creation/);
    assert.doesNotMatch(editor, /Automatic redirects are not yet created/);
    assert.match(actions, /slug: existing\.slug/);
    assert.doesNotMatch(read("../app/series/page.tsx"), /\/collections/);
  });

  it("45–50. Category clone soft warning is non-blocking", () => {
    const categories = [{ name: "Desserts", slug: "desserts" }];
    assert.equal(
      collectionMatchesCategoryClone({ title: "Desserts", slug: "desserts" }, categories),
      true,
    );
    assert.equal(
      collectionMatchesCategoryClone({ title: "Dessert", slug: "dessert" }, categories),
      true,
    );
    assert.equal(
      collectionMatchesCategoryClone(
        { title: "French Desserts", slug: "french-desserts" },
        categories,
      ),
      false,
    );
    assert.equal(
      collectionMatchesCategoryClone(
        { title: "Easy Breakfast Recipes", slug: "easy-breakfast-recipes" },
        [{ name: "Breakfast", slug: "breakfast" }],
      ),
      false,
    );
    assert.match(COLLECTION_CATEGORY_CLONE_WARNING, /advisory|specific editorial angle|Category/i);
    const editor = read("../components/admin/SeriesEditor.tsx");
    assert.match(editor, /COLLECTION_CATEGORY_CLONE_WARNING/);
    assert.match(editor, /collectionMatchesCategoryClone/);
    assert.doesNotMatch(editor, /categoryCloneWarning.*throw|block.*categoryClone/);
  });
});

describe("Collections Phase 4 — docs + Admin SEO guidance", () => {
  it("documents SEO title/H1, empty publish, BreadcrumbList, recipes-only search", () => {
    const series = read("./admin-documentation/topics/series.ts");
    const editor = read("./admin-documentation/topics/series-editor.ts");
    const ui = read("../components/admin/SeriesEditor.tsx");
    assert.match(series, /SEO title overrides/);
    assert.match(series, /BreadcrumbList/);
    assert.match(series, /recipes-only/);
    assert.match(editor, /does not change the H1/);
    assert.match(editor, /150–160 characters/);
    assert.match(editor, /not used as metadata fallback/);
    assert.match(ui, /Aim for about 150–160 characters/);
    assert.match(ui, /Intro is not used as metadata fallback/);
  });
});
