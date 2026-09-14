import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PHASE3C_PUBLIC_COLLECTIONS_BLURB,
  PHASE3C_PUBLIC_COLLECTIONS_LABEL,
  PHASE3C_SERIES_ROUTE_PREFIX,
} from "./phase3c-collections.ts";
import { homepageCollectionSlugMap } from "../data/homepage.ts";
import {
  parseRelatedRecipeIds,
  serializeRelatedRecipeIds,
} from "./recipe-related-overrides.ts";
import { rankRelatedRecipesFromPool, resolveManualRelatedRecipes } from "./recipe-related.ts";
import type { Recipe } from "../data/types.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function recipe(partial: Partial<Recipe> & Pick<Recipe, "slug" | "title">): Recipe {
  return {
    excerpt: "",
    intro: "",
    whyItWorks: "",
    keyIngredients: [],
    tips: [],
    faqs: [],
    image: "/x.jpg",
    imageAlt: partial.title,
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    prepMinutes: 10,
    cookMinutes: 10,
    restMinutes: 0,
    difficulty: "Easy",
    utensils: [],
    servings: 4,
    servingsUnit: "servings",
    course: "Dessert",
    method: "Bake",
    cuisine: "",
    categories: ["desserts"],
    tags: [],
    featured: false,
    seasonal: false,
    ingredients: [],
    instructions: [],
    notes: [],
    nutrition: { calories: 0, carbs: 0, protein: 0, fat: 0 },
    ...partial,
  };
}

describe("phase 3c — editorial collections decisions", () => {
  it("keeps Series routes and labels the public index Collections", () => {
    assert.equal(PHASE3C_SERIES_ROUTE_PREFIX, "/series");
    assert.equal(PHASE3C_PUBLIC_COLLECTIONS_LABEL, "Collections");
    const index = read("../app/series/page.tsx");
    const card = read("../components/series/CollectionCard.tsx");
    assert.match(index, /PHASE3C_PUBLIC_COLLECTIONS_LABEL/);
    assert.match(index, /CollectionCard/);
    assert.match(card, /Explore collection/);
    assert.match(index, /canonical: "\/series"/);
    assert.doesNotMatch(index, /\/collections/);
    const detail = read("../app/series/[slug]/page.tsx");
    const detailView = read("../components/series/SeriesDetailView.tsx");
    assert.match(detailView, />\s*Collections\s*</);
    assert.match(detail, /canonical: `\/series\/\$\{series\.slug\}`/);
    assert.match(detail, /SeriesDetailView/);
  });

  it("does not create a Prisma Collection model", () => {
    const schema = read("../../prisma/schema.prisma");
    assert.match(schema, /model Series \{/);
    assert.match(schema, /model SeriesItem \{/);
    assert.doesNotMatch(schema, /model Collection\b/);
    assert.match(schema, /relatedRecipeIds/);
  });

  it("keeps legacy collection= as homepage curated-list compatibility only", () => {
    const map = homepageCollectionSlugMap();
    assert.ok(Object.keys(map).length >= 4);
    const discovery = read("./recipe-discovery.ts");
    assert.match(discovery, /params\.collection/);
    const homepage = read("../data/homepage.ts");
    assert.match(homepage, /Legacy curated slug lists/);
    assert.match(homepage, /Not Series\/Collections/);
    const recipesPage = read("../app/recipes/page.tsx");
    assert.match(recipesPage, /homepageCollectionSlugMap/);
    assert.doesNotMatch(recipesPage, /listPublishedSeries/);
  });

  it("documents the collections blurb for the public index", () => {
    assert.match(PHASE3C_PUBLIC_COLLECTIONS_BLURB, /seasons, occasions and the table/);
  });
});

describe("phase 3c — manual related recipe overrides", () => {
  it("parses and serializes pin ids safely", () => {
    assert.deepEqual(parseRelatedRecipeIds('["a","b","a",""]'), ["a", "b"]);
    assert.deepEqual(parseRelatedRecipeIds("{nope"), []);
    assert.deepEqual(parseRelatedRecipeIds(null), []);
    assert.equal(serializeRelatedRecipeIds(["x", "x", "y"]), '["x","y"]');
  });

  it("places manual pins first then fills with automatic ranking", () => {
    const base = recipe({
      id: "base",
      slug: "base-cake",
      title: "Base Cake",
      course: "Dessert",
      categories: ["cakes"],
    });
    const pinned = recipe({
      id: "pin-1",
      slug: "pinned-bread",
      title: "Pinned Bread",
      course: "Bread",
      categories: ["breads"],
      method: "Bake",
    });
    const auto = recipe({
      id: "auto-1",
      slug: "auto-cake",
      title: "Auto Cake",
      course: "Dessert",
      categories: ["cakes"],
    });
    const other = recipe({
      id: "other-1",
      slug: "other-soup",
      title: "Other Soup",
      course: "Soup",
      categories: ["soups"],
      method: "Stovetop",
    });

    assert.deepEqual(
      resolveManualRelatedRecipes([base, pinned, auto, other], ["pin-1", "missing"], {
        currentSlug: base.slug,
      }).map((item) => item.slug),
      ["pinned-bread"],
    );

    const ranked = rankRelatedRecipesFromPool(base, [base, pinned, auto, other], {
      limit: 3,
      manualRelatedIds: ["pin-1"],
    });
    assert.equal(ranked[0]?.slug, "pinned-bread");
    assert.equal(ranked[1]?.slug, "auto-cake");
    assert.ok(ranked.every((item) => item.slug !== base.slug));
  });

  it("wires admin pins and recipe page consumption", () => {
    const editor = read("../components/admin/RecipeEditor.tsx");
    const pins = read("../components/admin/RelatedRecipePinsEditor.tsx");
    const presentation = read("../lib/recipe-detail-presentation.ts");
    const actions = read("../app/admin/actions.ts");
    assert.match(editor, /RelatedRecipePinsEditor/);
    assert.match(pins, /relatedRecipeIds/);
    assert.match(presentation, /manualRelatedIds/);
    assert.match(actions, /serializeRelatedRecipeIds/);
    assert.match(actions, /relatedRecipeIds/);
  });
});
