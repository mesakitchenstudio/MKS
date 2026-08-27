import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { homepageConfig } from "../data/homepage.ts";
import { recipes } from "../data/recipes.ts";
import { resolveHomepage } from "./homepage.ts";

describe("homepage", () => {
  it("resolves hero from configured slug", () => {
    const page = resolveHomepage(recipes, homepageConfig);
    assert.equal(page.hero?.slug, "salsa-verde");
    assert.equal(page.heroEyebrow, "Latest recipe");
  });

  it("uses curated slugs rather than category filters", () => {
    const page = resolveHomepage(recipes, homepageConfig);
    const breakfast = page.collections.find((item) => item.id === "best-breakfast");
    assert.ok(breakfast?.recipes.some((recipe) => recipe.slug === "iced-horchata-coffee"));
  });

  it("omits empty collections", () => {
    const page = resolveHomepage(recipes, {
      ...homepageConfig,
      collections: [
        {
          id: "empty",
          enabled: true,
          order: 99,
          title: "Empty",
          recipeSlugs: ["missing-recipe"],
        },
      ],
    });
    assert.equal(page.collections.length, 0);
  });

  it("respects seasonal windows", () => {
    const winter = resolveHomepage(recipes, homepageConfig, new Date("2026-01-15T12:00:00"));
    assert.ok(!winter.collections.some((item) => item.id === "summer-at-the-table"));
    const summer = resolveHomepage(recipes, homepageConfig, new Date("2026-07-15T12:00:00"));
    assert.ok(summer.collections.some((item) => item.id === "summer-at-the-table"));
  });

  it("sorts collections by order", () => {
    const page = resolveHomepage(recipes, {
      ...homepageConfig,
      collections: [
        { ...homepageConfig.collections[2]!, order: 10 },
        { ...homepageConfig.collections[0]!, order: 1 },
      ],
    });
    assert.equal(page.collections[0]?.id, "summer-at-the-table");
  });
});
