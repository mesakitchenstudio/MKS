import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCwyhUrl,
  buildCwyhMatchesForCatalog,
  CWYH_MAX_PANTRY,
  CWYH_MAX_RESULTS,
  CWYH_PATH,
  formatCwyhMissingLine,
  groupCwyhMatches,
  isCookWithWhatYouHaveEnabled,
  isCwyhListingNoIndex,
  matchRecipesToPantry,
  parseHaveParam,
  rankCwyhMatches,
  type CookWithWhatYouHaveMatch,
  type CwyhIngredientRow,
} from "@/lib/cook-with-what-you-have";
import { buildSitemapEntries, sitemapPathnamesFromEntries } from "@/lib/sitemap-entries";
import { trackEvent } from "@/lib/analytics";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "src");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function row(
  partial: Partial<CwyhIngredientRow> &
    Pick<CwyhIngredientRow, "recipeId" | "authoredItem" | "authoredItemNorm">,
): CwyhIngredientRow {
  return {
    groupIndex: 0,
    itemIndex: 0,
    ingredientId: null,
    ingredientName: null,
    ...partial,
  };
}

function recipeMeta(
  id: string,
  title: string,
  publishedAt: string,
  slug = id,
) {
  return { id, slug, title, publishedAt };
}

describe("ING-6 CWYW pantry URL state", () => {
  it("parses empty, single, multiple, dedupe, sort, invalid blanks, and max bound", () => {
    assert.deepEqual(parseHaveParam(undefined), []);
    assert.deepEqual(parseHaveParam(""), []);
    assert.deepEqual(parseHaveParam("egg"), ["egg"]);
    assert.deepEqual(parseHaveParam("potato,egg,butter"), ["butter", "egg", "potato"]);
    assert.deepEqual(parseHaveParam("egg, egg,potato,,EGG"), ["egg", "potato"]);
    const many = Array.from({ length: 20 }, (_, i) => `ing-${String(i).padStart(2, "0")}`);
    assert.equal(parseHaveParam(many.join(",")).length, CWYH_MAX_PANTRY);
  });

  it("builds deterministic share URLs", () => {
    assert.equal(buildCwyhUrl([]), CWYH_PATH);
    assert.equal(buildCwyhUrl(["potato", "egg", "butter"]), `${CWYH_PATH}?have=butter,egg,potato`);
  });

  it("marks have= as noindex listing", () => {
    assert.equal(isCwyhListingNoIndex([]), false);
    assert.equal(isCwyhListingNoIndex(["egg"]), true);
  });
});

describe("ING-6 CWYH matching", () => {
  const egg = "ing-egg";
  const potato = "ing-potato";
  const butter = "ing-butter";
  const yolk = "ing-yolk";
  const cream = "ing-cream";

  it("exact match requires zero missing resolved and zero unresolved", () => {
    const matches = matchRecipesToPantry({
      pantryIngredientIds: [egg, potato, butter],
      recipes: [recipeMeta("r1", "Hash", "2024-01-02")],
      ingredientRows: [
        row({
          recipeId: "r1",
          ingredientId: egg,
          authoredItem: "large eggs",
          authoredItemNorm: "large eggs",
          ingredientName: "Egg",
        }),
        row({
          recipeId: "r1",
          ingredientId: potato,
          authoredItem: "Russet potatoes",
          authoredItemNorm: "russet potatoes",
          ingredientName: "Potato",
        }),
        row({
          recipeId: "r1",
          ingredientId: butter,
          authoredItem: "butter",
          authoredItemNorm: "butter",
          ingredientName: "Butter",
        }),
      ],
    });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].canMakeClaim, true);
    assert.equal(matches[0].classificationComplete, true);
    assert.equal(matches[0].missingResolvedCount, 0);
    assert.equal(matches[0].unresolvedCount, 0);
  });

  it("counts missing 1–3 and excludes >3 resolved missing", () => {
    const pantry = [egg];
    const recipes = [
      recipeMeta("m1", "One missing", "2024-01-01"),
      recipeMeta("m2", "Two missing", "2024-01-01"),
      recipeMeta("m3", "Three missing", "2024-01-01"),
      recipeMeta("m4", "Four missing", "2024-01-01"),
    ];
    const rows: CwyhIngredientRow[] = [
      row({ recipeId: "m1", ingredientId: egg, authoredItem: "egg", authoredItemNorm: "egg" }),
      row({
        recipeId: "m1",
        ingredientId: cream,
        authoredItem: "cream",
        authoredItemNorm: "cream",
        ingredientName: "Cream",
      }),
      row({ recipeId: "m2", ingredientId: egg, authoredItem: "egg", authoredItemNorm: "egg" }),
      row({
        recipeId: "m2",
        ingredientId: cream,
        authoredItem: "cream",
        authoredItemNorm: "cream",
      }),
      row({
        recipeId: "m2",
        ingredientId: butter,
        authoredItem: "butter",
        authoredItemNorm: "butter",
      }),
      row({ recipeId: "m3", ingredientId: egg, authoredItem: "egg", authoredItemNorm: "egg" }),
      row({
        recipeId: "m3",
        ingredientId: cream,
        authoredItem: "cream",
        authoredItemNorm: "cream",
      }),
      row({
        recipeId: "m3",
        ingredientId: butter,
        authoredItem: "butter",
        authoredItemNorm: "butter",
      }),
      row({
        recipeId: "m3",
        ingredientId: potato,
        authoredItem: "potato",
        authoredItemNorm: "potato",
      }),
      row({ recipeId: "m4", ingredientId: egg, authoredItem: "egg", authoredItemNorm: "egg" }),
      row({
        recipeId: "m4",
        ingredientId: cream,
        authoredItem: "cream",
        authoredItemNorm: "cream",
      }),
      row({
        recipeId: "m4",
        ingredientId: butter,
        authoredItem: "butter",
        authoredItemNorm: "butter",
      }),
      row({
        recipeId: "m4",
        ingredientId: potato,
        authoredItem: "potato",
        authoredItemNorm: "potato",
      }),
      row({
        recipeId: "m4",
        ingredientId: yolk,
        authoredItem: "yolk",
        authoredItemNorm: "yolk",
      }),
    ];
    const matches = matchRecipesToPantry({ pantryIngredientIds: pantry, recipes, ingredientRows: rows });
    assert.deepEqual(
      matches.map((m) => m.recipeId),
      ["m1", "m2", "m3"],
    );
    assert.equal(matches.find((m) => m.recipeId === "m1")?.missingResolvedCount, 1);
    assert.equal(matches.find((m) => m.recipeId === "m2")?.missingResolvedCount, 2);
    assert.equal(matches.find((m) => m.recipeId === "m3")?.missingResolvedCount, 3);
  });

  it("dedupes duplicate canonical ingredient ids in one recipe", () => {
    const matches = matchRecipesToPantry({
      pantryIngredientIds: [egg],
      recipes: [recipeMeta("cake", "Cake", "2024-01-01")],
      ingredientRows: [
        row({
          recipeId: "cake",
          ingredientId: egg,
          authoredItem: "Egg",
          authoredItemNorm: "egg",
          groupIndex: 0,
          itemIndex: 0,
        }),
        row({
          recipeId: "cake",
          ingredientId: egg,
          authoredItem: "Egg",
          authoredItemNorm: "egg",
          groupIndex: 1,
          itemIndex: 0,
        }),
      ],
    });
    assert.equal(matches[0].requiredResolvedCount, 1);
    assert.equal(matches[0].canMakeClaim, true);
  });

  it("does not treat Egg as Egg yolk", () => {
    const matches = matchRecipesToPantry({
      pantryIngredientIds: [egg],
      recipes: [recipeMeta("sauce", "Sauce", "2024-01-01")],
      ingredientRows: [
        row({
          recipeId: "sauce",
          ingredientId: yolk,
          authoredItem: "egg yolks",
          authoredItemNorm: "egg yolks",
          ingredientName: "Egg yolk",
        }),
      ],
    });
    assert.equal(matches[0].canMakeClaim, false);
    assert.equal(matches[0].missingResolvedCount, 1);
    assert.equal(matches[0].matchedIngredientIds.length, 0);
  });

  it("alias-derived and exact-derived rows match via the same canonical id", () => {
    const matches = matchRecipesToPantry({
      pantryIngredientIds: [egg],
      recipes: [recipeMeta("omelette", "Omelette", "2024-01-01")],
      ingredientRows: [
        row({
          recipeId: "omelette",
          ingredientId: egg,
          authoredItem: "large free-range eggs",
          authoredItemNorm: "large free-range eggs",
          ingredientName: "Egg",
        }),
      ],
    });
    assert.equal(matches[0].canMakeClaim, true);
  });

  it("unresolved prevents canMakeClaim and stays visitor-friendly", () => {
    const matches = matchRecipesToPantry({
      pantryIngredientIds: [egg],
      recipes: [recipeMeta("special", "Special", "2024-01-01")],
      ingredientRows: [
        row({
          recipeId: "special",
          ingredientId: egg,
          authoredItem: "eggs",
          authoredItemNorm: "eggs",
        }),
        row({
          recipeId: "special",
          ingredientId: null,
          authoredItem: "Special spice blend",
          authoredItemNorm: "special spice blend",
        }),
        row({
          recipeId: "special",
          ingredientId: null,
          authoredItem: "Special spice blend",
          authoredItemNorm: "special spice blend",
        }),
      ],
    });
    assert.equal(matches[0].missingResolvedCount, 0);
    assert.equal(matches[0].unresolvedCount, 1);
    assert.equal(matches[0].canMakeClaim, false);
    assert.equal(matches[0].missing[0].kind, "unresolved");
    assert.equal(matches[0].missing[0].displayText, "Special spice blend");
    assert.doesNotMatch(matches[0].missing[0].displayText, /UNRESOLVED|authoredItemNorm/i);
  });

  it("excludes recipes with zero resolved ingredients", () => {
    const matches = matchRecipesToPantry({
      pantryIngredientIds: [egg],
      recipes: [recipeMeta("empty", "Empty", "2024-01-01")],
      ingredientRows: [
        row({
          recipeId: "empty",
          ingredientId: null,
          authoredItem: "mystery",
          authoredItemNorm: "mystery",
        }),
      ],
    });
    assert.equal(matches.length, 0);
  });

  it("prefers authored missing text with canonical fallback", () => {
    const matches = matchRecipesToPantry({
      pantryIngredientIds: [],
      recipes: [recipeMeta("r", "R", "2024-01-01")],
      ingredientRows: [
        row({
          recipeId: "r",
          ingredientId: potato,
          authoredItem: "Russet potatoes",
          authoredItemNorm: "russet potatoes",
          ingredientName: "Potato",
        }),
        row({
          recipeId: "r",
          ingredientId: cream,
          authoredItem: "   ",
          authoredItemNorm: "cream",
          ingredientName: "Cream",
        }),
      ],
    });
    assert.equal(matches[0].missing[0].displayText, "Russet potatoes");
    assert.equal(matches[0].missing[1].displayText, "Cream");
  });

  it("quantity and group names are irrelevant to identity matching", () => {
    const matches = matchRecipesToPantry({
      pantryIngredientIds: [egg],
      recipes: [recipeMeta("r", "R", "2024-01-01")],
      ingredientRows: [
        row({
          recipeId: "r",
          ingredientId: egg,
          authoredItem: "500 g eggs",
          authoredItemNorm: "500 g eggs",
          groupIndex: 3,
          itemIndex: 9,
        }),
      ],
    });
    assert.equal(matches[0].canMakeClaim, true);
  });
});

describe("ING-6 CWYW ranking and groups", () => {
  it("ranks 9/10 ahead of 1/2 when missingResolvedCount is equal", () => {
    const egg = "e";
    const ids = Array.from({ length: 10 }, (_, i) => `i${i}`);
    const pantryNine = ids.slice(0, 9);
    const pantryOne = [egg];

    const bigRows = ids.map((id, index) =>
      row({
        recipeId: "big",
        ingredientId: id,
        authoredItem: id,
        authoredItemNorm: id,
        itemIndex: index,
      }),
    );
    const smallRows = [
      row({ recipeId: "small", ingredientId: egg, authoredItem: "egg", authoredItemNorm: "egg" }),
      row({
        recipeId: "small",
        ingredientId: "missing",
        authoredItem: "cream",
        authoredItemNorm: "cream",
      }),
    ];

    const matches = matchRecipesToPantry({
      pantryIngredientIds: [...new Set([...pantryNine, ...pantryOne])],
      recipes: [
        recipeMeta("small", "A small", "2024-01-01"),
        recipeMeta("big", "Z big", "2024-01-01"),
      ],
      ingredientRows: [...bigRows, ...smallRows],
    });

    assert.equal(matches[0].recipeId, "big");
    assert.equal(matches[0].missingResolvedCount, 1);
    assert.equal(matches[1].recipeId, "small");
    assert.equal(matches[1].missingResolvedCount, 1);
    assert.ok(matches[0].coverageRatio > matches[1].coverageRatio);
  });

  it("applies deterministic secondary ranking keys", () => {
    const base: CookWithWhatYouHaveMatch = {
      recipeId: "a",
      recipeSlug: "a",
      title: "A",
      publishedAt: "2024-01-01",
      requiredResolvedCount: 2,
      pantryMatchedCount: 1,
      missingResolvedCount: 1,
      unresolvedCount: 1,
      coverageRatio: 0.5,
      classificationComplete: false,
      canMakeClaim: false,
      effectiveMissingCount: 2,
      matchedIngredientIds: ["x"],
      missing: [],
    };
    const ranked = rankCwyhMatches([
      { ...base, recipeId: "older", title: "B", publishedAt: "2023-01-01", unresolvedCount: 0 },
      { ...base, recipeId: "newer", title: "A", publishedAt: "2024-06-01", unresolvedCount: 0 },
      { ...base, recipeId: "more-unresolved", title: "C", unresolvedCount: 2 },
    ]);
    assert.deepEqual(
      ranked.map((m) => m.recipeId),
      ["newer", "older", "more-unresolved"],
    );
  });

  it("groups by effective missing and omits empty groups; caps results", () => {
    const egg = "egg";
    const cream = "cream";
    const recipes = Array.from({ length: 30 }, (_, i) =>
      recipeMeta(`r${i}`, `Recipe ${String(i).padStart(2, "0")}`, "2024-01-01"),
    );
    const rows: CwyhIngredientRow[] = [];
    for (let i = 0; i < 30; i++) {
      rows.push(
        row({
          recipeId: `r${i}`,
          ingredientId: egg,
          authoredItem: "egg",
          authoredItemNorm: "egg",
        }),
      );
      if (i > 0) {
        rows.push(
          row({
            recipeId: `r${i}`,
            ingredientId: cream,
            authoredItem: "cream",
            authoredItemNorm: "cream",
          }),
        );
      }
    }
    const matches = matchRecipesToPantry({
      pantryIngredientIds: [egg],
      recipes,
      ingredientRows: rows,
    });
    const groups = groupCwyhMatches(matches);
    assert.equal(groups.some((g) => g.key === "exact"), true);
    assert.equal(groups.find((g) => g.key === "exact")?.title, "You have everything");
    assert.equal(
      groups.reduce((sum, g) => sum + g.matches.length, 0),
      CWYH_MAX_RESULTS,
    );
    assert.equal(groups.some((g) => g.matches.length === 0), false);

    const unresolvedNear = matchRecipesToPantry({
      pantryIngredientIds: [egg],
      recipes: [recipeMeta("u", "Unresolved near", "2024-01-01")],
      ingredientRows: [
        row({ recipeId: "u", ingredientId: egg, authoredItem: "egg", authoredItemNorm: "egg" }),
        row({
          recipeId: "u",
          ingredientId: null,
          authoredItem: "Special spice blend",
          authoredItemNorm: "special spice blend",
        }),
      ],
    });
    const nearGroups = groupCwyhMatches(unresolvedNear);
    assert.equal(nearGroups.some((g) => g.key === "exact"), false);
    assert.equal(nearGroups[0]?.key, "missing-1");
  });

  it("formats compact missing lines", () => {
    assert.equal(
      formatCwyhMissingLine([
        { displayText: "Cream", kind: "resolved" },
        { displayText: "Parmesan", kind: "resolved" },
      ]),
      "Cream · Parmesan",
    );
  });
});

describe("ING-6 CWYW gates and SEO wiring", () => {
  it("requires both env gates", () => {
    const discovery = process.env.INGREDIENT_DISCOVERY_ENABLED;
    const cwyw = process.env.COOK_WITH_WHAT_YOU_HAVE_ENABLED;
    try {
      process.env.INGREDIENT_DISCOVERY_ENABLED = "false";
      process.env.COOK_WITH_WHAT_YOU_HAVE_ENABLED = "true";
      assert.equal(isCookWithWhatYouHaveEnabled(), false);

      process.env.INGREDIENT_DISCOVERY_ENABLED = "true";
      process.env.COOK_WITH_WHAT_YOU_HAVE_ENABLED = "false";
      assert.equal(isCookWithWhatYouHaveEnabled(), false);

      process.env.INGREDIENT_DISCOVERY_ENABLED = "true";
      process.env.COOK_WITH_WHAT_YOU_HAVE_ENABLED = "true";
      assert.equal(isCookWithWhatYouHaveEnabled(), true);
    } finally {
      if (discovery === undefined) delete process.env.INGREDIENT_DISCOVERY_ENABLED;
      else process.env.INGREDIENT_DISCOVERY_ENABLED = discovery;
      if (cwyw === undefined) delete process.env.COOK_WITH_WHAT_YOU_HAVE_ENABLED;
      else process.env.COOK_WITH_WHAT_YOU_HAVE_ENABLED = cwyw;
    }
  });

  it("includes clean CWYH path in sitemap only when flagged", () => {
    const off = buildSitemapEntries({
      recipes: [],
      categories: [],
      series: [],
      includeCookWithWhatYouHave: false,
    });
    assert.equal(
      sitemapPathnamesFromEntries(off).includes("/cook-with-what-you-have"),
      false,
    );

    const on = buildSitemapEntries({
      recipes: [],
      categories: [],
      series: [],
      includeCookWithWhatYouHave: true,
    });
    assert.equal(sitemapPathnamesFromEntries(on).includes("/cook-with-what-you-have"), true);
    assert.equal(
      sitemapPathnamesFromEntries(on).some((path) => path.includes("have=")),
      false,
    );
  });

  it("route uses notFound when gated off and no Recipe JSON-LD", () => {
    const page = read("app/cook-with-what-you-have/page.tsx");
    assert.match(page, /notFound\(\)/);
    assert.match(page, /isCookWithWhatYouHaveEnabled/);
    assert.match(page, /buildBreadcrumbJsonLd/);
    assert.doesNotMatch(page, /"@type":\s*"Recipe"/);
    assert.doesNotMatch(page, /schema\.org\/Recipe/);
  });

  it("does not introduce /ingredient routes or schema changes", () => {
    assert.doesNotMatch(read("app/cook-with-what-you-have/page.tsx"), /\/ingredient\//);
    assert.match(read("lib/cook-with-what-you-have.ts"), /RecipeIngredient/);
  });

  it("CTA and picker reuse are wired", () => {
    assert.match(read("components/RecipeDiscovery.tsx"), /Cook with what you have/);
    assert.match(read("components/DiscoveryIngredientFilters.tsx"), /PublicIngredientPicker/);
    assert.match(read("components/CookWithWhatYouHave.tsx"), /Find recipes/);
    assert.match(
      read("components/CookWithWhatYouHave.tsx"),
      /localStorage convenience deferred/,
    );
  });
});

describe("ING-6 CWYW analytics", () => {
  it("accepts bounded cwyw events without throwing", () => {
    assert.doesNotThrow(() =>
      trackEvent("cwyw_find", {
        pantry_count: 3,
        result_count: 2,
        exact_count: 1,
        near_count: 1,
        pantry_slugs: "butter,egg,potato",
      }),
    );
    assert.doesNotThrow(() =>
      trackEvent("cwyw_recipe_click", {
        recipe_slug: "hash",
        placement: "cook_with_what_you_have",
        missing_bucket: "missing_1",
      }),
    );
  });
});

describe("ING-6 catalog helper", () => {
  it("skips recipes without ids and returns capped matches", () => {
    const scored = buildCwyhMatchesForCatalog({
      pantryIngredientIds: ["egg"],
      recipes: [
        {
          id: undefined,
          slug: "no-id",
          title: "No id",
          publishedAt: "2024-01-01",
        } as never,
        {
          id: "ok",
          slug: "ok",
          title: "Ok",
          publishedAt: "2024-01-01",
        } as never,
      ],
      ingredientRows: [
        row({
          recipeId: "ok",
          ingredientId: "egg",
          authoredItem: "egg",
          authoredItemNorm: "egg",
        }),
      ],
    });
    assert.equal(scored.exactCount, 1);
    assert.equal(scored.matches.length, 1);
  });
});
