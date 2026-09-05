import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countContentIngredientGroups,
  emptyIngredientGroupsPlaceholder,
  hasPublishableIngredients,
  isEmptyIngredientGroup,
  normalizeIngredientGroups,
} from "./ingredient-groups.ts";

describe("ingredient group emptiness", () => {
  it("treats blank name + blank rows as empty", () => {
    assert.equal(
      isEmptyIngredientGroup({
        name: "",
        items: [{ item: "", amount: "", notes: "" }],
      }),
      true,
    );
    assert.equal(
      isEmptyIngredientGroup({
        name: "Cookies",
        items: [{ item: "", amount: "", notes: "" }],
      }),
      true,
    );
  });

  it("keeps groups with a real ingredient item", () => {
    assert.equal(
      isEmptyIngredientGroup({
        name: "",
        items: [{ item: "flour", amount: "180 g", notes: "" }],
      }),
      false,
    );
  });
});

describe("normalizeIngredientGroups", () => {
  it("drops purely empty groups and keeps named groups with ingredients", () => {
    const next = normalizeIngredientGroups([
      { name: "Cookies", items: [{ item: "oats", amount: "350 g", notes: "" }] },
      { name: "", items: [{ item: "", amount: "", notes: "" }] },
      { name: "Filling", items: [{ item: "", amount: "", notes: "" }] },
      { name: "Sauce", items: [{ item: "chocolate", amount: "100 g", notes: "" }] },
    ]);
    assert.deepEqual(next, [
      { name: "Cookies", items: [{ item: "oats", amount: "350 g", notes: "" }] },
      { name: "Sauce", items: [{ item: "chocolate", amount: "100 g", notes: "" }] },
    ]);
  });

  it("coalesces all-unnamed multi-group stacks into one ungrouped list", () => {
    const next = normalizeIngredientGroups([
      { name: "", items: [{ item: "bananas", amount: "2", notes: "" }] },
      { name: "", items: [{ item: "butter", amount: "115 g", notes: "" }] },
      { name: "", items: [{ item: "sugar", amount: "80 g", notes: "" }] },
    ]);
    assert.equal(next.length, 1);
    assert.equal(next[0]?.name, "");
    assert.equal(next[0]?.items.length, 3);
    assert.equal(next[0]?.items[1]?.item, "butter");
  });

  it("preserves ungrouped ingredients as valid", () => {
    const next = normalizeIngredientGroups([
      {
        name: "",
        items: [
          { item: "flour", amount: "1 cup", notes: "" },
          { item: "salt", amount: "1 tsp", notes: "" },
        ],
      },
    ]);
    assert.equal(next.length, 1);
    assert.equal(next[0]?.items.length, 2);
  });

  it("returns an editor placeholder when everything is empty", () => {
    const next = normalizeIngredientGroups(
      [
        { name: "", items: [] },
        { name: "Cookies", items: [{ item: "", amount: "", notes: "" }] },
      ],
      { forEditor: true },
    );
    assert.deepEqual(next, emptyIngredientGroupsPlaceholder());
  });

  it("returns [] on save when there are no real ingredients", () => {
    assert.deepEqual(
      normalizeIngredientGroups([{ name: "", items: [{ item: "", amount: "", notes: "" }] }]),
      [],
    );
  });

  it("never deletes real ingredient rows while stripping empty groups", () => {
    const next = normalizeIngredientGroups([
      { name: "", items: [{ item: "", amount: "", notes: "" }] },
      {
        name: "Cookies",
        items: [
          { item: "oats", amount: "350 g", notes: "" },
          { item: "chips", amount: "180 g", notes: "optional" },
        ],
      },
      { name: "", items: [{ item: "", amount: "", notes: "" }] },
    ]);
    assert.equal(countContentIngredientGroups(next), 1);
    assert.equal(next[0]?.items.length, 2);
  });
});

describe("publishable ingredients", () => {
  it("requires at least one ingredient item text", () => {
    assert.equal(hasPublishableIngredients([]), false);
    assert.equal(
      hasPublishableIngredients([{ name: "Cookies", items: [{ item: "", amount: "1", notes: "" }] }]),
      false,
    );
    assert.equal(
      hasPublishableIngredients([
        { name: "", items: [{ item: "", amount: "", notes: "" }] },
        { name: "", items: [{ item: "", amount: "", notes: "" }] },
      ]),
      false,
    );
    assert.equal(
      hasPublishableIngredients([{ name: "", items: [{ item: "flour", amount: "", notes: "" }] }]),
      true,
    );
  });

  it("does not treat blank group names as a publish blocker when ingredients exist", () => {
    assert.equal(
      hasPublishableIngredients([
        { name: "", items: [{ item: "butter", amount: "115 g", notes: "" }] },
      ]),
      true,
    );
  });
});
