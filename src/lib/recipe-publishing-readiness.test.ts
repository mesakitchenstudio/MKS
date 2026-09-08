import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getRecipePublishingReadiness,
  publishingCheckIdForField,
  validateRecipeForPublish,
} from "./recipe-publishing-readiness.ts";

const requiredFields = [
  { key: "image", label: "Hero image", kind: "image", required: true },
  { key: "imageAlt", label: "Image alt", kind: "text", required: true },
  { key: "intro", label: "Intro", kind: "textarea", required: true },
  { key: "ingredients", label: "Ingredients", kind: "ingredients", required: true },
  { key: "instructions", label: "Instructions", kind: "instructions", required: true },
  { key: "prepMinutes", label: "Prep", kind: "minutes", required: true },
  { key: "servings", label: "Servings", kind: "number", required: true },
];

const completeValues = {
  image: "https://example.public.blob.vercel-storage.com/baguette.jpg",
  imageAlt: "Baguettes",
  intro: "A classic loaf.",
  ingredients: [{ name: "Dough", items: [{ item: "flour", amount: "500g", notes: "" }] }],
  instructions: [{ title: "Mix", steps: ["Mix", "Bake"] }],
  prepMinutes: 20,
  servings: 4,
  youtubeUrl: "",
};

describe("recipe publishing readiness", () => {
  it("uses stable check ids", () => {
    assert.equal(publishingCheckIdForField("image"), "recipe.hero_image");
    assert.equal(publishingCheckIdForField("imageAlt"), "recipe.hero_alt");
    assert.equal(publishingCheckIdForField("servings"), "recipe.yield");
  });

  it("marks incomplete recipes not_ready with required failures", () => {
    const readiness = getRecipePublishingReadiness({
      title: "",
      slug: "",
      excerpt: "",
      typeId: "t1",
      fields: requiredFields,
      values: {},
    });
    assert.equal(readiness.status, "not_ready");
    assert.ok(readiness.required.some((check) => check.id === "recipe.title" && !check.passed));
    assert.ok(readiness.required.some((check) => check.id === "recipe.ingredients" && !check.passed));
    assert.equal(validateRecipeForPublish({
      title: "",
      fields: requiredFields,
      values: {},
    }).title, "Title is required before publishing.");
  });

  it("returns ready_with_recommendations when required pass but youtube/description missing", () => {
    const readiness = getRecipePublishingReadiness({
      title: "Classic Baguettes",
      slug: "classic-baguettes",
      excerpt: "",
      typeId: "t1",
      fields: requiredFields,
      values: completeValues,
    });
    assert.equal(readiness.status, "ready_with_recommendations");
    assert.equal(readiness.counts.requiredPassed, readiness.counts.requiredTotal);
    assert.ok(readiness.recommended.some((check) => check.id === "recipe.youtube" && !check.passed));
    assert.ok(
      readiness.recommended.some((check) => check.id === "recipe.description" && !check.passed),
    );
    assert.deepEqual(
      Object.keys(validateRecipeForPublish({
        title: "Classic Baguettes",
        fields: requiredFields,
        values: completeValues,
      })),
      [],
    );
  });

  it("returns ready when required and recommended all pass", () => {
    const readiness = getRecipePublishingReadiness({
      title: "Classic Baguettes",
      slug: "classic-baguettes",
      excerpt: "Crisp crust, open crumb.",
      typeId: "t1",
      fields: requiredFields,
      values: {
        ...completeValues,
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    });
    assert.equal(readiness.status, "ready");
    assert.equal(readiness.counts.recommendedPassed, readiness.counts.recommendedTotal);
  });

  it("treats malformed YouTube URL as required failure", () => {
    const readiness = getRecipePublishingReadiness({
      title: "Classic Baguettes",
      slug: "classic-baguettes",
      excerpt: "Crisp crust.",
      typeId: "t1",
      fields: requiredFields,
      values: {
        ...completeValues,
        youtubeUrl: "https://example.com/not-youtube",
      },
    });
    assert.equal(readiness.status, "not_ready");
    assert.ok(readiness.required.some((check) => check.id === "recipe.youtube_url" && !check.passed));
  });

  it("does not invent aspect-ratio media library checks", () => {
    const readiness = getRecipePublishingReadiness({
      title: "Classic Baguettes",
      slug: "classic-baguettes",
      excerpt: "Crisp crust.",
      typeId: "t1",
      fields: requiredFields,
      values: {
        ...completeValues,
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    });
    assert.equal(
      readiness.required.some((check) => check.id.includes("1_1") || check.id.includes("16_9")),
      false,
    );
    assert.equal(
      readiness.recommended.some((check) => check.id.includes("1_1") || check.id.includes("16_9")),
      false,
    );
  });

  it("normalizes production public youtube blobs instead of crashing Content Health", () => {
    // Reproduces production Recipe.values.youtube shape that crashed validateYoutubeMetadataEditorState
    // via undefined timeInput.trim() / missing timestamps.forEach.
    assert.doesNotThrow(() => {
      const readiness = getRecipePublishingReadiness({
        title: "Chocolate Chunk Cookies",
        slug: "chocolate-chunk-cookies",
        excerpt: "Chewy cookies.",
        typeId: "t1",
        fields: requiredFields,
        values: {
          ...completeValues,
          youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          youtube: {
            hook: "Bake along",
            // timestamps omitted (non-array) — previously TypeError on forEach
          },
        },
      });
      assert.ok(readiness.status === "ready" || readiness.status === "ready_with_recommendations" || readiness.status === "not_ready");
    });

    assert.doesNotThrow(() => {
      const readiness = getRecipePublishingReadiness({
        title: "Egg Toast",
        slug: "egg-toast",
        excerpt: "Two ways.",
        typeId: "t1",
        fields: requiredFields,
        values: {
          ...completeValues,
          youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          youtube: {
            hook: "Watch",
            duration: "08:00",
            timestamps: [
              { time: 30, label: "Prep" },
              { time: 120, label: "Cook" },
            ],
          },
        },
      });
      assert.equal(
        readiness.required.some((check) => check.id === "recipe.youtube_metadata" && !check.passed),
        false,
      );
    });
  });

  it("handles timeInput present with timestamps missing without throwing", () => {
    // Confirmed production-shaped defect: editor-ish fields without timestamps array.
    const readiness = getRecipePublishingReadiness({
      title: "Legacy Youtube Shape",
      slug: "legacy-youtube-shape",
      excerpt: "Excerpt.",
      typeId: "t1",
      fields: requiredFields,
      values: {
        ...completeValues,
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        youtube: {
          hook: "Watch along",
          duration: "05:00",
          timeInput: "00:45",
          // timestamps intentionally absent
        },
      },
    });
    assert.equal(
      readiness.required.some((check) => check.id === "recipe.youtube_metadata" && !check.passed),
      false,
    );
    assert.ok(
      readiness.status === "ready" || readiness.status === "ready_with_recommendations",
    );
  });
});
