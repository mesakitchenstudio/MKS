import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldShowFloatingRecipeSearch } from "@/lib/public-search-ui";

describe("public search ui", () => {
  it("uses header search on desktop and floating search on mobile only", () => {
    assert.equal(shouldShowFloatingRecipeSearch({ isDesktop: true, isRecipeDetail: false }), false);
    assert.equal(shouldShowFloatingRecipeSearch({ isDesktop: false, isRecipeDetail: false }), true);
  });
});
