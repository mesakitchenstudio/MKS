import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampRecipeServings,
  formatCulinaryNumber,
  parseIngredientAmount,
  parseQuantityToken,
  scaleAmount,
  scaleIngredientAmount,
  CULINARY_FRACTION_TOLERANCE,
} from "./culinary-format.ts";

describe("formatCulinaryNumber", () => {
  it("formats common fractions in Mesa Unicode style", () => {
    assert.equal(formatCulinaryNumber(1 / 3), "⅓");
    assert.equal(formatCulinaryNumber(1.5), "1½");
    assert.equal(formatCulinaryNumber(2), "2");
    assert.equal(formatCulinaryNumber(0.75), "¾");
    assert.equal(formatCulinaryNumber(2.25), "2¼");
    assert.equal(formatCulinaryNumber(0), "0");
  });

  it("does not snap distant decimals to culinary fractions", () => {
    // 0.32 is outside CULINARY_FRACTION_TOLERANCE of 1/3
    assert.ok(Math.abs(0.32 - 1 / 3) > CULINARY_FRACTION_TOLERANCE);
    assert.equal(formatCulinaryNumber(0.32), "0.32");
  });

  it("avoids floating-point display artifacts", () => {
    assert.ok(!/\d+\.\d{4,}/.test(formatCulinaryNumber(0.1 + 0.2)));
    assert.equal(formatCulinaryNumber(1 * 0.3), "0.3");
  });
});

describe("parseQuantityToken", () => {
  const cases: [string, number][] = [
    ["1", 1],
    ["0.5", 0.5],
    ["1.25", 1.25],
    ["1/2", 0.5],
    ["1/3", 1 / 3],
    ["2/3", 2 / 3],
    ["1/4", 0.25],
    ["3/4", 0.75],
    ["1/8", 0.125],
    ["1 1/2", 1.5],
    ["2 3/4", 2.75],
    ["½", 0.5],
    ["⅓", 1 / 3],
    ["⅔", 2 / 3],
    ["¼", 0.25],
    ["¾", 0.75],
    ["1½", 1.5],
    ["1 ½", 1.5],
  ];
  for (const [token, expected] of cases) {
    it(`parses ${JSON.stringify(token)}`, () => {
      assert.ok(Math.abs(parseQuantityToken(token)! - expected) < 1e-9);
    });
  }
});

describe("scaleAmount — numbers", () => {
  const cases: [string, number, string][] = [
    ["1", 2, "2"],
    ["0.5", 2, "1"],
    ["1.25", 2, "2½"],
    ["2.5", 0.5, "1¼"],
    ["1 cup", 0.5, "½ cup"],
    ["2 cloves", 0.75, "1½ cloves"],
  ];
  for (const [amount, factor, expected] of cases) {
    it(`${JSON.stringify(amount)} × ${factor} → ${JSON.stringify(expected)}`, () => {
      assert.equal(scaleAmount(amount, factor), expected);
    });
  }

  it("factor 1 returns original unchanged", () => {
    assert.equal(scaleAmount("1½ teaspoons", 1), "1½ teaspoons");
  });

  it("scaleIngredientAmount aliases scaleAmount", () => {
    assert.equal(scaleIngredientAmount("1 cup", 2), scaleAmount("1 cup", 2));
  });
});

describe("scaleAmount — fractions and mixed", () => {
  const cases: [string, number, string][] = [
    ["1/2", 2, "1"],
    ["3/4", 2, "1½"],
    ["1/3", 3, "1"],
    ["1/4", 2, "½"],
    ["1/8", 2, "¼"],
    ["1 1/2", 2, "3"],
    ["2 3/4", 2, "5½"],
    ["½", 3, "1½"],
    ["⅓", 3, "1"],
    ["1½", 2, "3"],
    ["1½", 3, "4½"],
    ["¾ cup", 2, "1½ cup"],
    ["⅓ cup", 3, "1 cup"],
  ];
  for (const [amount, factor, expected] of cases) {
    it(`${JSON.stringify(amount)} × ${factor} → ${JSON.stringify(expected)}`, () => {
      assert.equal(scaleAmount(amount, factor), expected);
    });
  }
});

describe("scaleAmount — ranges", () => {
  const cases: [string, number, string][] = [
    ["1-2", 2, "2-4"],
    ["1–2", 2, "2–4"],
    ["1 to 2", 2, "2 to 4"],
    ["1 to 2 tablespoons", 2, "2 to 4 tablespoons"],
    ["1/2–1", 3, "1½–3"],
    ["½–1 cup", 2, "1–2 cup"],
    ["1 1/2–2", 2, "3–4"],
  ];
  for (const [amount, factor, expected] of cases) {
    it(`${JSON.stringify(amount)} × ${factor} → ${JSON.stringify(expected)}`, () => {
      assert.equal(scaleAmount(amount, factor), expected);
    });
  }
});

describe("scaleAmount — modifiers and packaging", () => {
  it("preserves approximation modifiers", () => {
    assert.equal(scaleAmount("about 1 cup", 2), "about 2 cup");
    assert.equal(scaleAmount("scant 1/2 cup", 2), "scant 1 cup");
    assert.equal(scaleAmount("heaping 1 tbsp", 2), "heaping 2 tbsp");
  });

  it("scales packaging count but not parenthetical size", () => {
    assert.equal(scaleAmount("1 can (15 ounces)", 2), "2 can (15 ounces)");
    assert.equal(scaleAmount("1 can (28 ounces)", 3), "3 can (28 ounces)");
  });

  it("scales numeric qualifier forms conservatively", () => {
    assert.equal(scaleAmount("1 large", 2), "2 large");
    assert.equal(scaleAmount("1 packed cup", 2), "2 packed cup");
    assert.equal(scaleAmount("2 large", 0.5), "1 large");
  });
});

describe("scaleAmount — nonscalable / safe fallback", () => {
  const unchanged = [
    "to taste",
    "as needed",
    "for serving",
    "for finishing",
    "for dusting",
    "optional",
    "a pinch",
    "a handful",
    "one handful",
    "—",
    "",
    "350-400°F",
  ];
  for (const amount of unchanged) {
    it(`leaves ${JSON.stringify(amount)} unchanged`, () => {
      assert.equal(scaleAmount(amount, 2), amount);
      assert.equal(scaleAmount(amount, 0.5), amount);
    });
  }

  it("does not throw on odd inputs", () => {
    assert.equal(scaleAmount(undefined as unknown as string, 2), "");
    assert.equal(parseIngredientAmount(null).kind, "text");
    assert.equal(scaleAmount("mystery blend", 2), "mystery blend");
  });
});

describe("scaleAmount — large and down multipliers from original", () => {
  it("scales up substantially without artifacts", () => {
    assert.equal(scaleAmount("1½ cups", 4), "6 cups");
    assert.equal(scaleAmount("1–2 tbsp", 4), "4–8 tbsp");
    assert.ok(!/\d+\.\d{4,}/.test(scaleAmount("1 cup", 1 / 3)));
  });

  it("scales down without zeroing positive amounts", () => {
    assert.equal(scaleAmount("1 cup", 0.5), "½ cup");
    assert.equal(scaleAmount("¼ teaspoon", 0.5), "⅛ teaspoon");
    assert.notEqual(scaleAmount("1 teaspoon", 0.5), "0");
  });
});

describe("clampRecipeServings", () => {
  it("rejects invalid serving values", () => {
    assert.equal(clampRecipeServings(0), 1);
    assert.equal(clampRecipeServings(-3), 1);
    assert.equal(clampRecipeServings(Number.NaN), 1);
    assert.equal(clampRecipeServings(Number.POSITIVE_INFINITY), 1);
    assert.equal(clampRecipeServings(100), 99);
    assert.equal(clampRecipeServings(4.6), 5);
  });
});
