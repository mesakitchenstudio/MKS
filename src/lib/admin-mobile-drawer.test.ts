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
      "Studio",
      "Categories",
      "Series",
      "Recipe types",
      "Reviews",
      "Members",
      "Visitors",
      "YouTube",
      "Team access",
    ]);
    assert.deepEqual(
      buildAdminNavSections("owner").map((section) => section.label),
      ["Publishing", "Library", "Community", "Analytics", "Team"],
    );
  });

  it("keeps editor-permitted items including YouTube without staff or members access", () => {
    const sections = buildAdminNavSections("editor");
    const labels = flattenAdminNavItemLabels(sections);
    assert.deepEqual(
      sections.map((section) => section.label),
      ["Publishing", "Library", "Community", "Analytics"],
    );
    assert.deepEqual(labels, [
      "Recipes",
      "Studio",
      "Categories",
      "Series",
      "Recipe types",
      "Reviews",
      "YouTube",
    ]);
    assert.equal(labels.includes("Members"), false);
    assert.equal(labels.includes("Visitors"), false);
    assert.equal(labels.includes("Team access"), false);
  });

  it("hides publishing/library/team from audience-only members role", () => {
    const sections = buildAdminNavSections("members");
    const labels = flattenAdminNavItemLabels(sections);
    assert.deepEqual(
      sections.map((section) => section.label),
      ["Community", "Analytics"],
    );
    assert.deepEqual(labels, ["Members", "Visitors"]);
    assert.equal(labels.includes("Reviews"), false);
    assert.equal(labels.includes("YouTube"), false);
    assert.equal(labels.includes("Recipes"), false);
    assert.equal(labels.includes("Team access"), false);
  });
});
