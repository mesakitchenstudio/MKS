import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCulinaryNumber, scaleAmount } from "./culinary-format.ts";

describe("culinary-format", () => {
  it("formats common fractions readably", () => {
    assert.equal(formatCulinaryNumber(1 / 3), "⅓");
    assert.equal(formatCulinaryNumber(1.5), "1 ½");
    assert.equal(formatCulinaryNumber(2), "2");
  });

  it("scales amounts without long decimals", () => {
    assert.equal(scaleAmount("1 cup", 0.5), "½ cup");
    assert.equal(scaleAmount("2 cloves", 0.75), "1 ½ cloves");
    assert.ok(!/\d+\.\d{4,}/.test(scaleAmount("1 cup", 1 / 3)));
  });
});
