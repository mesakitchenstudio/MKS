import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canManageRecipeReviewReplies,
  canReplyToRecipeReview,
  formatReviewRating,
  isRecipeReviewAuthor,
} from "./recipe-reviews.ts";
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

describe("recipe review conversation authorization", () => {
  it("allows content-role staff to manage any reply", () => {
    assert.equal(canManageRecipeReviewReplies("owner"), true);
    assert.equal(canManageRecipeReviewReplies("editor"), true);
    assert.equal(canManageRecipeReviewReplies("members"), false);
    assert.equal(canManageRecipeReviewReplies(null), false);
  });

  it("recognizes the original review author by email or user id", () => {
    const review = { userId: "u1", authorEmail: "ada@example.com" };
    assert.equal(isRecipeReviewAuthor(review, { email: "ada@example.com" }), true);
    assert.equal(isRecipeReviewAuthor(review, { userId: "u1" }), true);
    assert.equal(isRecipeReviewAuthor(review, { email: "other@example.com" }), false);
    assert.equal(isRecipeReviewAuthor(review, { userId: "u2" }), false);
  });

  it("allows staff or the original author to continue a conversation", () => {
    const review = { userId: "u1", authorEmail: "ada@example.com" };
    assert.equal(canReplyToRecipeReview(review, { canStaffReply: true }), true);
    assert.equal(
      canReplyToRecipeReview(review, { email: "ada@example.com", canStaffReply: false }),
      true,
    );
    assert.equal(
      canReplyToRecipeReview(review, { email: "bob@example.com", canStaffReply: false }),
      false,
    );
    assert.equal(canReplyToRecipeReview(review, null), false);
  });
});

describe("recipe review live thread", () => {
  it("polls on a near-real-time interval", () => {
    assert.equal(RECIPE_REVIEW_POLL_MS, 4_000);
  });

  it("signatures match for identical threads and change when a reply is added", () => {
    const base = {
      stats: { average: 5, count: 1 },
      replyableReviewIds: ["rev_1"],
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

  it("admin list signatures change when a new top-level review arrives", async () => {
    const { adminReviewsListSignature } = await import("./recipe-reviews-client.ts");
    const empty = adminReviewsListSignature([]);
    const one = adminReviewsListSignature([
      {
        id: "rev_new",
        recipeSlug: "salsa",
        authorName: "Ada",
        body: "Loved it",
        rating: 5,
        replyCount: 0,
        replies: [],
      },
    ]);
    assert.notEqual(empty, one);
  });
});
