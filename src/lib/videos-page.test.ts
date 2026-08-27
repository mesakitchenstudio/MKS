import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recipes } from "../data/recipes.ts";
import { VIDEO_CATALOG } from "../data/videos.ts";
import { resolveVideoItem, resolveVideoPageSections } from "./videos-page.ts";

describe("videos page", () => {
  it("reuses recipe imagery for mapped videos", () => {
    const video = resolveVideoItem(VIDEO_CATALOG["chocolate-chunk-cookies"]!, recipes);
    const recipe = recipes.find((item) => item.slug === "chocolate-chunk-cookies");
    assert.equal(video.thumbnail, recipe?.image);
    assert.equal(video.recipeSlug, "chocolate-chunk-cookies");
  });

  it("does not expose placeholder YouTube URLs", () => {
    const video = resolveVideoItem(VIDEO_CATALOG["salsa-verde-technique"]!, recipes);
    assert.equal(video.watchUrl, undefined);
    assert.equal(video.duration, undefined);
  });

  it("leaves editorial items without fabricated recipe links", () => {
    const video = resolveVideoItem(VIDEO_CATALOG["taco-night"]!, recipes);
    assert.equal(video.recipeSlug, undefined);
    assert.equal(video.watchUrl, undefined);
  });

  it("uses fallback instead of mismatched recipe imagery", () => {
    const video = resolveVideoItem(VIDEO_CATALOG["skillet-supper"]!, recipes);
    assert.equal(video.thumbnail, undefined);
    assert.equal(video.recipeSlug, undefined);
  });

  it("normalizes display titles to sentence case", () => {
    const video = resolveVideoItem(VIDEO_CATALOG["chocolate-chunk-cookies"]!, recipes);
    assert.equal(video.title, "Chocolate chunk cookies");
  });

  it("omits sections until real YouTube watch URLs exist", () => {
    const sections = resolveVideoPageSections(recipes);
    assert.ok(sections.every((section) => section.videos.every((video) => video.watchUrl)));
  });

  it("never fabricates popular titles", () => {
    const popular = resolveVideoPageSections(recipes).find((section) => section.id === "popular");
    if (popular) {
      assert.ok(popular.videos.every((video) => !/studio favorite/i.test(video.title)));
    }
  });
});
