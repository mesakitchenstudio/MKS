import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminMobileDrawerNavScrollClass } from "@/components/admin/AdminSidebarNav";
import {
  buildAdminNavSections,
  flattenAdminNavItemLabels,
} from "@/lib/admin-nav";

describe("admin mobile drawer navigation", () => {
  it("uses a unified scroll region class for short landscape viewports", () => {
    assert.match(adminMobileDrawerNavScrollClass, /\bmin-h-0\b/);
    assert.match(adminMobileDrawerNavScrollClass, /\boverflow-y-auto\b/);
    assert.match(adminMobileDrawerNavScrollClass, /\boverscroll-y-contain\b/);
  });

  it("renders the same permission-derived owner nav regardless of YouTube subview", () => {
    const channelNav = flattenAdminNavItemLabels(buildAdminNavSections("owner"));
    const funnelNav = flattenAdminNavItemLabels(buildAdminNavSections("owner"));
    assert.deepEqual(funnelNav, channelNav);
    assert.deepEqual(channelNav, [
      "Recipes",
      "Recipe types",
      "Categories",
      "Series",
      "Reviews",
      "Members",
      "Visitors",
      "YouTube",
      "Team access",
    ]);
  });

  it("keeps editor-permitted items including YouTube without staff access", () => {
    const labels = flattenAdminNavItemLabels(buildAdminNavSections("editor"));
    assert.ok(labels.includes("YouTube"));
    assert.ok(labels.includes("Recipes"));
    assert.equal(labels.includes("Team access"), false);
    assert.equal(labels.includes("Members"), false);
  });

  it("hides YouTube from audience-only members role", () => {
    const labels = flattenAdminNavItemLabels(buildAdminNavSections("members"));
    assert.ok(labels.includes("Members"));
    assert.ok(labels.includes("Visitors"));
    assert.equal(labels.includes("YouTube"), false);
    assert.equal(labels.includes("Recipes"), false);
  });
});
