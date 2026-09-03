import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ABOUT_HERO_IMAGE,
  ABOUT_PRINCIPLES,
  ABOUT_PROCESS_IMAGE,
} from "../data/about.ts";

describe("about page content", () => {
  it("keeps three numbered principles with informative descriptions", () => {
    assert.equal(ABOUT_PRINCIPLES.length, 3);
    assert.deepEqual(
      ABOUT_PRINCIPLES.map((row) => ({ number: row.number, label: row.label })),
      [
        { number: "01", label: "Test it again" },
        { number: "02", label: "Use what you can buy" },
        { number: "03", label: "Explain why" },
      ],
    );
    for (const principle of ABOUT_PRINCIPLES) {
      assert.ok(principle.description.length > 40);
      assert.ok(!principle.description.toLowerCase().startsWith(principle.label.toLowerCase()));
    }
  });

  it("does not ship placeholder About photography", () => {
    assert.equal(ABOUT_HERO_IMAGE, null);
    assert.equal(ABOUT_PROCESS_IMAGE, null);
  });
});
