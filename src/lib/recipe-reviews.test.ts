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
  adminWorkspaceReviewsDetail,
  adminWorkspaceReviewsList,
  adminWorkspaceStandard,
} from "./admin-ui.ts";
import {
  adminReviewPublicAnchorHref,
  adminReviewRecipeHref,
  adminReviewReplyWorkflowHref,
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
const reviewDetailPage = readFileSync(
  path.join(root, "../app/admin/(app)/reviews/[id]/page.tsx"),
  "utf8",
);
const reviewsIndex = readFileSync(
  path.join(root, "../components/admin/AdminReviewsIndex.tsx"),
  "utf8",
);
const reviewDetail = readFileSync(
  path.join(root, "../components/admin/AdminReviewDetail.tsx"),
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

  it("builds public review anchors and admin reply workflow hrefs", () => {
    assert.equal(
      adminReviewPublicAnchorHref({
        recipeSlug: "soft-stovetop-flatbread",
        recipeStatus: "published",
        reviewId: "rev_abc",
      }),
      "/recipes/soft-stovetop-flatbread#review-rev_abc",
    );
    assert.equal(
      adminReviewPublicAnchorHref({
        recipeSlug: "draft-cake",
        recipeStatus: "draft",
        reviewId: "rev_abc",
      }),
      null,
    );
    assert.equal(adminReviewReplyWorkflowHref("rev_abc"), "/admin/reviews/rev_abc?reply=1");
  });
});

describe("admin Reviews index contracts", () => {
  it("uses restrained header copy without Community or cascade lede", () => {
    assert.match(reviewsPage, />\s*Reviews\s*</);
    assert.doesNotMatch(reviewsPage, /Community/);
    assert.match(reviewsPage, /Read and respond to member reviews on Mesa recipes\./);
    assert.doesNotMatch(reviewsPage, /Removing a review also removes/);
    assert.match(reviewsIndex, /No reviews yet\./);
    assert.match(reviewsPage, /AdminReviewsIndex/);
    assert.doesNotMatch(reviewsPage, /AdminReviewsLiveFeed|AdminReviewDetail/);
  });

  it("renders a compact ledger with split public and reply workflows", () => {
    assert.match(reviewsIndex, /adminReviewPublicAnchorHref/);
    assert.match(reviewsIndex, /adminReviewReplyWorkflowHref/);
    assert.match(reviewsIndex, /View \$\{review\.authorName\}'s review of \$\{review\.recipeTitle\} on the public recipe page/);
    assert.match(reviewsIndex, /Reply to \$\{review\.authorName\}'s review of \$\{review\.recipeTitle\}/);
    assert.match(reviewsIndex, /line-clamp-2/);
    assert.match(reviewsIndex, /scope="col"/);
    assert.match(reviewsIndex, />\s*Review\s*</);
    assert.match(reviewsIndex, />\s*Reviewer\s*</);
    assert.match(reviewsIndex, />\s*Rating\s*</);
    assert.match(reviewsIndex, />\s*Response\s*</);
    assert.match(reviewsIndex, />\s*Date\s*</);
    assert.match(reviewsIndex, /hidden min-w-0 xl:block/);
    assert.match(reviewsIndex, /xl:hidden/);
    assert.doesNotMatch(reviewsIndex, /AdminReviewReplyControls|ReviewRepliesSection|RemoveReviewButton|RemoveReplyButton/);
    assert.doesNotMatch(reviewsIndex, /ReplyAvatar/);
    assert.doesNotMatch(reviewsIndex, /max-w-\[42rem\]/);
  });

  it("derives Needs response and Replied from staff replies only", () => {
    assert.match(reviewsIndex, /countStaffReviewReplies\(replies\) === 0/);
    assert.match(reviewsIndex, /Needs response/);
    assert.match(reviewsIndex, />Replied</);
    assert.doesNotMatch(reviewsIndex, /unreplied|Answered|Resolved/);
    assert.match(reviewsIndex, /formatReviewRatingAccessible/);
    assert.match(reviewsIndex, /★ \{formatReviewRating/);
  });

  it("keeps pagination at 40 and polls every 4 seconds", () => {
    assert.match(recipeReviewsLib, /ADMIN_REVIEWS_PAGE_SIZE = 40/);
    assert.match(reviewsIndex, /RECIPE_REVIEW_POLL_MS/);
    assert.match(reviewsIndex, /Reviews pagination/);
    assert.equal(RECIPE_REVIEW_POLL_MS, 4_000);
    assert.match(recipeReviewsLib, /orderBy: \[\{ createdAt: "desc" \}/);
  });

  it("uses a wider Reviews index workspace and a detail conversation width", () => {
    assert.equal(adminWorkspaceReviewsList, "max-w-5xl");
    assert.equal(adminWorkspaceReviewsDetail, "max-w-[58rem]");
    assert.equal(adminWorkspaceWidthForPath("/admin/reviews"), adminWorkspaceReviewsList);
    assert.equal(
      adminWorkspaceWidthForPath("/admin/reviews/rev_1"),
      adminWorkspaceReviewsDetail,
    );
    assert.notEqual(adminWorkspaceWidthForPath("/admin/staff"), adminWorkspaceReviewsList);
    assert.equal(adminWorkspaceWidthForPath("/admin/staff"), adminWorkspaceStandard);
    assert.match(reviewsPage, /max-w-2xl/);
    assert.doesNotMatch(reviewsPage, /max-w-\[42rem\]|max-w-\[58rem\]/);
  });

  it("keeps content-role access for Reviews; members links stay on detail", () => {
    assert.equal(canAccess("owner", "content"), true);
    assert.equal(canAccess("editor", "content"), true);
    assert.equal(canAccess("members", "content"), false);
    assert.equal(canAccess("owner", "members"), true);
    assert.equal(canAccess("editor", "members"), false);
    assert.match(reviewDetailPage, /canAccess\(admin\.role, "members"\)/);
    assert.doesNotMatch(reviewsPage, /canAccess\(admin\.role, "members"\)/);
  });

  it("shows Review removed flash on the index after delete", () => {
    assert.match(reviewsPage, /Review removed\./);
    assert.match(reviewsPage, /REVIEW_REMOVED_PARAMS/);
    assert.doesNotMatch(reviewsPage, /Reply removed\.|Reply posted\./);
    assert.match(actions, /deleteReviewAction[\s\S]*?redirect\("\/admin\/reviews\?removed=1"\)/);
  });
});

describe("admin Reviews detail contracts", () => {
  it("loads a single review by id and notFound when missing", () => {
    assert.match(reviewDetailPage, /getReviewForAdmin/);
    assert.match(reviewDetailPage, /notFound\(\)/);
    assert.match(reviewDetailPage, /← Reviews/);
    assert.match(reviewDetailPage, /requireAccess\("content"\)/);
    assert.match(recipeReviewsLib, /export async function getReviewForAdmin/);
  });

  it("opens the reply composer from ?reply=1", () => {
    assert.match(reviewDetailPage, /reply === "1"/);
    assert.match(reviewDetailPage, /openReplyComposer/);
    assert.match(reviewDetail, /initialOpen=\{openReplyComposer\}/);
    assert.match(replyControls, /initialOpen = false/);
    assert.match(replyControls, /useState\(initialOpen\)/);
  });

  it("renders body, replies, reply workflow, and review management", () => {
    assert.match(reviewDetail, /review\.body/);
    assert.match(reviewDetail, /ReviewRepliesSection/);
    assert.match(reviewDetail, /AdminReviewReplyControls/);
    assert.match(reviewDetail, /Review actions/);
    assert.match(reviewDetail, /variant="text"/);
    assert.match(reviewDetail, /staffReplyCount === 0/);
    assert.match(reviewDetail, /Needs response/);
    assert.match(reviewDetail, /formatReviewRatingAccessible/);
    assert.match(reviewDetail, /★ \{ratingLabel\}/);
    assert.match(repliesSection, /reviewId=\{reviewId\}/);
    assert.match(repliesSection, /border-l-2 border-line\/80/);
    assert.doesNotMatch(reviewDetail, /border border-line bg-paper shadow/);
  });

  it("uses Reply vs Add another reply from staff reply count only", () => {
    assert.match(replyControls, /staffReplyCount > 0 \? "Add another reply" : "Reply"/);
    assert.match(replyControls, /aria-expanded=\{open\}/);
    assert.match(replyControls, /aria-controls=\{panelId\}/);
    assert.match(replyControls, /minLength=\{3\}/);
    assert.match(replyControls, /maxLength=\{5000\}/);
    assert.match(replyControls, /Post reply/);
    assert.match(replyControls, /triggerRef\.current\?\.focus/);
    assert.doesNotMatch(replyControls, /name="page"/);
  });

  it("keeps remove review/reply confirmations and contextual labels", () => {
    assert.match(removeReview, /adminIconButtonClass/);
    assert.match(removeReview, /adminDangerButtonClass/);
    assert.match(
      removeReview,
      /Review actions for \$\{recipeTitle\} by \$\{authorName\}/,
    );
    assert.match(removeReview, /including any\s+replies/);
    assert.match(removeReply, /More actions for reply by \$\{authorName\}/);
    assert.match(removeReply, /name="reviewId"/);
    assert.match(repliesSection, /RemoveReplyButton/);
    assert.doesNotMatch(removeReview, /rounded-full/);
    assert.doesNotMatch(removeReply, /rounded-full/);
  });

  it("keeps reply flash on detail and redirects reply delete back to detail", () => {
    assert.match(reviewDetailPage, /Reply posted\./);
    assert.match(reviewDetailPage, /Reply removed\./);
    assert.match(reviewDetailPage, /REVIEW_REPLY_REMOVED_PARAMS/);
    assert.match(reviewDetailPage, /REVIEW_REPLIED_PARAMS/);
    assert.match(
      actions,
      /deleteReviewReplyAction[\s\S]*?redirect\(`\/admin\/reviews\/\$\{result\.reviewId\}\?replyRemoved=1`\)/,
    );
    assert.match(
      actions,
      /replyToReviewAction[\s\S]*?redirect\(`\/admin\/reviews\/\$\{reviewId\}\?replied=1`\)/,
    );
    const replyDelete = actions.slice(
      actions.indexOf("export async function deleteReviewReplyAction"),
      actions.indexOf("export async function replyToReviewAction"),
    );
    assert.doesNotMatch(replyDelete, /removed=1/);
    assert.match(replyDelete, /replyRemoved=1/);
  });

  it("uses standardized modal button tokens", () => {
    assert.ok(adminPrimaryButtonClass.includes("rounded-md"));
    assert.ok(adminSecondaryButtonClass.includes("border border-line"));
    assert.match(removeReview, /adminSecondaryButtonClass/);
    assert.match(removeReply, /adminSecondaryButtonClass/);
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

describe("public recipe review anchors", () => {
  it("exposes stable review DOM ids for deep links", () => {
    const publicReviews = readFileSync(
      path.join(root, "../components/RecipeReviews.tsx"),
      "utf8",
    );
    assert.match(publicReviews, /id=\{`review-\$\{review\.id\}`\}/);
    assert.match(publicReviews, /pendingScrollReviewIdRef/);
    assert.match(publicReviews, /#review-/);
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
