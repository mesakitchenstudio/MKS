import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recipes } from "@/data/recipes";
import { recipeToValues } from "@/lib/recipe-map";
import {
  mergeProductionRecipeContentPatches,
  patchedProductionRecipeSlugs,
} from "@/lib/production-recipe-content-patches";
import {
  mergeProductionRecipeContentPatches,
  patchedProductionRecipeSlugs,
} from "@/lib/production-recipe-content-patches";
import { formatTime, totalMinutes } from "@/lib/recipe-utils";
import { riseHoursFromExtras } from "@/lib/recipe-timing";

describe("production recipe content patches", () => {
  it("lists patched slugs", () => {
    assert.deepEqual(patchedProductionRecipeSlugs(), [
      "breakfast-tortillas",
      "herb-focaccia",
      "iced-horchata-coffee",
      "lemon-sesame-bars",
      "roasted-market-vegetables",
    ]);
  });

  it("adds instruction-backed soak time for horchata", () => {
    const base = recipeToValues(recipes.find((r) => r.slug === "iced-horchata-coffee")!);
    const patched = mergeProductionRecipeContentPatches("iced-horchata-coffee", base);
    assert.equal(patched.restMinutes, 240);
    const recipe = {
      prepMinutes: patched.prepMinutes as number,
      cookMinutes: patched.cookMinutes as number,
      restMinutes: patched.restMinutes as number,
    };
    assert.equal(formatTime(totalMinutes(recipe)), "4 h 15 min");
  });

  it("adds rise and bench rest for focaccia from instructions", () => {
    const base = recipeToValues(recipes.find((r) => r.slug === "herb-focaccia")!);
    const patched = mergeProductionRecipeContentPatches("herb-focaccia", base);
    assert.equal(patched.riseHours, 8);
    assert.equal(patched.restMinutes, 75);
    const extras = [{ key: "riseHours", label: "Proofing time", kind: "number", value: 8 }];
    const recipe = {
      prepMinutes: patched.prepMinutes as number,
      cookMinutes: patched.cookMinutes as number,
      restMinutes: patched.restMinutes as number,
      extras,
    };
    assert.equal(riseHoursFromExtras(recipe), 8);
    assert.equal(formatTime(totalMinutes(recipe)), "10 h 5 min");
  });

  it("adds chill rest for lemon bars", () => {
    const base = recipeToValues(recipes.find((r) => r.slug === "lemon-sesame-bars")!);
    const patched = mergeProductionRecipeContentPatches("lemon-sesame-bars", base);
    assert.equal(patched.restMinutes, 120);
    const recipe = {
      prepMinutes: patched.prepMinutes as number,
      cookMinutes: patched.cookMinutes as number,
      restMinutes: patched.restMinutes as number,
    };
    assert.equal(formatTime(totalMinutes(recipe)), "3 h 5 min");
  });

  it("clears mismatched stock heroes without altering unrelated fields", () => {
    const base = recipeToValues(recipes.find((r) => r.slug === "breakfast-tortillas")!);
    const patched = mergeProductionRecipeContentPatches("breakfast-tortillas", base);
    assert.equal(patched.image, "");
    assert.equal(patched.imageAlt, base.imageAlt);
    assert.equal(patched.prepMinutes, base.prepMinutes);
  });
});
