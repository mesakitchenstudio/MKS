import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { megaMenu } from "@/data/categories";
import { buildRecipesUrl } from "@/lib/recipe-discovery";
import {
  PUBLIC_HEADER_NAV_FOCUS,
  RECIPES_DISCLOSURE_LABEL,
  RECIPES_DROPDOWN_ID,
  isRecipesSectionActive,
  recipesNavAriaCurrent,
} from "@/lib/public-header-recipes";
import { publicMobileNavLabels } from "@/lib/public-nav";
import {
  PRIMARY_CATEGORY_LABELS,
  PRIMARY_CATEGORY_SLUGS,
  type PrimaryCategorySlug,
} from "@/lib/recipe-primary-taxonomy";

const siteHeaderSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../components/SiteHeader.tsx"),
  "utf8",
);

/** Desktop Recipes dropdown panel only (excludes header search and mobile nav). */
function desktopRecipesPanelSource() {
  const start = siteHeaderSource.indexOf(`id={RECIPES_DROPDOWN_ID}`);
  assert.ok(start >= 0, "desktop recipes dropdown panel missing");
  const afterStart = siteHeaderSource.slice(start);
  const end = afterStart.indexOf(") : null}");
  assert.ok(end >= 0, "desktop recipes dropdown close marker missing");
  return afterStart.slice(0, end);
}

describe("public header Recipes active state", () => {
  it("marks /recipes and recipe detail paths as the Recipes section", () => {
    assert.equal(isRecipesSectionActive("/recipes"), true);
    assert.equal(isRecipesSectionActive("/recipes/herb-focaccia"), true);
    assert.equal(isRecipesSectionActive("/videos"), false);
    assert.equal(isRecipesSectionActive("/about"), false);
    assert.equal(isRecipesSectionActive("/"), false);
  });

  it("uses aria-current page on the catalogue and location on recipe detail", () => {
    assert.equal(recipesNavAriaCurrent("/recipes"), "page");
    assert.equal(recipesNavAriaCurrent("/recipes/herb-focaccia"), "location");
    assert.equal(recipesNavAriaCurrent("/videos"), undefined);
  });
});

describe("public header Recipes categories", () => {
  it("keeps megaMenu order and discovery URLs, including Condiments → toppings", () => {
    assert.equal(megaMenu.length, 1);
    assert.deepEqual([...megaMenu[0].slugs], [...PRIMARY_CATEGORY_SLUGS]);

    const entries = megaMenu[0].slugs.map((slug) => ({
      label: PRIMARY_CATEGORY_LABELS[slug as PrimaryCategorySlug],
      href: buildRecipesUrl({ category: slug }),
    }));

    assert.deepEqual(
      entries.map((entry) => entry.label),
      [
        "Breakfast",
        "Breads",
        "Main Dishes",
        "Side Dishes",
        "Desserts",
        "Drinks",
        "Condiments",
      ],
    );

    assert.deepEqual(
      entries.map((entry) => entry.href),
      [
        "/recipes?category=breakfast",
        "/recipes?category=breads",
        "/recipes?category=main-dishes",
        "/recipes?category=side-dishes",
        "/recipes?category=desserts",
        "/recipes?category=drinks",
        "/recipes?category=toppings",
      ],
    );

    const condiments = entries.find((entry) => entry.label === "Condiments");
    assert.equal(condiments?.href, "/recipes?category=toppings");
  });
});

describe("public header Recipes desktop markup contracts", () => {
  it("uses a Recipes link to /recipes and a separate disclosure button", () => {
    assert.match(siteHeaderSource, /href=\{link\.href\}/);
    assert.match(siteHeaderSource, /aria-label=\{RECIPES_DISCLOSURE_LABEL\}/);
    assert.match(siteHeaderSource, /type="button"/);
    assert.match(siteHeaderSource, /aria-expanded=\{megaOpen\}/);
    assert.match(siteHeaderSource, /aria-controls=\{RECIPES_DROPDOWN_ID\}/);
    assert.equal(RECIPES_DROPDOWN_ID, "recipes-dropdown");
    assert.equal(RECIPES_DISCLOSURE_LABEL, "Recipe categories");

    // Caret is not nested inside the Recipes Link: Link closes before the button.
    const recipesGroup = siteHeaderSource.slice(
      siteHeaderSource.indexOf('key={link.href} ref={recipesMenuRef}'),
      siteHeaderSource.indexOf(') : ('),
    );
    const linkClose = recipesGroup.indexOf("</Link>");
    const buttonOpen = recipesGroup.indexOf("<button");
    assert.ok(linkClose >= 0 && buttonOpen > linkClose, "disclosure must be a sibling after Recipes Link");
  });

  it("toggles via disclosure click and closes on Escape, outside, and nav links", () => {
    assert.match(siteHeaderSource, /setMegaOpen\(\(value\) => !value\)/);
    assert.match(siteHeaderSource, /event\.detail > 0/);
    assert.match(siteHeaderSource, /event\.key === "Escape"/);
    assert.match(siteHeaderSource, /disclosureRef\.current\?\.focus\(\)/);
    assert.match(siteHeaderSource, /window\.addEventListener\("mousedown"/);
    assert.match(siteHeaderSource, /recipesMenuRef\.current\.contains/);
    assert.match(siteHeaderSource, /onClick=\{closeMenus\}/);
    assert.doesNotMatch(siteHeaderSource, /onMouseEnter/);
    assert.doesNotMatch(siteHeaderSource, /onMouseLeave/);
  });

  it("keeps list/link semantics without application menu roles", () => {
    assert.doesNotMatch(siteHeaderSource, /role=["']menu["']/);
    assert.doesNotMatch(siteHeaderSource, /role=["']menuitem["']/);
    assert.match(siteHeaderSource, /<ul key=\{column\.label\} className="space-y-2">/);
  });

  it("removes the desktop RECIPES eyebrow, widens the panel, and separates View all", () => {
    const desktop = desktopRecipesPanelSource();
    assert.match(desktop, /w-\[17rem\]/);
    assert.match(desktop, /View all recipes →/);
    assert.match(desktop, /mt-4 border-t border-line pt-3/);
    assert.doesNotMatch(desktop, /inline-block border-t border-line/);
    assert.doesNotMatch(desktop, /uppercase tracking-\[0\.16em\] text-olive/);
    assert.doesNotMatch(desktop, /placeholder="Search/);
    assert.doesNotMatch(desktop, /Search recipes/);
    assert.doesNotMatch(desktop, /role=["']menu["']/);
  });

  it("applies Mesa focus-visible treatment on Recipes controls", () => {
    assert.match(PUBLIC_HEADER_NAV_FOCUS, /outline-none/);
    assert.match(PUBLIC_HEADER_NAV_FOCUS, /focus-visible:outline-terracotta/);
    assert.match(siteHeaderSource, /border-0 bg-transparent/);
    assert.match(siteHeaderSource, /PUBLIC_HEADER_NAV_FOCUS/);
    assert.match(siteHeaderSource, /recipesNavAriaCurrent/);
    assert.match(siteHeaderSource, /isRecipesSectionActive/);
  });
});

describe("public header mobile recipes navigation", () => {
  it("preserves mobile primary links and two-column category area", () => {
    assert.deepEqual(publicMobileNavLabels(), ["All recipes", "Videos", "About", "Contact"]);
    assert.match(siteHeaderSource, /grid grid-cols-2 gap-x-4 gap-y-1\.5/);
    // Mobile still shows the Recipes eyebrow above the category grid.
    assert.match(
      siteHeaderSource,
      /md:hidden[\s\S]*uppercase tracking-\[0\.16em\] text-olive[\s\S]*grid grid-cols-2/,
    );
    assert.doesNotMatch(siteHeaderSource, /md:hidden[\s\S]*aria-label=\{RECIPES_DISCLOSURE_LABEL\}/);
  });

  it("gives the mobile header search an accessible label and focus treatment", () => {
    assert.match(siteHeaderSource, /htmlFor="header-search-mobile"/);
    assert.match(siteHeaderSource, /id="header-search-mobile"/);
    assert.match(siteHeaderSource, /min-h-11 items-center text-sm text-ink\/80/);
  });
});
