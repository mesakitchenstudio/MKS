import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canAccess } from "./admin-access.ts";
import { adminWorkspaceWidthForPath } from "./admin-nav.ts";
import {
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminWorkspaceReviews,
  adminWorkspaceStandard,
} from "./admin-ui.ts";
import {
  adminReviewRecipeHref,
  canManageRecipeReviewReplies,
  canReplyToRecipeReview,
  countStaffReviewReplies,
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
const removeReview = readFileSync(
  path.join(root, "../components/admin/RemoveReviewButton.tsx"),
  "utf8",
);
const removeReply = readFileSync(
  path.join(root, "../components/admin/RemoveReplyButton.tsx"),
  "utf8",
);
const recipeReviewsLib = readFileSync(path.join(root, "./recipe-reviews.ts"), "utf8");
const actions = readFileSync(path.join(root, "../app/admin/actions.ts"), "utf8");

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

  it("counts staff replies separately from member follow-ups", () => {
    assert.equal(countStaffReviewReplies([]), 0);
    assert.equal(countStaffReviewReplies([{ isStaff: false }]), 0);
    assert.equal(countStaffReviewReplies([{ isStaff: true }]), 1);
    assert.equal(
      countStaffReviewReplies([{ isStaff: true }, { isStaff: false }, { isStaff: true }]),
      2,
    );
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
    assert.match(reviewsPage, /Read and respond to member reviews on Mesa recipes\./);
    assert.doesNotMatch(reviewsPage, /Removing a review also removes/);
    assert.match(liveFeed, /No reviews yet\./);
    assert.doesNotMatch(liveFeed, /No reviews to moderate/);
  });

  it("keeps an open hairline ledger without per-review card cages", () => {
    assert.match(liveFeed, /divide-y divide-line\/80 border-y border-line\/80/);
    assert.doesNotMatch(liveFeed, /border border-line bg-paper/);
    assert.doesNotMatch(repliesSection, /Conversation/);
    assert.match(repliesSection, /border-l-2 border-line\/80/);
    assert.match(repliesSection, /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
    assert.match(repliesSection, /h-8 w-8/);
    assert.match(liveFeed, /RECIPE_REVIEW_POLL_MS/);
    assert.match(liveFeed, /Reviews pagination/);
    assert.match(liveFeed, /formatReviewRatingAccessible/);
    assert.match(liveFeed, /formatReviewRating\(/);
    assert.match(liveFeed, /★ \{ratingLabel\}/);
    assert.doesNotMatch(liveFeed, /StarRating|star-rating/i);
    assert.doesNotMatch(liveFeed, /max-w-\[42rem\]/);
    assert.doesNotMatch(liveFeed, /max-w-\[36rem\]|max-w-xl|max-w-2xl|max-w-3xl/);
  });

  it("derives Needs response from zero staff replies only", () => {
    assert.match(liveFeed, /countStaffReviewReplies/);
    assert.match(liveFeed, /staffReplyCount === 0/);
    assert.match(liveFeed, /Needs response/);
    assert.match(liveFeed, /NeedsResponseIndicator/);
    assert.doesNotMatch(liveFeed, /unreplied|Answered|Resolved/);
    assert.doesNotMatch(liveFeed, /uppercase tracking-/);
    assert.doesNotMatch(replyControls, /Needs response|Answered|Resolved/);
  });

  it("places review overflow in the header; footer is reply-only", () => {
    const headerCluster = liveFeed.slice(
      liveFeed.indexOf("★ {ratingLabel}"),
      liveFeed.indexOf("whitespace-pre-wrap break-words text-base"),
    );
    assert.match(headerCluster, /NeedsResponseIndicator/);
    assert.match(headerCluster, /RemoveReviewButton/);
    assert.match(liveFeed, /authorEmail/);
    assert.match(liveFeed, /flex-wrap items-baseline/);

    assert.match(replyControls, /staffReplyCount > 0 \? "Add another reply" : "Reply"/);
    assert.doesNotMatch(replyControls, /children/);
    assert.doesNotMatch(replyControls, /RemoveReviewButton/);
    assert.doesNotMatch(replyControls, /justify-between/);
    assert.match(liveFeed, /<AdminReviewReplyControls[\s\S]*?\/>/);
    assert.doesNotMatch(
      liveFeed,
      /<AdminReviewReplyControls[\s\S]*?<RemoveReviewButton/,
    );
  });

  it("uses Reply vs Add another reply from staff reply count only", () => {
    assert.match(liveFeed, /countStaffReviewReplies/);
    assert.match(replyControls, /staffReplyCount > 0 \? "Add another reply" : "Reply"/);
    assert.match(liveFeed, /RemoveReviewButton/);
  });

  it("keeps Reply composer a11y and returns focus on Cancel", () => {
    assert.match(replyControls, /aria-expanded=\{open\}/);
    assert.match(replyControls, /aria-controls=\{panelId\}/);
    assert.match(replyControls, /minLength=\{3\}/);
    assert.match(replyControls, /maxLength=\{5000\}/);
    assert.match(replyControls, /Post reply/);
    assert.match(replyControls, /adminPrimaryButtonClass/);
    assert.match(replyControls, /triggerRef\.current\?\.focus/);
    assert.match(liveFeed, /canOpenMembers && review\.userId/);
    assert.match(recipeReviewsLib, /recipeStatus/);
    assert.match(recipeReviewsLib, /ADMIN_REVIEWS_PAGE_SIZE = 40/);
  });

  it("places Remove review in overflow and Remove reply reply-locally", () => {
    assert.match(removeReview, /adminIconButtonClass/);
    assert.match(
      removeReview,
      /Review actions for \$\{recipeTitle\} by \$\{authorName\}/,
    );
    assert.match(removeReview, /role="menuitem"/);
    assert.match(removeReview, /including any\s+replies/);
    assert.match(removeReview, /adminSecondaryButtonClass/);
    assert.doesNotMatch(removeReview, /rounded-full/);
    assert.match(removeReply, /More actions for reply by \$\{authorName\}/);
    assert.match(removeReply, /adminIconButtonClass/);
    assert.match(repliesSection, /RemoveReplyButton/);
    assert.match(liveFeed, /RemoveReviewButton/);
    assert.doesNotMatch(liveFeed, />\s*Remove review\s*</);
  });

  it("distinguishes review vs reply removal flash messages", () => {
    assert.match(reviewsPage, /Review removed\./);
    assert.match(reviewsPage, /Reply removed\./);
    assert.match(reviewsPage, /REVIEW_REPLY_REMOVED_PARAMS/);
    assert.match(actions, /deleteReviewAction[\s\S]*?redirect\("\/admin\/reviews\?removed=1"\)/);
    assert.match(
      actions,
      /deleteReviewReplyAction[\s\S]*?redirect\("\/admin\/reviews\?replyRemoved=1"\)/,
    );
    const replyDelete = actions.slice(
      actions.indexOf("export async function deleteReviewReplyAction"),
      actions.indexOf("export async function replyToReviewAction"),
    );
    assert.doesNotMatch(replyDelete, /removed=1/);
    assert.match(replyDelete, /replyRemoved=1/);
  });

  it("uses a Reviews-specific workspace width around 58rem without nested narrow caps", () => {
    assert.equal(adminWorkspaceReviews, "max-w-[58rem]");
    assert.equal(adminWorkspaceWidthForPath("/admin/reviews"), adminWorkspaceReviews);
    assert.notEqual(adminWorkspaceWidthForPath("/admin/staff"), adminWorkspaceReviews);
    assert.equal(adminWorkspaceWidthForPath("/admin/staff"), adminWorkspaceStandard);
    assert.doesNotMatch(liveFeed, /max-w-\[42rem\]/);
    assert.doesNotMatch(repliesSection, /max-w-\[42rem\]/);
    assert.match(reviewsPage, /max-w-2xl/);
    assert.doesNotMatch(reviewsPage, /max-w-\[42rem\]|max-w-\[58rem\]/);
  });

  it("keeps content-role access for Reviews; members area remains Owner-only for links", () => {
    assert.equal(canAccess("owner", "content"), true);
    assert.equal(canAccess("editor", "content"), true);
    assert.equal(canAccess("members", "content"), false);
    assert.equal(canAccess("owner", "members"), true);
    assert.equal(canAccess("editor", "members"), false);
    assert.match(reviewsPage, /canAccess\(admin\.role, "members"\)/);
  });

  it("uses standardized modal button tokens", () => {
    assert.ok(adminPrimaryButtonClass.includes("rounded-md"));
    assert.ok(adminSecondaryButtonClass.includes("border border-line"));
    assert.match(removeReview, /adminSecondaryButtonClass/);
    assert.match(removeReply, /adminSecondaryButtonClass/);
    assert.doesNotMatch(removeReply, /rounded-full/);
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
