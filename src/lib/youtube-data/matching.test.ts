import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  suggestRecipeMatchForVideo,
  titleTokenOverlapRatio,
  titlesDifferSignificantly,
} from "./matching.ts";

describe("recipe match suggestions", () => {
  it("suggests published candidate with strong title overlap", () => {
    const match = suggestRecipeMatchForVideo("Herb Focaccia Recipe", [
      { id: "1", slug: "herb-focaccia", title: "Herb Focaccia" },
      { id: "2", slug: "other", title: "Sourdough Starter" },
    ]);
    assert.equal(match?.id, "1");
  });

  it("does not suggest when overlap is too low", () => {
    const match = suggestRecipeMatchForVideo("Herb Focaccia", [
      { id: "2", slug: "other", title: "Sourdough Starter" },
    ]);
    assert.equal(match, null);
  });

  it("never auto-links — returns suggestion object only", () => {
    const match = suggestRecipeMatchForVideo("Baguette", [{ id: "1", slug: "baguette", title: "Baguette" }]);
    assert.ok(match);
    assert.equal(typeof match.id, "string");
  });

  it("preserves titlesDifferSignificantly behavior via overlap ratio", () => {
    assert.equal(titlesDifferSignificantly("Herb Focaccia", "Herb Focaccia Bread"), false);
    assert.ok(titleTokenOverlapRatio("Herb Focaccia", "Herb Focaccia Bread") >= 0.45);
  });
});
