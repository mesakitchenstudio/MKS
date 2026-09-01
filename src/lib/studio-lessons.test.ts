import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lessons, lessonHref, partitionStudioLessons, getLessonBySlug } from "@/data/lessons";
import { adminMobileDrawerNavScrollClass } from "@/components/admin/AdminSidebarNav";
import { shouldShowFloatingRecipeSearch } from "@/lib/public-search-ui";
import { pickLessonRelatedRecipeSlugs, STUDIO_PUBLIC_LINK_LIMIT } from "@/lib/studio-recipe-link-utils";
import { studioLessonTypeLabel } from "@/lib/studio-types";

describe("studio lessons", () => {
  it("partitions featured and remaining lessons", () => {
    const { featured, notes } = partitionStudioLessons(lessons);
    assert.equal(featured.slug, "how-to-measure");
    assert.equal(notes.length, 3);
    assert.ok(notes.every((lesson) => lesson.slug !== featured.slug));
  });

  it("builds lesson routes", () => {
    assert.equal(lessonHref("how-to-measure"), "/studio/how-to-measure");
  });

  it("assigns the approved primary types to the current four lessons", () => {
    assert.equal(getLessonBySlug("how-to-measure")?.type, "technique");
    assert.equal(getLessonBySlug("salted-vs-unsalted-butter")?.type, "ingredient");
    assert.equal(getLessonBySlug("knowing-your-oven")?.type, "equipment");
    assert.equal(getLessonBySlug("mise-en-place")?.type, "habit");
    assert.equal(studioLessonTypeLabel("technique"), "Technique");
  });
});

describe("studio recipe links", () => {
  it("prefers database slugs over static fallbacks", () => {
    assert.deepEqual(
      pickLessonRelatedRecipeSlugs(["a", "b", "c", "d"], ["legacy"]),
      ["a", "b", "c"],
    );
    assert.equal(STUDIO_PUBLIC_LINK_LIMIT, 3);
  });

  it("falls back to static lesson slugs when database links are empty", () => {
    assert.deepEqual(
      pickLessonRelatedRecipeSlugs([], ["chocolate-chunk-cookies", "weeknight-chile"]),
      ["chocolate-chunk-cookies", "weeknight-chile"],
    );
  });
});

describe("public search controls", () => {
  it("hides floating search on desktop and recipe detail pages", () => {
    assert.equal(shouldShowFloatingRecipeSearch({ isRecipeDetail: true, isDesktop: false }), false);
    assert.equal(shouldShowFloatingRecipeSearch({ isRecipeDetail: false, isDesktop: true }), false);
    assert.equal(shouldShowFloatingRecipeSearch({ isRecipeDetail: false, isDesktop: false }), true);
  });
});

describe("studio editorial accessibility helpers", () => {
  it("uses a unified scroll region for mobile admin drawer nav", () => {
    assert.match(adminMobileDrawerNavScrollClass, /\boverflow-y-auto\b/);
  });
});
