import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recipes } from "@/data/recipes";
import { recipeToValues } from "@/lib/recipe-map";
import {
  applyProductionRecipeContentPatchPlan,
  LEGACY_MISMATCHED_STOCK_IMAGES,
  mergeProductionRecipeContentPatches,
  patchedProductionRecipeSlugs,
  planProductionRecipeContentPatch,
  summarizePatchPlans,
} from "@/lib/production-recipe-content-patches";
import { formatTime, totalMinutes } from "@/lib/recipe-utils";
import { publicRestMinutes, riseHoursFromExtras } from "@/lib/recipe-timing";

const BLOB_BREAKFAST =
  "https://abc.public.blob.vercel-storage.com/breakfast-tortillas-hero.jpg";

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

  it("adds instruction-backed soak time for horchata (seed merge)", () => {
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

  it("adds rise and bench rest for focaccia (seed merge)", () => {
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

  it("preserves Mesa blob breakfast image on guarded plan", () => {
    const plan = planProductionRecipeContentPatch("breakfast-tortillas", {
      image: BLOB_BREAKFAST,
      prepMinutes: 10,
    });
    assert.ok(plan);
    const imageDecision = plan!.decisions.find((d) => d.field === "image");
    assert.equal(imageDecision?.action, "CONFLICT");
  });

  it("clears breakfast image only when legacy mismatched stock URL matches", () => {
    const plan = planProductionRecipeContentPatch("breakfast-tortillas", {
      image: LEGACY_MISMATCHED_STOCK_IMAGES["breakfast-tortillas"],
    });
    assert.ok(plan);
    assert.equal(plan!.decisions.find((d) => d.field === "image")?.action, "APPLY");
    const applied = applyProductionRecipeContentPatchPlan(
      { image: LEGACY_MISMATCHED_STOCK_IMAGES["breakfast-tortillas"] },
      plan!,
    );
    assert.equal(applied.image, "");
  });

  it("skips breakfast image when already cleared", () => {
    const plan = planProductionRecipeContentPatch("breakfast-tortillas", { image: "" });
    assert.equal(plan!.decisions.find((d) => d.field === "image")?.action, "SKIP");
  });

  it("preserves manually corrected roasted vegetables photo", () => {
    const plan = planProductionRecipeContentPatch("roasted-market-vegetables", {
      image: "https://abc.public.blob.vercel-storage.com/roasted-veg.jpg",
    });
    assert.equal(plan!.decisions.find((d) => d.field === "image")?.action, "CONFLICT");
  });

  it("applies horchata restMinutes from legacy zero", () => {
    const plan = planProductionRecipeContentPatch("iced-horchata-coffee", { restMinutes: 0 });
    assert.equal(plan!.decisions.find((d) => d.field === "restMinutes")?.action, "APPLY");
  });

  it("conflicts on horchata when restMinutes already editorially set", () => {
    const plan = planProductionRecipeContentPatch("iced-horchata-coffee", { restMinutes: 300 });
    assert.equal(plan!.decisions.find((d) => d.field === "restMinutes")?.action, "CONFLICT");
  });

  it("skips horchata when restMinutes already matches proposed", () => {
    const plan = planProductionRecipeContentPatch("iced-horchata-coffee", { restMinutes: 240 });
    assert.equal(plan!.decisions.find((d) => d.field === "restMinutes")?.action, "SKIP");
  });

  it("conflicts on focaccia riseHours when editorial value differs", () => {
    const plan = planProductionRecipeContentPatch("herb-focaccia", {
      riseHours: 12,
      restMinutes: 0,
    });
    assert.equal(plan!.decisions.find((d) => d.field === "riseHours")?.action, "CONFLICT");
    assert.equal(plan!.decisions.find((d) => d.field === "restMinutes")?.action, "APPLY");
  });

  it("skips focaccia fields when already applied", () => {
    const plan = planProductionRecipeContentPatch("herb-focaccia", {
      riseHours: 8,
      restMinutes: 75,
    });
    assert.equal(plan!.decisions.find((d) => d.field === "riseHours")?.action, "SKIP");
    assert.equal(plan!.decisions.find((d) => d.field === "restMinutes")?.action, "SKIP");
  });

  it("conflicts on lemon bars when chill time already editorially longer", () => {
    const plan = planProductionRecipeContentPatch("lemon-sesame-bars", { restMinutes: 180 });
    assert.equal(plan!.decisions.find((d) => d.field === "restMinutes")?.action, "CONFLICT");
  });

  it("skips lemon bars when restMinutes already correct", () => {
    const plan = planProductionRecipeContentPatch("lemon-sesame-bars", { restMinutes: 120 });
    assert.equal(plan!.decisions.find((d) => d.field === "restMinutes")?.action, "SKIP");
  });

  it("is idempotent after guarded apply", () => {
    const legacyBreakfast = {
      image: LEGACY_MISMATCHED_STOCK_IMAGES["breakfast-tortillas"],
      prepMinutes: 10,
    };
    const plan1 = planProductionRecipeContentPatch("breakfast-tortillas", legacyBreakfast)!;
    const once = applyProductionRecipeContentPatchPlan(legacyBreakfast, plan1);
    const plan2 = planProductionRecipeContentPatch("breakfast-tortillas", once)!;
    assert.equal(plan2.decisions.find((d) => d.field === "image")?.action, "SKIP");
    assert.deepEqual(applyProductionRecipeContentPatchPlan(once, plan2), once);
  });

  it("summarizes patch plans for dry-run output", () => {
    const plans = [
      planProductionRecipeContentPatch("iced-horchata-coffee", { restMinutes: 0 })!,
      planProductionRecipeContentPatch("iced-horchata-coffee", { restMinutes: 240 })!,
    ];
    const summary = summarizePatchPlans(plans);
    assert.equal(summary.recipesInspected, 2);
    assert.equal(summary.fieldsProposed, 1);
    assert.equal(summary.fieldsAlreadyCorrect, 1);
  });
});

describe("riseHours + restMinutes timing regression", () => {
  it("does not double-count overlapping proof windows", () => {
    const recipe = {
      prepMinutes: 20,
      cookMinutes: 15,
      bakeMinutes: 0,
      restMinutes: 60,
      extras: [{ key: "riseHours", label: "Proofing time", kind: "number", value: 1 }],
    };
    assert.equal(publicRestMinutes(recipe), 60);
    assert.equal(totalMinutes(recipe), 20 + 15 + 60);
  });

  it("sums distinct proof and bench-rest windows (focaccia model)", () => {
    const recipe = {
      prepMinutes: 25,
      cookMinutes: 25,
      bakeMinutes: 0,
      restMinutes: 75,
      extras: [{ key: "riseHours", label: "Proofing time", kind: "number", value: 8 }],
    };
    assert.equal(publicRestMinutes(recipe), 8 * 60 + 75);
    assert.equal(totalMinutes(recipe), 25 + 25 + 8 * 60 + 75);
  });
});
