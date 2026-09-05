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
  PUBLIC_RECIPE_VISIBLE_COMMENTS,
  resolvePublicTargetReviewId,
  visibleRecipeReviewsForTarget,
  canManageRecipeReviewReplies,
  canReplyToRecipeReview,
  countStaffReviewReplies,
  formatAdminReplyAuthorDisplay,
  formatAdminReviewerType,
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

  it("builds public review anchors and Member/Visitor type labels", () => {
    assert.equal(
      adminReviewPublicAnchorHref({
        recipeSlug: "soft-stovetop-flatbread",
        recipeStatus: "published",
        reviewId: "rev_abc",
      }),
      "/recipes/soft-stovetop-flatbread?review=rev_abc#review-rev_abc",
    );
    assert.equal(
      adminReviewPublicAnchorHref({
        recipeSlug: "draft-cake",
        recipeStatus: "draft",
        reviewId: "rev_abc",
      }),
      null,
    );
    assert.equal(
      adminReviewPublicAnchorHref({
        recipeSlug: "iced-horchata-coffee",
        recipeStatus: null,
        reviewId: "rev_omid",
      }),
      "/recipes/iced-horchata-coffee?review=rev_omid#review-rev_omid",
    );
    assert.equal(formatAdminReviewerType("user_1"), "Member");
    assert.equal(formatAdminReviewerType(null), "Visitor");
    assert.equal(formatAdminReviewerType(undefined), "Visitor");
  });

  it("uses stored recipe slug and distinct review ids for same-recipe deep links", () => {
    const hrefA = adminReviewPublicAnchorHref({
      recipeSlug: "iced-horchata-coffee",
      recipeStatus: "published",
      reviewId: "rev_omid_excellent",
    });
    const hrefB = adminReviewPublicAnchorHref({
      recipeSlug: "iced-horchata-coffee",
      recipeStatus: "published",
      reviewId: "rev_masoomeh_water",
    });
    const hrefC = adminReviewPublicAnchorHref({
      recipeSlug: "vanilla-bean-cupcakes",
      recipeStatus: "published",
      reviewId: "rev_cupcake_1",
    });

    assert.equal(
      hrefA,
      "/recipes/iced-horchata-coffee?review=rev_omid_excellent#review-rev_omid_excellent",
    );
    assert.equal(
      hrefB,
      "/recipes/iced-horchata-coffee?review=rev_masoomeh_water#review-rev_masoomeh_water",
    );
    assert.equal(
      hrefC,
      "/recipes/vanilla-bean-cupcakes?review=rev_cupcake_1#review-rev_cupcake_1",
    );
    assert.notEqual(hrefA, hrefB);
  });

  it("resolves targeted review ids from query first, then hash", () => {
    assert.equal(
      resolvePublicTargetReviewId({
        reviewQuery: "rev_from_query",
        hash: "#review-rev_hash",
      }),
      "rev_from_query",
    );
    assert.equal(
      resolvePublicTargetReviewId({ reviewQuery: "", hash: "#review-rev_hash" }),
      "rev_hash",
    );
    assert.equal(
      resolvePublicTargetReviewId({ reviewQuery: null, hash: "review-rev_hash" }),
      "rev_hash",
    );
    assert.equal(resolvePublicTargetReviewId({ reviewQuery: "  ", hash: null }), null);
  });

  it("includes a targeted review outside the first page without duplicating", () => {
    const reviews = Array.from({ length: PUBLIC_RECIPE_VISIBLE_COMMENTS + 3 }, (_, i) => ({
      id: `rev_${i}`,
    }));
    const firstPage = visibleRecipeReviewsForTarget(reviews, {
      showAll: false,
      targetReviewId: null,
    });
    assert.equal(firstPage.length, PUBLIC_RECIPE_VISIBLE_COMMENTS);
    assert.deepEqual(
      firstPage.map((r) => r.id),
      reviews.slice(0, PUBLIC_RECIPE_VISIBLE_COMMENTS).map((r) => r.id),
    );

    const withTarget = visibleRecipeReviewsForTarget(reviews, {
      showAll: false,
      targetReviewId: `rev_${PUBLIC_RECIPE_VISIBLE_COMMENTS + 1}`,
    });
    assert.equal(withTarget.length, PUBLIC_RECIPE_VISIBLE_COMMENTS + 1);
    assert.equal(
      withTarget.filter((r) => r.id === `rev_${PUBLIC_RECIPE_VISIBLE_COMMENTS + 1}`).length,
      1,
    );
    assert.equal(withTarget.at(-1)?.id, `rev_${PUBLIC_RECIPE_VISIBLE_COMMENTS + 1}`);

    const alreadyVisible = visibleRecipeReviewsForTarget(reviews, {
      showAll: false,
      targetReviewId: "rev_2",
    });
    assert.equal(alreadyVisible.length, PUBLIC_RECIPE_VISIBLE_COMMENTS);
    assert.equal(alreadyVisible.filter((r) => r.id === "rev_2").length, 1);

    const showAll = visibleRecipeReviewsForTarget(reviews, {
      showAll: true,
      targetReviewId: `rev_${PUBLIC_RECIPE_VISIBLE_COMMENTS + 1}`,
    });
    assert.equal(showAll.length, reviews.length);
    assert.equal(
      showAll.filter((r) => r.id === `rev_${PUBLIC_RECIPE_VISIBLE_COMMENTS + 1}`).length,
      1,
    );
  });

  it("normalizes review IDs for bulk deletion", async () => {
    const { normalizeReviewIds } = await import("./recipe-reviews.ts");
    assert.deepEqual(normalizeReviewIds([" a ", "a", "", "  ", "b"]), ["a", "b"]);
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

  it("renders a compact ledger with public title links and inline reply expansion", () => {
    assert.match(reviewsIndex, /adminReviewPublicAnchorHref/);
    assert.match(reviewsIndex, /formatAdminReviewerType/);
    assert.match(reviewsIndex, /variant="inline"/);
    assert.match(reviewsIndex, /expandedReviewId/);
    assert.match(reviewsIndex, /ReviewExcerptControl/);
    assert.match(reviewsIndex, /AdminReviewReplyControls/);
    assert.match(reviewsIndex, /RemoveReviewButton/);
    assert.match(
      reviewsIndex,
      /View \$\{review\.authorName\}'s review on \$\{review\.recipeTitle\} \(opens in a new tab\)/,
    );
    assert.match(reviewsIndex, /<a[\s\S]*href=\{publicHref\}/);
    assert.match(reviewsIndex, /target="_blank"/);
    assert.match(reviewsIndex, /noopener noreferrer/);
    assert.match(reviewsIndex, /underline/);
    assert.match(reviewsIndex, /ReviewExcerptControl/);
    assert.match(reviewsIndex, /onToggle/);
    assert.match(reviewsIndex, /line-clamp-2/);
    assert.match(reviewsIndex, /scope="col"/);
    assert.match(reviewsIndex, />\s*Review\s*</);
    assert.match(reviewsIndex, />\s*Reviewer\s*</);
    assert.match(reviewsIndex, />\s*Type\s*</);
    assert.match(reviewsIndex, />\s*Rating\s*</);
    assert.match(reviewsIndex, />\s*Response\s*</);
    assert.match(reviewsIndex, />\s*Date\s*</);
    assert.match(reviewsIndex, /hidden min-w-0 xl:block/);
    assert.match(reviewsIndex, /xl:hidden/);
    assert.doesNotMatch(reviewsIndex, /adminReviewReplyWorkflowHref/);
    assert.doesNotMatch(reviewsIndex, /ReviewRepliesSection|RemoveReplyButton/);
    assert.doesNotMatch(reviewsIndex, /ReplyAvatar/);
    assert.doesNotMatch(reviewsIndex, /max-w-\[42rem\]/);
  });

  it("supports Visitors-style selection mode and current-page bulk delete", () => {
    assert.match(reviewsIndex, /Select reviews/);
    assert.match(reviewsIndex, /Cancel selection/);
    assert.match(reviewsIndex, /Select page/);
    assert.match(reviewsIndex, /Select reviews on this page/);
    assert.match(reviewsIndex, /Delete selected/);
    assert.match(reviewsIndex, /deleteReviewsAction/);
    assert.match(reviewsIndex, /selectedIds/);
    assert.match(reviewsIndex, /togglePage/);
    assert.match(
      reviewsIndex,
      /Select review by \$\{review\.authorName\} on \$\{review\.recipeTitle\}/,
    );
    assert.match(reviewsIndex, /setExpandedReviewId\(null\)/);
    assert.match(reviewsIndex, /bulkRemoved=\$\{result\.deletedCount\}/);
    assert.match(
      reviewsIndex,
      /Remove \$\{count\} selected \$\{noun\}\?[\s\S]*will also be removed/,
    );
    assert.match(actions, /export async function deleteReviewsAction/);
    assert.match(actions, /await requireEditor\(\)/);
    assert.match(actions, /deleteReviewsByIds/);
    assert.match(recipeReviewsLib, /export function normalizeReviewIds/);
    assert.match(recipeReviewsLib, /export async function deleteReviewsByIds/);
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

  it("shows Review removed, bulk removed, and Reply posted flashes on the index", () => {
    assert.match(reviewsPage, /Review removed\./);
    assert.match(reviewsPage, /Reply posted\./);
    assert.match(reviewsPage, /REVIEW_REMOVED_PARAMS/);
    assert.match(reviewsPage, /REVIEW_BULK_REMOVED_PARAMS/);
    assert.match(reviewsPage, /REVIEW_REPLIED_PARAMS/);
    assert.match(reviewsPage, /bulkRemovedCount === 1/);
    assert.match(reviewsPage, /reviews removed\./);
    assert.doesNotMatch(reviewsPage, /Reply removed\./);
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
    assert.match(replyControls, /variant === "inline"/);
    assert.match(replyControls, /name="page"/);
    assert.match(replyControls, /name="returnTo"/);
    assert.match(replyControls, /value="index"/);
    assert.match(replyControls, /minLength=\{3\}/);
    assert.match(replyControls, /maxLength=\{5000\}/);
    assert.match(replyControls, /Post reply/);
    assert.match(replyControls, /triggerRef\.current\?\.focus/);
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

  it("keeps reply delete on detail; index inline replies return to the ledger", () => {
    assert.match(reviewDetailPage, /Reply posted\./);
    assert.match(reviewDetailPage, /Reply removed\./);
    assert.match(reviewDetailPage, /REVIEW_REPLY_REMOVED_PARAMS/);
    assert.match(
      actions,
      /deleteReviewReplyAction[\s\S]*?redirect\(`\/admin\/reviews\/\$\{result\.reviewId\}\?replyRemoved=1`\)/,
    );
    assert.match(actions, /returnToIndex/);
    assert.match(actions, /indexRedirect\(\{ replied: "1" \}\)/);
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
    const recipePage = readFileSync(
      path.join(root, "../app/recipes/[slug]/page.tsx"),
      "utf8",
    );
    assert.match(publicReviews, /id=\{`review-\$\{review\.id\}`\}/);
    assert.match(publicReviews, /visibleRecipeReviewsForTarget/);
    assert.match(publicReviews, /targetReviewId/);
    assert.match(publicReviews, /scroll-mt-28/);
    assert.match(publicReviews, /\btarget:/);
    assert.match(publicReviews, /#review-/);
    assert.match(recipePage, /targetReviewId=\{verifiedTargetReviewId\}/);
    assert.match(recipePage, /searchParams/);
    assert.match(recipePage, /reviewData\.reviews\.some/);
  });

  it("keeps review excerpt as inline reply control, not a public navigation link", () => {
    assert.match(reviewsIndex, /function ReviewExcerptControl/);
    assert.match(reviewsIndex, /type="button"/);
    assert.match(reviewsIndex, /aria-expanded=\{expanded\}/);
    assert.doesNotMatch(
      reviewsIndex,
      /ReviewExcerptControl[\s\S]{0,400}href=\{publicHref\}/,
    );
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
