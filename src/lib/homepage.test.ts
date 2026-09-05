import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { homepageConfig } from "../data/homepage.ts";
import { recipes } from "../data/recipes.ts";
import type { Recipe } from "../data/types.ts";
import {
  PRIMARY_CATEGORY_LABELS,
  PRIMARY_CATEGORY_SLUGS,
} from "./recipe-primary-taxonomy.ts";
import { isHomepageEligibleRecipe } from "./homepage-eligibility.ts";
import { RECIPE_IMAGE_FALLBACK } from "./recipe-images.ts";
import {
  homepageUsedRecipeSlugs,
  resolveHomepage,
  summarizeHomepageCandidates,
} from "./homepage.ts";

function cloneRecipe(recipe: Recipe, patch: Partial<Recipe> = {}): Recipe {
  return { ...recipe, ...patch };
}

const COOKIES_SLUG = "chocolate-chunk-cookies";

describe("homepage curation", () => {
  it("uses manual featured slug when eligible", () => {
    const page = resolveHomepage(recipes, { featuredRecipeSlug: "salsa-verde" });
    assert.equal(page.hero?.slug, "salsa-verde");
    assert.equal(page.heroEyebrow, "From the studio");
  });

  it("falls back when manual featured slug is ineligible", () => {
    const page = resolveHomepage(recipes, { featuredRecipeSlug: "breakfast-tortillas" });
    assert.notEqual(page.hero?.slug, "breakfast-tortillas");
    assert.ok(page.hero);
  });

  it("uses latest eligible recipe when no manual feature", () => {
    const page = resolveHomepage(recipes, { featuredRecipeSlug: null });
    assert.ok(page.hero);
    assert.equal(isHomepageEligibleRecipe(page.hero!), true);
  });

  it("excludes hero from latest and caps at four", () => {
    const page = resolveHomepage(recipes, { featuredRecipeSlug: "salsa-verde" });
    assert.ok(page.latest.length <= 4);
    assert.ok(!page.latest.some((recipe) => recipe.slug === page.hero?.slug));
  });

  it("orders latest by published date newest first", () => {
    const page = resolveHomepage(recipes, { featuredRecipeSlug: null });
    if (page.latest.length < 2) return;
    const first = Date.parse(page.latest[0]!.publishedAt);
    const second = Date.parse(page.latest[1]!.publishedAt);
    assert.ok(first >= second);
  });

  it("excludes recipes without usable images from hero and latest", () => {
    const page = resolveHomepage(recipes, { featuredRecipeSlug: null });
    for (const recipe of [page.hero, ...page.latest]) {
      if (!recipe) continue;
      assert.equal(isHomepageEligibleRecipe(recipe), true);
    }
    assert.ok(!page.latest.some((recipe) => recipe.slug === "breakfast-tortillas"));
    assert.ok(!page.latest.some((recipe) => recipe.slug === "roasted-market-vegetables"));
  });

  it("does not resolve legacy homepage collection modules", () => {
    const page = resolveHomepage(recipes, { featuredRecipeSlug: null });
    assert.equal("collections" in page, false);
  });

  it("supports text-only hero when no eligible recipes exist", () => {
    const ineligible = recipes.map((recipe) => cloneRecipe(recipe, { image: "" }));
    const page = resolveHomepage(ineligible, { featuredRecipeSlug: null });
    assert.equal(page.hero, null);
    assert.equal(page.latest.length, 0);
  });

  it("keeps legacy collection slug map for /recipes URLs", () => {
    const ids = homepageConfig.collections.map((collection) => collection.id);
    assert.ok(ids.includes("summer-at-the-table"));
    assert.ok(ids.includes("cookies-and-sweets"));
    assert.ok(ids.includes("best-breakfast"));
    assert.ok(ids.includes("easy-dinners"));
  });

  it("uses All recipes CTA config", () => {
    assert.equal(homepageConfig.latest.viewMoreLabel, "All recipes →");
    assert.equal(homepageConfig.latest.href, "/recipes");
  });

  it("lists approved browse categories from primary taxonomy", () => {
    const expected = [
      "breakfast",
      "breads",
      "main-dishes",
      "side-dishes",
      "desserts",
      "drinks",
      "toppings",
    ];
    assert.deepEqual([...PRIMARY_CATEGORY_SLUGS], expected);
    assert.equal(PRIMARY_CATEGORY_LABELS.toppings, "Condiments");
    assert.ok(!PRIMARY_CATEGORY_SLUGS.includes("cookies" as never));
    assert.ok(!PRIMARY_CATEGORY_SLUGS.includes("cakes" as never));
  });

  it("disables legacy homepage collection modules in config", () => {
    for (const collection of homepageConfig.collections) {
      assert.equal(collection.enabled, false);
    }
  });

  it("suppresses footer newsletter on homepage only", () => {
    const chrome = readFileSync(join(process.cwd(), "src/components/PublicChrome.tsx"), "utf8");
    assert.match(chrome, /hideNewsletter=\{pathname === "\/"\}/);
    const footer = readFileSync(join(process.cwd(), "src/components/SiteFooter.tsx"), "utf8");
    assert.match(footer, /hideNewsletter/);
  });

  it("hides latest when fewer than three candidates remain after hero", () => {
    const tinyCatalog = recipes.slice(0, 4).map((recipe) =>
      cloneRecipe(recipe, { image: RECIPE_IMAGE_FALLBACK }),
    );
    const oneGood = cloneRecipe(recipes[0]!);
    const page = resolveHomepage([oneGood, ...tinyCatalog], { featuredRecipeSlug: null });
    assert.equal(page.hero?.slug, oneGood.slug);
    assert.equal(page.latest.length, 0);
  });

  it("renders from kitchen only when three unique eligible recipes are configured", () => {
    const slugs = ["herb-focaccia", "citrus-olive-oil-cake", "salsa-verde"];
    const page = resolveHomepage(recipes, {
      featuredRecipeSlug: COOKIES_SLUG,
      fromKitchenSlugs: slugs,
    });
    assert.equal(page.fromKitchen.length, 3);
    assert.deepEqual(page.fromKitchen.map((r) => r.slug), slugs);
  });

  it("skips from kitchen when fewer than three eligible unique recipes", () => {
    const page = resolveHomepage(recipes, {
      featuredRecipeSlug: COOKIES_SLUG,
      fromKitchenSlugs: ["herb-focaccia", "citrus-olive-oil-cake"],
    });
    assert.equal(page.fromKitchen.length, 0);
  });

  it("does not duplicate slugs across hero, latest, and from kitchen", () => {
    const page = resolveHomepage(recipes, {
      featuredRecipeSlug: COOKIES_SLUG,
      fromKitchenSlugs: [
        "herb-focaccia",
        "citrus-olive-oil-cake",
        "salsa-verde",
        COOKIES_SLUG,
      ],
    });
    const used = homepageUsedRecipeSlugs(page);
    const unique = new Set(used);
    assert.equal(unique.size, used.length);
    assert.ok(!page.latest.some((recipe) => recipe.slug === COOKIES_SLUG));
    assert.ok(!page.fromKitchen.some((recipe) => recipe.slug === COOKIES_SLUG));
  });

  it("regression: chocolate chunk cookies cannot appear in hero AND latest AND from kitchen", () => {
    const page = resolveHomepage(recipes, {
      featuredRecipeSlug: COOKIES_SLUG,
      fromKitchenSlugs: [
        COOKIES_SLUG,
        "herb-focaccia",
        "citrus-olive-oil-cake",
        "salsa-verde",
      ],
    });
    assert.equal(page.hero?.slug, COOKIES_SLUG);
    assert.ok(!page.latest.some((recipe) => recipe.slug === COOKIES_SLUG));
    assert.ok(!page.fromKitchen.some((recipe) => recipe.slug === COOKIES_SLUG));
    const used = homepageUsedRecipeSlugs(page);
    const cookieCount = used.filter((slug) => slug === COOKIES_SLUG).length;
    assert.equal(cookieCount, 1);
  });

  it("static catalog yields a varied homepage candidate set", () => {
    const summary = summarizeHomepageCandidates(recipes, { featuredRecipeSlug: null });
    assert.ok(summary.hardEligibleCount >= 8);
    assert.ok(summary.latestCandidates.length >= 3);
    assert.ok(summary.heroCandidates.length >= 3);
  });

  it("keeps Latest chronological and not wired to kitchen/featured curation slots", () => {
    const homepageSrc = readFileSync(join(process.cwd(), "src/lib/homepage.ts"), "utf8");
    assert.match(homepageSrc, /pool\.slice\(0, LATEST_MAX\)/);
    assert.doesNotMatch(homepageSrc, /fromKitchenSlugs.*latest|latest.*fromKitchenSlugs/);
    assert.match(homepageSrc, /pickFromKitchen/);
  });
});

describe("homepage Phase 1 discovery UI", () => {
  const root = process.cwd();
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");

  it("strengthens hero affordance inside a single recipe link", () => {
    const hero = read("src/components/HomepageHero.tsx");
    assert.match(hero, /href=\{`\/recipes\/\$\{recipe\.slug\}`\}/);
    assert.match(hero, /View recipe →/);
    assert.match(hero, /aria-hidden="true"/);
    assert.match(hero, /from-ink\/95/);
    assert.equal((hero.match(/<Link\b/g) || []).length, 1);
    assert.doesNotMatch(hero, /<a\b/);
    assert.doesNotMatch(hero, /href=.*\n.*href=/s);
  });

  it("wires Featured Series after Latest and before Browse from listPublishedSeries", () => {
    const page = read("src/app/page.tsx");
    assert.match(page, /listPublishedSeries/);
    assert.match(page, /HomepageFeaturedSeries/);
    assert.match(page, /publishedSeries\[0\]/);
    assert.match(page, /featuredSeries \? <HomepageFeaturedSeries/);

    const body = page.slice(page.indexOf("return ("));
    const latestIdx = body.indexOf("<HomepageLatestSection");
    const seriesIdx = body.indexOf("<HomepageFeaturedSeries");
    const browseIdx = body.indexOf("<HomepageBrowseCategories");
    const kitchenIdx = body.indexOf("<HomepageFromKitchenSection");
    assert.ok(latestIdx >= 0 && seriesIdx > latestIdx);
    assert.ok(browseIdx > seriesIdx);
    assert.ok(kitchenIdx > browseIdx);
  });

  it("renders a restrained Featured Series bridge to /series/{slug}", () => {
    const block = read("src/components/HomepageFeaturedSeries.tsx");
    assert.match(block, /PublicSeriesCard/);
    assert.match(block, /href = `\/series\/\$\{series\.slug\}`/);
    assert.match(block, /Featured series/);
    assert.match(block, /formatHomepageSeriesMetaLabel/);
    assert.match(block, /Explore the series →/);
    assert.match(block, /ariaLabel=\{exploreLabel\}/);
    assert.match(block, /event="series_item_click"/);
    assert.match(block, /placement="homepage_series"/);
    assert.match(block, /SeriesItemTrackLink/);
    assert.doesNotMatch(block, /<iframe|youtube\.com\/embed|Watch the full series on YouTube/i);
    assert.doesNotMatch(block, /youtubePlaylistUrl|playlistId/);
    assert.doesNotMatch(block, /getDb\(|prisma/i);
  });

  it("keeps Browse taxonomy text-first with a compact editorial link cluster", () => {
    const browse = read("src/components/HomepageBrowseCategories.tsx");
    assert.match(browse, /Browse the table/);
    assert.match(browse, /Browse recipes/);
    assert.match(browse, /PRIMARY_CATEGORY_SLUGS\.map/);
    assert.match(browse, /buildRecipesUrl\(\{ category: slug \}\)/);
    assert.match(browse, /min-h-11/);
    assert.match(browse, /inline-flex/);
    assert.match(browse, /max-w-3xl/);
    assert.match(browse, /grid-cols-2/);
    assert.match(browse, /sm:grid-cols-3/);
    assert.match(browse, /md:grid-cols-4/);
    assert.doesNotMatch(browse, /aspect-|Image|img |rounded-full bg-/);
  });

  it("uses Cooking Series eyebrow on Featured Series without From the studio", () => {
    const block = read("src/components/HomepageFeaturedSeries.tsx");
    assert.match(block, /Cooking Series/);
    assert.doesNotMatch(block, /From the studio/);
    assert.match(block, /Featured series/);
    assert.match(block, /event="series_item_click"/);
  });

  it("preserves homepage section order through Studio closing", () => {
    const page = read("src/app/page.tsx");
    const body = page.slice(page.indexOf("return ("));
    const heroIdx = body.indexOf('bg-ink text-cream');
    const latestIdx = body.indexOf("<HomepageLatestSection");
    const seriesIdx = body.indexOf("<HomepageFeaturedSeries");
    const browseIdx = body.indexOf("<HomepageBrowseCategories");
    const studioIdx = body.indexOf("A small kitchen, tested recipes");
    assert.ok(heroIdx >= 0 && latestIdx > heroIdx);
    assert.ok(seriesIdx > latestIdx);
    assert.ok(browseIdx > seriesIdx);
    assert.ok(studioIdx > browseIdx);
  });

  it("keeps Featured Series analytics and omits YouTube chrome after polish", () => {
    const block = read("src/components/HomepageFeaturedSeries.tsx");
    assert.match(block, /listPublishedSeries|PublicSeriesCard|publishedSeries\[0\]|series\.slug/);
    assert.match(block, /formatHomepageSeriesMetaLabel\(series\.itemCount, series\.videoCount\)/);
    assert.match(block, /event="series_item_click"/);
    assert.match(block, /placement="homepage_series"/);
    assert.doesNotMatch(block, /<iframe|youtube\.com\/embed|Watch the full series on YouTube|YouTube logo|play icon/i);
  });

  it("clamps Latest recipe excerpts to two lines", () => {
    const latest = read("src/components/HomepageLatestSection.tsx");
    assert.match(latest, /excerptLines=\{2\}/);
    const card = read("src/components/RecipeGridCard.tsx");
    assert.match(card, /excerptLines\?: 2 \| 3/);
    assert.match(card, /line-clamp-2/);
  });

  it("aligns newsletter Subscribe focus-visible with public CTA pattern", () => {
    const form = read("src/components/NewsletterForm.tsx");
    assert.match(form, /focus-visible:outline-terracotta/);
    assert.match(form, /type="submit"/);
    assert.match(form, /htmlFor=\{inputId\}/);
    assert.match(form, /sr-only/);
    assert.match(form, /Email address/);
    assert.match(form, /placeholder:text-sand\/60/);
  });
});

describe("homepage Phase 3 visual enrichment", () => {
  const root = process.cwd();
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");

  it("loads previewItems on PublicSeriesCard from listPublishedSeries", () => {
    const types = read("src/lib/series-types.ts");
    assert.match(types, /previewItems: PublicSeriesPreviewItem\[\]/);
    assert.match(types, /export type PublicSeriesPreviewItem/);
    const seriesLib = read("src/lib/series.ts");
    assert.match(seriesLib, /pickSeriesPreviewItems/);
    assert.match(seriesLib, /previewItems: pickSeriesPreviewItems\(items, 2\)/);
  });

  it("renders Featured Series with quiet item previews and no YouTube chrome", () => {
    const block = read("src/components/HomepageFeaturedSeries.tsx");
    assert.match(block, /previewItems/);
    assert.match(block, /SeriesPreviewRow|item\.thumbnail/);
    assert.match(block, /itemPosition=\{item\.position\}/);
    assert.match(block, /placement="homepage_series"/);
    assert.match(block, /href=\{seriesHref\}/);
    assert.doesNotMatch(block, /<iframe|youtube\.com\/embed|Watch the full series on YouTube/i);
    assert.doesNotMatch(block, /youtubePlaylistUrl/);
  });

  it("renders From the kitchen as lead plus two supporting", () => {
    const kitchen = read("src/components/HomepageFromKitchenSection.tsx");
    assert.match(kitchen, /recipes\.length !== 3/);
    assert.match(kitchen, /\[lead, supportA, supportB\]/);
    assert.match(kitchen, /large/);
    assert.match(kitchen, /lg:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(0,1fr\)\]/);
    assert.doesNotMatch(kitchen, /lg:grid-cols-3/);
  });

  it("keeps Browse as a text-only editorial index without recipe counts", () => {
    const page = read("src/app/page.tsx");
    assert.doesNotMatch(page, /countRecipesByPrimaryCategory|categoryCounts/);
    assert.doesNotMatch(page, /recipeMatchesPrimaryCategory/);
    const browse = read("src/components/HomepageBrowseCategories.tsx");
    assert.match(browse, /border-t border-line/);
    assert.match(browse, /PRIMARY_CATEGORY_SLUGS\.map/);
    assert.match(browse, /PRIMARY_CATEGORY_LABELS\[slug\]/);
    assert.doesNotMatch(browse, /categoryCounts|tabular-nums|recipeMatchesPrimaryCategory/);
    assert.doesNotMatch(browse, /aspect-|Image|img /);
  });

  it("emphasizes Latest food presence without changing card link model", () => {
    const latest = read("src/components/HomepageLatestSection.tsx");
    assert.match(latest, /imageAspect="4\/3"/);
    assert.match(latest, /excerptLines=\{2\}/);
    assert.match(latest, /border-b border-line/);
    assert.equal((latest.match(/<RecipeGridCard\b/g) || []).length, 1);
  });

  it("nudges hero photo prominence on large desktop only", () => {
    const page = read("src/app/page.tsx");
    assert.match(page, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1\.2fr\)\]/);
    const hero = read("src/components/HomepageHero.tsx");
    assert.match(hero, /xl:aspect-\[10\/13\]/);
    assert.equal((hero.match(/<Link\b/g) || []).length, 1);
  });

  it("composes Studio and newsletter as one ending without a bordered form box", () => {
    const page = read("src/app/page.tsx");
    assert.match(page, /aria-labelledby="studio-heading"/);
    assert.match(page, /Never miss a recipe/);
    assert.match(page, /NewsletterForm/);
    assert.doesNotMatch(page, /border border-line bg-cream p-8/);
  });
});

describe("homepage Phase 4 editorial interactions", () => {
  const root = process.cwd();
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");

  it("labels Featured Series previews as PART n from preview order", () => {
    const block = read("src/components/HomepageFeaturedSeries.tsx");
    assert.match(block, /partNumber=\{index \+ 1\}/);
    assert.match(block, /Part \{partNumber\}/);
    assert.match(block, /aria-hidden="true"/);
    assert.match(block, /previews\.map\(\(item, index\)/);
    assert.match(block, /previewItems\.slice\(0, 2\)/);
    assert.match(block, /Explore the series →/);
    assert.equal((block.match(/Explore the series →/g) || []).length, 1);
    assert.doesNotMatch(block, /<iframe|youtube\.com\/embed|YouTube logo|play icon|rounded-full bg-/i);
    assert.doesNotMatch(block, /previews\.length > 0 \? null/);
  });

  it("keeps Latest single-link cards with restrained hover and focus polish", () => {
    const latest = read("src/components/HomepageLatestSection.tsx");
    assert.match(latest, /excerptLines=\{2\}/);
    assert.match(latest, /imageAspect="4\/3"/);
    const card = read("src/components/RecipeGridCard.tsx");
    assert.match(card, /group flex h-full flex-col/);
    assert.match(card, /href=\{`\/recipes\/\$\{recipe\.slug\}`\}/);
    assert.match(card, /motion-safe:group-hover:scale-\[1\.025\]/);
    assert.match(card, /motion-safe:group-focus-visible:scale-\[1\.025\]/);
    assert.match(card, /group-hover:text-terracotta/);
    assert.match(card, /group-focus-visible:text-terracotta/);
    assert.match(card, /overflow-hidden/);
  });

  it("gives Studio newsletter a warmer paper chapter against Browse paper", () => {
    const page = read("src/app/page.tsx");
    assert.match(page, /border-y border-line bg-cream"/);
    assert.doesNotMatch(page, /bg-cream\/30/);
    assert.doesNotMatch(page, /border border-line bg-cream p-8/);
    const browse = read("src/components/HomepageBrowseCategories.tsx");
    assert.match(browse, /bg-paper/);
  });

  it("preserves From the kitchen exact-three asymmetric encore", () => {
    const page = read("src/app/page.tsx");
    assert.match(page, /homepage\.fromKitchen\.length === 3/);
    const kitchen = read("src/components/HomepageFromKitchenSection.tsx");
    assert.match(kitchen, /recipes\.length !== 3/);
    assert.match(kitchen, /\[lead, supportA, supportB\]/);
  });

  it("keeps homepage hierarchy Hero → Latest → Series → Browse → kitchen → Studio", () => {
    const page = read("src/app/page.tsx");
    const body = page.slice(page.indexOf("return ("));
    const heroIdx = body.indexOf("bg-ink text-cream");
    const latestIdx = body.indexOf("<HomepageLatestSection");
    const seriesIdx = body.indexOf("<HomepageFeaturedSeries");
    const browseIdx = body.indexOf("<HomepageBrowseCategories");
    const kitchenIdx = body.indexOf("<HomepageFromKitchenSection");
    const studioIdx = body.indexOf('aria-labelledby="studio-heading"');
    assert.ok(heroIdx >= 0 && latestIdx > heroIdx);
    assert.ok(seriesIdx > latestIdx);
    assert.ok(browseIdx > seriesIdx);
    assert.ok(kitchenIdx > browseIdx);
    assert.ok(studioIdx > kitchenIdx);
  });
});

describe("homepage final launch QA contracts", () => {
  const root = process.cwd();
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");

  it("keeps a single homepage H1 in the hero and H2 section landmarks", () => {
    const page = read("src/app/page.tsx");
    assert.equal((page.match(/<h1\b/g) || []).length, 1);
    assert.match(page, /Recipes for the table\./);
    const latest = read("src/components/HomepageLatestSection.tsx");
    assert.match(latest, /<h2 id="latest-recipes-heading"/);
    const series = read("src/components/HomepageFeaturedSeries.tsx");
    assert.match(series, /<h2 id="featured-series-heading"/);
    const browse = read("src/components/HomepageBrowseCategories.tsx");
    assert.match(browse, /<h2 id="browse-recipes-heading"/);
    assert.match(page, /<h2 id="studio-heading"/);
    assert.doesNotMatch(page, /<h2[^>]*>The studio/);
    assert.doesNotMatch(series, /<h[1-6][^>]*>Part /);
  });

  it("wires homepage destinations to known public routes", () => {
    const page = read("src/app/page.tsx");
    assert.match(page, /href="\/recipes"/);
    assert.match(page, /href="\/about"/);
    const hero = read("src/components/HomepageHero.tsx");
    assert.match(hero, /href=\{`\/recipes\/\$\{recipe\.slug\}`\}/);
    assert.equal((hero.match(/<Link\b/g) || []).length, 1);
    const latest = read("src/components/HomepageLatestSection.tsx");
    assert.match(latest, /href=\{href\}/);
    assert.match(latest, /RecipeGridCard/);
    const series = read("src/components/HomepageFeaturedSeries.tsx");
    assert.match(series, /href = `\/series\/\$\{series\.slug\}`/);
    assert.match(series, /href=\{seriesHref\}/);
    assert.match(series, /placement="homepage_series"/);
    const browse = read("src/components/HomepageBrowseCategories.tsx");
    assert.match(browse, /buildRecipesUrl\(\{ category: slug \}\)/);
    assert.match(browse, /PRIMARY_CATEGORY_SLUGS\.map/);
  });

  it("keeps hero overlay contrast via strong ink gradient without an opaque text card", () => {
    const hero = read("src/components/HomepageHero.tsx");
    assert.match(hero, /from-ink\/95/);
    assert.match(hero, /via-ink\/70/);
    assert.match(hero, /text-cream/);
    assert.doesNotMatch(hero, /bg-ink\/100|bg-paper|rounded-xl bg-/);
  });

  it("labels desktop and mobile header search accessibly and encodes queries", () => {
    const header = read("src/components/SiteHeader.tsx");
    assert.match(header, /htmlFor="header-search"/);
    assert.match(header, /htmlFor="header-search-mobile"/);
    assert.match(header, /encodeURIComponent\(next\)/);
    assert.match(header, /\/recipes\?q=\$\{encodeURIComponent\(next\)\}/);
    assert.match(header, /next \? `\/recipes\?q=/);
  });
});
