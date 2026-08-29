import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatReviewRating } from "./recipe-reviews.ts";
import {
  RECIPE_REVIEW_POLL_MS,
  recipeReviewThreadSignature,
} from "./recipe-reviews-client.ts";

describe("admin review helpers", () => {
  it("formats valid 1–5 ratings", () => {
    assert.equal(formatReviewRating(5), "5 / 5");
    assert.equal(formatReviewRating(1), "1 / 5");
  });

  it("handles invalid ratings without NaN", () => {
    assert.equal(formatReviewRating(Number.NaN), "—");
    assert.equal(formatReviewRating(0), "—");
    assert.equal(formatReviewRating(9), "—");
  });
});

describe("recipe review live thread", () => {
  it("polls on a near-real-time interval", () => {
    assert.equal(RECIPE_REVIEW_POLL_MS, 4_000);
  });

  it("signatures match for identical threads and change when a reply is added", () => {
    const base = {
      stats: { average: 5, count: 1 },
      reviews: [
        {
          id: "rev_1",
          authorName: "Ada",
          rating: 5,
          body: "Great",
          createdAt: "2026-08-29T12:00:00.000Z",
          replies: [],
        },
      ],
    };
    const withReply = {
      ...base,
      reviews: [
        {
          ...base.reviews[0],
          replies: [
            {
              id: "rep_1",
              authorName: "Owner",
              authorTitle: "Mesa Kitchen Studio",
              authorPhotoUrl: "",
              body: "Thanks!",
              isStaff: true,
              createdAt: "2026-08-29T12:01:00.000Z",
            },
          ],
        },
      ],
    };

    assert.equal(recipeReviewThreadSignature(base), recipeReviewThreadSignature(base));
    assert.notEqual(recipeReviewThreadSignature(base), recipeReviewThreadSignature(withReply));
  });
});
