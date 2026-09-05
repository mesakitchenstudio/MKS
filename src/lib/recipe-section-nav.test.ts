import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RECIPE_SECTION_NAV_LINKS,
  measureRecipeSectionTriggerY,
  recipeSectionScanlineRootMargin,
  resolveActiveRecipeSectionId,
} from "./recipe-section-nav";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("recipe section navigation scrollspy", () => {
  it("keeps Recipe active at the top and through the cooking section", () => {
    const sections = [
      { id: "recipe-cooking", top: 120 },
      { id: "recipe-learn", top: 900 },
      { id: "watch-method", top: 1400 },
      { id: "recipe-comments", top: 2000 },
    ];
    assert.equal(resolveActiveRecipeSectionId(sections, 100), "recipe-cooking");
    assert.equal(
      resolveActiveRecipeSectionId(
        [
          { id: "recipe-cooking", top: -400 },
          { id: "recipe-learn", top: 380 },
          { id: "watch-method", top: 880 },
          { id: "recipe-comments", top: 1480 },
        ],
        100,
      ),
      "recipe-cooking",
    );
  });

  it("activates Learn / Video / Reviews only after their tops cross the trigger", () => {
    const triggerY = 100;
    assert.equal(
      resolveActiveRecipeSectionId(
        [
          { id: "recipe-cooking", top: -800 },
          { id: "recipe-learn", top: 99 },
          { id: "watch-method", top: 600 },
          { id: "recipe-comments", top: 1200 },
        ],
        triggerY,
      ),
      "recipe-learn",
    );
    assert.equal(
      resolveActiveRecipeSectionId(
        [
          { id: "recipe-cooking", top: -1400 },
          { id: "recipe-learn", top: -500 },
          { id: "watch-method", top: 100 },
          { id: "recipe-comments", top: 700 },
        ],
        triggerY,
      ),
      "watch-method",
    );
    assert.equal(
      resolveActiveRecipeSectionId(
        [
          { id: "recipe-cooking", top: -2000 },
          { id: "recipe-learn", top: -1100 },
          { id: "watch-method", top: -500 },
          { id: "recipe-comments", top: 80 },
        ],
        triggerY,
      ),
      "recipe-comments",
    );
  });

  it("restores the previous section when scrolling upward", () => {
    const triggerY = 110;
    assert.equal(
      resolveActiveRecipeSectionId(
        [
          { id: "recipe-cooking", top: -900 },
          { id: "recipe-learn", top: 40 },
          { id: "watch-method", top: 520 },
          { id: "recipe-comments", top: 1100 },
        ],
        triggerY,
      ),
      "recipe-learn",
    );
    assert.equal(
      resolveActiveRecipeSectionId(
        [
          { id: "recipe-cooking", top: -200 },
          { id: "recipe-learn", top: 180 },
          { id: "watch-method", top: 660 },
          { id: "recipe-comments", top: 1240 },
        ],
        triggerY,
      ),
      "recipe-cooking",
    );
  });

  it("keeps Reviews active after its heading has crossed at the bottom", () => {
    assert.equal(
      resolveActiveRecipeSectionId(
        [
          { id: "recipe-cooking", top: -2400 },
          { id: "recipe-learn", top: -1500 },
          { id: "watch-method", top: -900 },
          { id: "recipe-comments", top: -120 },
        ],
        100,
      ),
      "recipe-comments",
    );
  });

  it("measures trigger offset under header+nav or nav-only when pinned", () => {
    assert.equal(
      measureRecipeSectionTriggerY({ headerHeight: 72, navHeight: 44, pinned: false }),
      116,
    );
    assert.equal(
      measureRecipeSectionTriggerY({ headerHeight: 72, navHeight: 44, pinned: true }),
      44,
    );
  });

  it("builds a thin scanline rootMargin at the trigger offset", () => {
    assert.equal(recipeSectionScanlineRootMargin(116, 900), "-116px 0px -780px 0px");
    assert.equal(recipeSectionScanlineRootMargin(44, 800), "-44px 0px -752px 0px");
  });

  it("preserves hash targets, aria-current, and avoids early mid-viewport activation", () => {
    const nav = read("components/RecipeSectionNav.tsx");
    assert.match(nav, /resolveActiveRecipeSectionId/);
    assert.match(nav, /recipeSectionScanlineRootMargin/);
    assert.match(nav, /measureRecipeSectionTriggerY/);
    assert.match(nav, /aria-current=\{active \? "true" : undefined\}/);
    assert.match(nav, /href=\{`#\$\{item\.id\}`\}/);
    assert.doesNotMatch(nav, /-35% 0px -50% 0px/);
    assert.doesNotMatch(nav, /intersectionRatio/);

    assert.match(nav, /RECIPE_SECTION_NAV_LINKS/);
    assert.deepEqual(
      RECIPE_SECTION_NAV_LINKS.map((link) => link.id),
      ["recipe-cooking", "recipe-learn", "watch-method", "recipe-comments"],
    );

    const cooking = read("components/RecipeCard.tsx");
    const learn = read("components/RecipeLearnSection.tsx");
    const video = read("components/youtube/RecipeWatchMethod.tsx");
    const reviews = read("components/RecipeReviews.tsx");
    assert.match(cooking, /id="recipe-cooking"/);
    assert.match(learn, /id="recipe-learn"/);
    assert.match(video, /id="watch-method"/);
    assert.match(reviews, /id="recipe-comments"/);
    assert.match(cooking, /scroll-mt-28/);
    assert.match(learn, /scroll-mt-28/);
    assert.match(video, /scroll-mt-28/);
    assert.match(reviews, /scroll-mt-28/);
  });
});
