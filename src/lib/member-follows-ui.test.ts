/**
 * Phase 8C — Follow actions, public controls, Following page, AccountMenu contracts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isMemberFollowsEnabled } from "./flags.ts";
import { isFollowableCategoryGroup } from "./member-follows.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(rel: string) {
  return readFileSync(path.join(root, "..", "..", rel), "utf8");
}

describe("Phase 8C — feature gate UI/actions", () => {
  it("gate remains exact true only; no NEXT_PUBLIC mirror", () => {
    const prev = process.env.MEMBER_FOLLOWS_ENABLED;
    try {
      delete process.env.MEMBER_FOLLOWS_ENABLED;
      assert.equal(isMemberFollowsEnabled(), false);
      process.env.MEMBER_FOLLOWS_ENABLED = "false";
      assert.equal(isMemberFollowsEnabled(), false);
      process.env.MEMBER_FOLLOWS_ENABLED = "True";
      assert.equal(isMemberFollowsEnabled(), false);
      process.env.MEMBER_FOLLOWS_ENABLED = "1";
      assert.equal(isMemberFollowsEnabled(), false);
      process.env.MEMBER_FOLLOWS_ENABLED = "true";
      assert.equal(isMemberFollowsEnabled(), true);
    } finally {
      if (prev === undefined) delete process.env.MEMBER_FOLLOWS_ENABLED;
      else process.env.MEMBER_FOLLOWS_ENABLED = prev;
    }

    const flags = readRepo("src/lib/flags.ts");
    assert.doesNotMatch(flags, /NEXT_PUBLIC_MEMBER_FOLLOWS/);
    assert.doesNotMatch(readRepo("src/components/MemberFollowButton.tsx"), /process\.env\.MEMBER_FOLLOWS|NEXT_PUBLIC_MEMBER_FOLLOWS/);
    assert.doesNotMatch(readRepo("src/components/AccountMenu.tsx"), /process\.env\.MEMBER_FOLLOWS|NEXT_PUBLIC_MEMBER_FOLLOWS/);
  });

  it("server actions enforce gate and never accept client userId", () => {
    const actions = readRepo("src/app/profile/follow-actions.ts");
    assert.match(actions, /"use server"/);
    assert.match(actions, /isMemberFollowsEnabled\(\)/);
    assert.match(actions, /FEATURE_DISABLED/);
    assert.match(actions, /findActiveMemberByEmail/);
    assert.match(actions, /followSeriesAction|followTargetAction/);
    assert.match(actions, /unfollowSeriesAction|unfollowTargetAction/);
    assert.match(actions, /followCategoryAction|followTargetAction/);
    assert.match(actions, /unfollowCategoryAction|unfollowTargetAction/);
    assert.match(actions, /getMemberFollowStateAction/);
    assert.match(actions, /revalidatePath\("\/profile\/following"\)/);
    assert.doesNotMatch(actions, /userId:\s*input|body\.userId|rawUserId/);
    assert.doesNotMatch(actions, /createRecipeFollowedPublish|memberNotification\.create/);
  });

  it("Following route is private, gated, force-dynamic, noindex", () => {
    const page = readRepo("src/app/profile/following/page.tsx");
    assert.match(page, /dynamic\s*=\s*"force-dynamic"/);
    assert.match(page, /isMemberFollowsEnabled/);
    assert.match(page, /notFound\(\)/);
    assert.match(page, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
    assert.match(page, /redirect\("\/profile"\)/);
    assert.match(page, /listMemberFollowsForUser/);
    assert.match(page, /findActiveMemberByEmail/);
    assert.doesNotMatch(page, /userId:\s*searchParams|params\.userId/);
  });
});

describe("Phase 8C — public cache / privacy architecture", () => {
  it("Series/Category pages stay ISR and do not resolve follow state server-side", () => {
    const seriesPage = readRepo("src/app/series/[slug]/page.tsx");
    const categoryPage = readRepo("src/app/category/[slug]/page.tsx");
    const seriesView = readRepo("src/components/series/SeriesDetailView.tsx");
    const button = readRepo("src/components/MemberFollowButton.tsx");

    assert.match(seriesPage, /revalidate\s*=\s*300/);
    assert.match(categoryPage, /revalidate\s*=\s*300/);
    assert.doesNotMatch(seriesPage, /force-dynamic|auth\(\)|isSeriesFollowedByUser|followed:/);
    assert.doesNotMatch(categoryPage, /force-dynamic|auth\(\)|isCategoryFollowedByUser|followed:/);
    assert.match(seriesPage, /memberFollowsEnabled=\{isMemberFollowsEnabled\(\)\}/);
    assert.match(categoryPage, /isMemberFollowsEnabled\(\)/);
    assert.match(categoryPage, /isFollowableCategoryGroup/);
    assert.match(seriesView, /MemberFollowButton/);
    assert.match(seriesView, /memberFollowsEnabled/);
    assert.match(button, /getMemberFollowStateAction/);
    assert.match(button, /mesa-open-auth/);
    assert.doesNotMatch(button, /mesa-pending-follow|sessionStorage|localStorage/);
    assert.doesNotMatch(seriesView, /unstable_cache/);
    assert.doesNotMatch(categoryPage, /unstable_cache/);
  });

  it("Follow does not enter JSON-LD builders", () => {
    const seriesLd = readRepo("src/lib/series.ts");
    const categorySeo = readRepo("src/lib/category-seo.ts");
    assert.match(seriesLd, /seriesItemListJsonLd|function seriesItemListJsonLd/);
    assert.doesNotMatch(categorySeo, /follow|MemberFollow/i);
    // Ensure Series JSON-LD helper file region stays free of follow language
    const idx = seriesLd.search(/ItemList|seriesItemListJsonLd/);
    assert.ok(idx >= 0);
    assert.doesNotMatch(seriesLd.slice(idx, idx + 1200), /follow/i);
  });
});

describe("Phase 8C — Follow control contracts", () => {
  it("shared MemberFollowButton is toggle with a11y state and no auto-follow", () => {
    const button = readRepo("src/components/MemberFollowButton.tsx");
    assert.match(button, /aria-pressed=\{following\}/);
    assert.match(button, /aria-label=\{label\}/);
    assert.match(button, /Follow \$\{target\.name\}/);
    assert.match(button, /Following \$\{target\.name\}/);
    assert.match(button, /followTargetAction|unfollowTargetAction/);
    assert.match(button, /disabled=\{pending\}/);
    assert.match(button, /mesa-open-auth/);
    assert.doesNotMatch(button, /Subscribe|follower count|followers/i);
    assert.doesNotMatch(button, /mesa-pending-follow|sessionStorage\[.mesa-pending/);
    assert.match(button, /never auto-follows after sign-in/);
  });

  it("method categories are not followable in UI eligibility helper", () => {
    assert.equal(isFollowableCategoryGroup("method"), false);
    assert.equal(isFollowableCategoryGroup("course"), true);
    assert.equal(isFollowableCategoryGroup("desserts"), true);
    assert.equal(isFollowableCategoryGroup("holiday"), true);

    const categoryPage = readRepo("src/app/category/[slug]/page.tsx");
    assert.match(categoryPage, /isFollowableCategoryGroup\(category\.group\)/);
    assert.match(categoryPage, /showFollow/);
  });

  it("Series preview mode never shows Follow", () => {
    const seriesView = readRepo("src/components/series/SeriesDetailView.tsx");
    assert.match(seriesView, /!isPreview && memberFollowsEnabled/);
  });
});

describe("Phase 8C — AccountMenu + Following UI", () => {
  it("AccountMenu Following is gated via server prop; order Profile → Following → Meal Planner", () => {
    const menu = readRepo("src/components/AccountMenu.tsx");
    const layout = readRepo("src/app/layout.tsx");
    const chrome = readRepo("src/components/PublicChrome.tsx");
    const header = readRepo("src/components/SiteHeader.tsx");

    assert.match(layout, /memberFollowsEnabled=\{isMemberFollowsEnabled\(\)\}/);
    assert.match(chrome, /memberFollowsEnabled/);
    assert.match(header, /memberFollowsEnabled=\{memberFollowsEnabled\}/);
    assert.match(menu, /memberFollowsEnabled/);
    assert.match(menu, /\{memberFollowsEnabled \?/);
    assert.match(menu, /\/profile\/following/);
    assert.match(menu, />\s*Following\s*</);
    assert.doesNotMatch(menu, /Notifications|unread/);

    const profileIdx = menu.indexOf('href="/profile"');
    const followingIdx = menu.indexOf('href="/profile/following"');
    const mealIdx = menu.indexOf('href="/profile/meal-planner"');
    assert.ok(profileIdx > 0 && followingIdx > profileIdx);
    assert.ok(mealIdx > followingIdx);
  });

  it("Following page has empty state and sections without follower counts", () => {
    const view = readRepo("src/components/ProfileFollowingView.tsx");
    const page = readRepo("src/app/profile/following/page.tsx");
    assert.match(page, /Topics and Collections you follow/);
    assert.match(view, /not following anything yet/);
    assert.match(view, /\/series/);
    assert.match(view, /\/recipes/);
    assert.match(view, /Collections/);
    assert.match(view, /Topics/);
    assert.match(view, /Unfollow/);
    assert.doesNotMatch(view, /follower|followedAt|notifications/i);
    assert.doesNotMatch(page, /MemberNotification|markMemberNotification/);
  });

  it("does not add Following section to Personalized Member Home", () => {
    const profile = readRepo("src/app/profile/page.tsx");
    const sections = readRepo("src/components/member-home/MemberHomeSections.tsx");
    assert.doesNotMatch(profile, /ProfileFollowing|\/profile\/following/);
    assert.doesNotMatch(sections, /Following|memberFollows/);
  });

  it("publish workflow remains unwired to notifications/follows", () => {
    const save = readRepo("src/app/admin/actions.ts");
    assert.doesNotMatch(save, /followTargetAction|createRecipeFollowedPublish|MemberNotification|userSeriesFollow/);
    const button = readRepo("src/components/MemberFollowButton.tsx");
    assert.doesNotMatch(button, /memberNotification|createRecipeFollowedPublish/);
  });
});

describe("Phase 8C — sitemap exclusion", () => {
  it("Following is not added to sitemap helpers", () => {
    const sitemap = readRepo("src/lib/sitemap-entries.ts");
    assert.doesNotMatch(sitemap, /profile\/following|member.?follow/i);
  });
});
