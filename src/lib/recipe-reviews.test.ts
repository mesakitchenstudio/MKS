import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canAccess } from "./admin-access.ts";
import { adminWorkspaceWidthForPath } from "./admin-nav.ts";
import { adminWorkspaceReviews, adminWorkspaceStandard } from "./admin-ui.ts";
import {
  adminReviewRecipeHref,
  canManageRecipeReviewReplies,
  canReplyToRecipeReview,
  formatAdminReplyAuthorDisplay,
  formatReviewRating,
  formatReviewRatingAccessible,
  isRecipeReviewAuthor,
} from "./recipe-reviews.ts";
import {
  RECIPE_REVIEW_POLL_MS,
  recipeReviewThreadSignature,
} from "./recipe-reviews-client.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const reviewsPage = readFileSync(
  path.join(root, "../app/admin/(app)/reviews/page.tsx"),
  "utf8",
);
const liveFeed = readFileSync(
  path.join(root, "../components/admin/AdminReviewsLiveFeed.tsx"),
  "utf8",
);
const repliesSection = readFileSync(
  path.join(root, "../components/admin/ReviewRepliesSection.tsx"),
  "utf8",
);
const replyControls = readFileSync(
  path.join(root, "../components/admin/AdminReviewReplyControls.tsx"),
  "utf8",
);
const recipeReviewsLib = readFileSync(path.join(root, "./recipe-reviews.ts"), "utf8");

describe("admin review helpers", () => {
  it("formats valid 1–5 ratings", () => {
    assert.equal(formatReviewRating(5), "5 / 5");
    assert.equal(formatReviewRating(1), "1 / 5");
    assert.equal(formatReviewRatingAccessible(4), "Rated 4 out of 5");
  });

  it("handles invalid ratings without NaN", () => {
    assert.equal(formatReviewRating(Number.NaN), "—");
    assert.equal(formatReviewRating(0), "—");
    assert.equal(formatReviewRating(9), "—");
  });

  it("avoids Owner · Mesa Kitchen Studio duplication in presentation", () => {
    assert.deepEqual(
      formatAdminReplyAuthorDisplay({
        authorName: "Owner",
        authorTitle: "Mesa Kitchen Studio",
        isStaff: true,
      }),
      { primary: "Mesa Kitchen Studio", secondary: "" },
    );
    assert.deepEqual(
      formatAdminReplyAuthorDisplay({
        authorName: "Omid Ketabchi",
        authorTitle: "Mesa Kitchen Studio",
        isStaff: true,
      }),
      { primary: "Omid Ketabchi", secondary: "Mesa Kitchen Studio" },
    );
  });

  it("links published recipes publicly and drafts to the admin editor", () => {
    assert.deepEqual(
      adminReviewRecipeHref({
        recipeId: "r1",
        recipeSlug: "iced-horchata-coffee",
        recipeStatus: "published",
      }),
      { href: "/recipes/iced-horchata-coffee", external: true },
    );
    assert.deepEqual(
      adminReviewRecipeHref({
        recipeId: "r1",
        recipeSlug: "draft-cake",
        recipeStatus: "draft",
      }),
      { href: "/admin/recipes/r1", external: false },
    );
    assert.equal(
      adminReviewRecipeHref({
        recipeId: null,
        recipeSlug: "gone",
        recipeStatus: null,
      }),
      null,
    );
  });
});

describe("admin Reviews page contracts", () => {
  it("uses restrained header copy without Community or cascade lede", () => {
    assert.match(reviewsPage, />\s*Reviews\s*</);
    assert.doesNotMatch(reviewsPage, /Community/);
    assert.match(reviewsPage, /Read and reply to member reviews on Mesa recipes\./);
    assert.doesNotMatch(reviewsPage, /Removing a review also removes/);
    assert.match(liveFeed, /No reviews yet\./);
    assert.doesNotMatch(liveFeed, /No reviews to moderate/);
  });

  it("removes the outer cage and Conversation label while keeping poll/pagination", () => {
    assert.match(liveFeed, /divide-y divide-line\/80 border-t border-line\/80/);
    assert.doesNotMatch(liveFeed, /border border-line bg-paper/);
    assert.doesNotMatch(repliesSection, /Conversation/);
    assert.doesNotMatch(repliesSection, /border border-line/);
    assert.match(repliesSection, /border-l-2 border-line\/80/);
    assert.match(repliesSection, /h-8 w-8/);
    assert.match(liveFeed, /RECIPE_REVIEW_POLL_MS/);
    assert.match(liveFeed, /Reviews pagination/);
    assert.match(liveFeed, /formatReviewRatingAccessible/);
    assert.doesNotMatch(liveFeed, /star/i);
  });

  it("separates Reply and Remove review and improves reply form a11y", () => {
    assert.match(replyControls, /justify-between/);
    assert.match(replyControls, /aria-expanded=\{open\}/);
    assert.match(replyControls, /aria-controls=\{panelId\}/);
    assert.match(replyControls, /minLength=\{3\}/);
    assert.match(replyControls, /maxLength=\{5000\}/);
    assert.match(replyControls, /Post reply/);
    assert.match(replyControls, /Cancel/);
    assert.match(replyControls, /border-y border-line\/80 bg-cream\/30/);
    assert.match(liveFeed, /canOpenMembers && review\.userId/);
    assert.match(recipeReviewsLib, /recipeStatus/);
    assert.match(recipeReviewsLib, /status: true/);
  });

  it("uses a Reviews-specific workspace width", () => {
    assert.equal(adminWorkspaceReviews, "max-w-3xl");
    assert.equal(adminWorkspaceWidthForPath("/admin/reviews"), adminWorkspaceReviews);
    assert.notEqual(adminWorkspaceWidthForPath("/admin/staff"), adminWorkspaceReviews);
    assert.equal(adminWorkspaceWidthForPath("/admin/staff"), adminWorkspaceStandard);
  });

  it("keeps content-role access for Reviews", () => {
    assert.equal(canAccess("owner", "content"), true);
    assert.equal(canAccess("editor", "content"), true);
    assert.equal(canAccess("members", "content"), false);
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
