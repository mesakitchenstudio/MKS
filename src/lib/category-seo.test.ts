import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { site } from "@/data/site";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumb-jsonld";
import {
  CATEGORY_INDEXABLE_MIN_RECIPES,
  categoryItemListJsonLd,
  categoryMetaDescription,
  categoryPublicPath,
  isCategoryIndexable,
} from "@/lib/category-seo";
import {
  isDiscoveryListingNoIndex,
  parseDiscoveryParams,
} from "@/lib/recipe-discovery";
import { buildSitemapEntries, sitemapPathnamesFromEntries } from "@/lib/sitemap-entries";
import { PRIMARY_CATEGORY_SLUGS } from "@/lib/recipe-primary-taxonomy";

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("Category SEO Phase A — helpers", () => {
  it("1–8. path, indexability, and description fallback", () => {
    assert.equal(categoryPublicPath("desserts"), "/category/desserts");
    assert.equal(CATEGORY_INDEXABLE_MIN_RECIPES, 3);
    assert.equal(isCategoryIndexable(0), false);
    assert.equal(isCategoryIndexable(1), false);
    assert.equal(isCategoryIndexable(2), false);
    assert.equal(isCategoryIndexable(3), true);
    assert.equal(isCategoryIndexable(4), true);
    assert.equal(categoryMetaDescription("Cobblers and cakes."), "Cobblers and cakes.");
    assert.match(categoryMetaDescription("  "), /Recipes filed under this category/);
    assert.equal(site.url, "https://www.mesakitchenstudio.com");
  });
});

describe("Category SEO Phase A — page wiring", () => {
  it("wires canonical, thin robots, OG, BreadcrumbList, ItemList, empty Category copy", () => {
    const page = read("../app/category/[slug]/page.tsx");
    assert.match(page, /alternates: \{ canonical: path \}/);
    assert.match(page, /robots: \{ index: false, follow: true \}/);
    assert.match(page, /isCategoryIndexable/);
    assert.match(page, /buildBreadcrumbJsonLd/);
    assert.match(page, /categoryItemListJsonLd/);
    assert.match(page, /Recipes for this category are coming soon/);
    assert.doesNotMatch(page, /this collection/i);
    assert.doesNotMatch(page, /recipeJsonLd|CollectionPage/);
    assert.match(page, /\{category\.name\}/);
    assert.match(page, /openGraph/);
  });
});

describe("Category SEO Phase A — structured data", () => {
  it("9–17. BreadcrumbList and ItemList shapes", () => {
    const crumbs = buildBreadcrumbJsonLd([
      { name: "Home", url: "/" },
      { name: "Recipes", url: "/recipes" },
      { name: "Desserts", url: "/category/desserts" },
    ]);
    assert.equal(crumbs["@type"], "BreadcrumbList");
    assert.equal(crumbs.itemListElement.length, 3);
    assert.equal(crumbs.itemListElement[0].position, 1);
    assert.equal(crumbs.itemListElement[2].item, `${site.url}/category/desserts`);

    const list = categoryItemListJsonLd({
      name: "Desserts",
      description: "Sweet endings.",
      slug: "desserts",
      recipes: [
        { title: "Cake", slug: "olive-oil-cake" },
        { title: "Cookie", slug: "chocolate-chip" },
      ],
    });
    assert.equal(list["@type"], "ItemList");
    assert.equal(list.numberOfItems, 2);
    assert.equal(list.itemListElement[0].position, 1);
    assert.equal(list.itemListElement[0].url, `${site.url}/recipes/olive-oil-cake`);
    assert.equal(list.url, `${site.url}/category/desserts`);

    const empty = categoryItemListJsonLd({
      name: "Desserts",
      slug: "desserts",
      recipes: [],
    });
    assert.equal(empty.numberOfItems, 0);
    assert.equal(empty.itemListElement.length, 0);
  });
});

describe("Category SEO Phase A — sitemap eligibility", () => {
  it("24–25. thin Categories omitted; eligible included", () => {
    const entries = buildSitemapEntries({
      siteUrl: site.url,
      recipes: [],
      categories: [{ slug: "desserts" }, { slug: "thin" }],
      series: [],
    });
    // buildSitemapEntries includes whatever callers pass — sitemap.ts filters first.
    const paths = sitemapPathnamesFromEntries(entries, site.url);
    assert.ok(paths.includes("/category/desserts"));

    const sitemap = read("../app/sitemap.ts");
    assert.match(sitemap, /isCategoryIndexable/);
    assert.match(sitemap, /recipeCountByCategory/);
  });
});

describe("Category SEO Phase A — internal linking", () => {
  it("26–30. public taxonomy → /category; catalogue filter remains /recipes?category=", () => {
    const homepage = read("../components/HomepageBrowseCategories.tsx");
    const footer = read("../components/SiteFooter.tsx");
    const header = read("../components/SiteHeader.tsx");
    const discovery = read("../components/RecipeDiscovery.tsx");
    const recipe = read("../components/recipe/RecipeDetailView.tsx");

    assert.match(homepage, /categoryPublicPath\(category\.slug\)/);
    assert.doesNotMatch(homepage, /buildRecipesUrl/);
    assert.match(footer, /categoryPublicPath\(category\.slug\)/);
    assert.match(header, /categoryPublicPath\(link\.slug\)/);
    assert.match(recipe, /href=\{`\/category\/\$\{category\}`\}/);
    assert.match(discovery, /buildRecipesUrl|category/);
    assert.match(discovery, /listPopulatedDiscoveryCategories|params\.category|category:/);

    for (const slug of PRIMARY_CATEGORY_SLUGS) {
      assert.equal(categoryPublicPath(slug), `/category/${slug}`);
    }
  });
});

describe("Category SEO Phase A — faceted SEO", () => {
  it("31–42. clean hub indexable; filters and sort=alpha noindex", () => {
    assert.equal(isDiscoveryListingNoIndex(parseDiscoveryParams({})), false);
    assert.equal(isDiscoveryListingNoIndex(parseDiscoveryParams({ sort: "latest" })), false);
    assert.equal(isDiscoveryListingNoIndex(parseDiscoveryParams({ q: "chicken" })), true);
    assert.equal(isDiscoveryListingNoIndex(parseDiscoveryParams({ category: "desserts" })), true);
    assert.equal(isDiscoveryListingNoIndex(parseDiscoveryParams({ collection: "summer" })), true);
    assert.equal(isDiscoveryListingNoIndex(parseDiscoveryParams({ time: "30" })), true);
    assert.equal(isDiscoveryListingNoIndex(parseDiscoveryParams({ video: "1" })), true);
    assert.equal(isDiscoveryListingNoIndex(parseDiscoveryParams({ cuisine: "French" })), true);
    assert.equal(isDiscoveryListingNoIndex(parseDiscoveryParams({ method: "Baking" })), true);
    assert.equal(isDiscoveryListingNoIndex(parseDiscoveryParams({ sort: "alpha" })), true);
    assert.equal(isDiscoveryListingNoIndex(parseDiscoveryParams({ ingredients: "egg" })), true);
    assert.equal(
      isDiscoveryListingNoIndex(parseDiscoveryParams({ excludeIngredients: "peanut" })),
      true,
    );
    assert.equal(
      isDiscoveryListingNoIndex(
        parseDiscoveryParams({ cuisine: "french", method: "baking", time: "30" }),
      ),
      true,
    );

    const recipesPage = read("../app/recipes/page.tsx");
    assert.match(recipesPage, /isDiscoveryListingNoIndex/);
    assert.match(recipesPage, /canonical: "\/recipes"/);
    assert.match(recipesPage, /follow: true/);
  });
});

describe("Category SEO Phase A — docs + no new hubs", () => {
  it("documents ownership and forbids new SEO hub routes", () => {
    const categories = read("./admin-documentation/topics/categories.ts");
    const series = read("./admin-documentation/topics/series.ts");
    assert.match(categories, /\/category\/\[slug\]/);
    assert.match(categories, /fewer than 3 published recipes/);
    assert.match(categories, /French Desserts|Easy Breakfast/);
    assert.match(series, /compound editorial/);
    assert.doesNotMatch(
      read("../app/category/[slug]/page.tsx"),
      /\/cuisine\/|\/method\/|\/ingredient\/|\/topics\//,
    );
  });
});
