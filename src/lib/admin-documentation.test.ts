import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ADMIN_DOC_MAIN_NAV_PATHS,
  ADMIN_DOC_TOPICS,
  getAdminDocTopicById,
  getAdminDocTopicForPath,
  isApprovedRelatedDocTopicId,
  listAdminDocTopics,
  toggleDocumentationOverlayWithoutTouchingForm,
} from "./admin-documentation/index.ts";
import { ADMIN_DOCUMENTATION_DRAWER_Z_CLASS } from "../components/admin/AdminDocumentationDrawer.tsx";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

const MAIN_NAV_EXPECTATIONS: Array<{ path: string; topicId: string }> = [
  { path: "/admin", topicId: "recipes" },
  { path: "/admin/recipes/new", topicId: "recipe-editor" },
  { path: "/admin/content-calendar", topicId: "content-calendar" },
  { path: "/admin/content-health", topicId: "content-health" },
  { path: "/admin/site-health", topicId: "site-health" },
  { path: "/admin/notifications", topicId: "notifications" },
  { path: "/admin/studio", topicId: "studio" },
  { path: "/admin/media", topicId: "media" },
  { path: "/admin/categories", topicId: "categories" },
  { path: "/admin/ingredients", topicId: "ingredients" },
  { path: "/admin/series", topicId: "series" },
  { path: "/admin/types", topicId: "recipe-types" },
  { path: "/admin/redirects", topicId: "redirects" },
  { path: "/admin/reviews", topicId: "reviews" },
  { path: "/admin/members", topicId: "members" },
  { path: "/admin/newsletter", topicId: "newsletter" },
  { path: "/admin/content-performance", topicId: "content-performance" },
  { path: "/admin/visitors", topicId: "visitors" },
  { path: "/admin/search", topicId: "search-analytics" },
  { path: "/admin/search-console", topicId: "search-console" },
  { path: "/admin/youtube", topicId: "youtube" },
  { path: "/admin/staff", topicId: "team-access" },
  { path: "/admin/activity", topicId: "activity" },
  { path: "/admin/profile", topicId: "profile" },
];

const PHASE3_ROUTE_EXPECTATIONS: Array<{ path: string; topicId: string }> = [
  { path: "/admin/recipes/clr123/history", topicId: "recipe-history" },
  { path: "/admin/recipes/clr123/history/rev1", topicId: "recipe-history" },
  { path: "/admin/media/asset123", topicId: "media-asset" },
  { path: "/admin/series/new", topicId: "series-editor" },
  { path: "/admin/series/series123", topicId: "series-editor" },
  { path: "/admin/series/import", topicId: "series-import" },
  { path: "/admin/types/type123", topicId: "recipe-type-editor" },
  { path: "/admin/reviews/review123", topicId: "review-detail" },
  { path: "/admin/members/user123", topicId: "member-detail" },
  { path: "/admin/content-performance/recipes/r1", topicId: "recipe-performance" },
  { path: "/admin/visitors/guest123", topicId: "visitor-detail" },
  { path: "/admin/youtube/videos/vid123", topicId: "youtube-video" },
];

describe("Admin documentation Phase 2 path resolution", () => {
  it("maps every main navigation destination to the expected topic", () => {
    for (const row of MAIN_NAV_EXPECTATIONS) {
      assert.equal(
        getAdminDocTopicForPath(row.path)?.id,
        row.topicId,
        row.path,
      );
    }
    assert.equal(getAdminDocTopicForPath("/admin/recipes/new")?.id, "recipe-editor");
    assert.equal(getAdminDocTopicForPath("/admin/recipes/clr123abc")?.id, "recipe-editor");
    assert.deepEqual(
      [...ADMIN_DOC_MAIN_NAV_PATHS].sort(),
      MAIN_NAV_EXPECTATIONS.map((row) => row.path).sort(),
    );
  });

  it("excludes preview, auth, documentation center, and public routes", () => {
    assert.equal(getAdminDocTopicForPath("/admin/recipes/clr123/preview"), null);
    assert.equal(getAdminDocTopicForPath("/admin/documentation"), null);
    assert.equal(getAdminDocTopicForPath("/admin/login"), null);
    assert.equal(getAdminDocTopicForPath("/admin/forgot-password"), null);
    assert.equal(getAdminDocTopicForPath("/admin/reset-password"), null);
    assert.equal(getAdminDocTopicForPath("/recipes/some-slug"), null);
    assert.equal(getAdminDocTopicForPath("/"), null);
  });
});

describe("Admin documentation Phase 3 path resolution", () => {
  it("maps every Phase 3 deep route to the expected topic", () => {
    for (const row of PHASE3_ROUTE_EXPECTATIONS) {
      assert.equal(
        getAdminDocTopicForPath(row.path)?.id,
        row.topicId,
        row.path,
      );
    }
  });

  it("keeps recipe preview null even when history and editor resolve", () => {
    assert.equal(getAdminDocTopicForPath("/admin/recipes/clr123/preview"), null);
    assert.equal(getAdminDocTopicForPath("/admin/recipes/clr123")?.id, "recipe-editor");
    assert.equal(getAdminDocTopicForPath("/admin/recipes/clr123/history")?.id, "recipe-history");
  });
});

describe("Admin documentation registry", () => {
  it("keeps unique topic ids and useful content", () => {
    const topics = listAdminDocTopics();
    const ids = topics.map((topic) => topic.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(topics.length, 34);
    for (const topic of topics) {
      assert.ok(Boolean(topic.title.trim()), `missing title: ${topic.id}`);
      assert.ok(Boolean(topic.summary.trim()), `missing summary: ${topic.id}`);
      assert.ok(topic.sections.length >= 3, `too few sections: ${topic.id}`);
    }
  });

  it("keeps relatedTopicIds on known or approved future ids", () => {
    for (const topic of ADMIN_DOC_TOPICS) {
      for (const related of topic.relatedTopicIds ?? []) {
        assert.equal(
          isApprovedRelatedDocTopicId(related),
          true,
          `${topic.id} related ${related}`,
        );
      }
    }
  });

  it("loads Phase 3 topics by id with summary and useful sections", () => {
    for (const id of [
      "recipe-history",
      "media-asset",
      "series-editor",
      "series-import",
      "recipe-type-editor",
      "review-detail",
      "member-detail",
      "recipe-performance",
      "visitor-detail",
      "youtube-video",
    ]) {
      const topic = getAdminDocTopicById(id);
      assert.ok(topic, id);
      assert.ok(topic!.summary.trim().length > 20, id);
      assert.ok(topic!.sections.some((section) => section.id === "about"), `${id} about`);
      assert.ok(topic!.sections.some((section) => section.id === "rules"), `${id} rules`);
    }
  });

  it("exposes Recipe Editor section-help anchors", () => {
    const topic = getAdminDocTopicById("recipe-editor");
    assert.ok(topic);
    for (const id of ["basics", "details", "content", "media", "advanced"]) {
      assert.ok(topic!.sections.some((section) => section.id === id), id);
    }
  });
});

describe("Admin documentation overlay safety", () => {
  it("toggling documentation does not mutate dirty form fields", () => {
    const dirty = {
      title: "Unsaved profiteroles",
      prepMinutes: 30,
      cookMinutes: 15,
      bakeMinutes: 60,
      tags: ["choux", "cream"],
    };
    const opened = toggleDocumentationOverlayWithoutTouchingForm(dirty, false, true);
    assert.equal(opened.documentationOpen, true);
    assert.deepEqual(opened.formState, dirty);
    const closed = toggleDocumentationOverlayWithoutTouchingForm(
      opened.formState,
      opened.documentationOpen,
      false,
    );
    assert.equal(closed.documentationOpen, false);
    assert.deepEqual(closed.formState, dirty);
  });
});

describe("Admin documentation UI contracts", () => {
  it("keeps drawer accessibility, z-index, and in-drawer related navigation", () => {
    const drawer = read("components/admin/AdminDocumentationDrawer.tsx");
    assert.equal(ADMIN_DOCUMENTATION_DRAWER_Z_CLASS, "z-[70]");
    assert.match(drawer, /role="dialog"/);
    assert.match(drawer, /aria-modal="true"/);
    assert.match(drawer, /Escape/);
    assert.match(drawer, /createPortal/);
    assert.match(drawer, /sm:max-w-lg/);
    assert.match(drawer, /topicStack/);
    assert.match(drawer, /← Back/);
    assert.match(drawer, /openRelatedTopic/);
    assert.match(drawer, /initialSectionId/);
    assert.doesNotMatch(drawer, /useRouter|router\.push|href=\{.*related/);
  });

  it("wires Documentation on main navigation destinations", () => {
    assert.match(read("components/admin/RecipesIndex.tsx"), /documentationTopicId="recipes"/);
    assert.match(
      read("app/admin/(app)/content-calendar/page.tsx"),
      /documentationTopicId="content-calendar"/,
    );
    assert.match(
      read("app/admin/(app)/content-health/page.tsx"),
      /documentationTopicId="content-health"/,
    );
    assert.match(read("app/admin/(app)/site-health/page.tsx"), /documentationTopicId="site-health"/);
    assert.match(
      read("app/admin/(app)/notifications/page.tsx"),
      /documentationTopicId="notifications"/,
    );
    assert.match(read("app/admin/(app)/studio/page.tsx"), /documentationTopicId="studio"/);
    assert.match(read("app/admin/(app)/media/page.tsx"), /documentationTopicId="media"/);
    assert.match(read("app/admin/(app)/categories/page.tsx"), /CategoriesManager/);
    assert.match(read("components/admin/CategoriesManager.tsx"), /documentationTopicId="categories"/);
    assert.match(read("app/admin/(app)/ingredients/page.tsx"), /IngredientsManager/);
    assert.match(
      read("components/admin/IngredientsManager.tsx"),
      /documentationTopicId="ingredients"/,
    );
    assert.match(read("app/admin/(app)/series/page.tsx"), /documentationTopicId="series"/);
    assert.match(read("components/admin/AddTypeForm.tsx"), /documentationTopicId="recipe-types"/);
    assert.match(read("app/admin/(app)/redirects/page.tsx"), /documentationTopicId="redirects"/);
    assert.match(read("app/admin/(app)/reviews/page.tsx"), /documentationTopicId="reviews"/);
    assert.match(read("app/admin/(app)/members/page.tsx"), /documentationTopicId="members"/);
    assert.match(read("app/admin/(app)/newsletter/page.tsx"), /documentationTopicId="newsletter"/);
    assert.match(
      read("app/admin/(app)/content-performance/page.tsx"),
      /documentationTopicId="content-performance"/,
    );
    assert.match(read("app/admin/(app)/visitors/page.tsx"), /documentationTopicId="visitors"/);
    assert.match(read("app/admin/(app)/search/page.tsx"), /documentationTopicId="search-analytics"/);
    assert.match(
      read("app/admin/(app)/search-console/page.tsx"),
      /documentationTopicId="search-console"/,
    );
    assert.match(read("app/admin/(app)/youtube/page.tsx"), /AdminDocumentationButton/);
    assert.match(read("app/admin/(app)/youtube/page.tsx"), /topicId="youtube"/);
    assert.match(read("app/admin/(app)/staff/page.tsx"), /documentationTopicId="team-access"/);
    assert.match(read("app/admin/(app)/activity/page.tsx"), /documentationTopicId="activity"/);
    assert.match(read("app/admin/(app)/profile/page.tsx"), /documentationTopicId="profile"/);
    assert.match(read("components/admin/RecipeEditor.tsx"), /topicId="recipe-editor"/);
  });

  it("wires Documentation on Phase 3 deep pages without replacing primary actions", () => {
    assert.match(
      read("app/admin/(app)/recipes/[id]/history/page.tsx"),
      /topicId="recipe-history"/,
    );
    assert.match(
      read("app/admin/(app)/recipes/[id]/history/[revisionId]/page.tsx"),
      /topicId="recipe-history"/,
    );
    assert.match(read("app/admin/(app)/media/[id]/page.tsx"), /topicId="media-asset"/);
    assert.match(read("components/admin/SeriesEditor.tsx"), /topicId="series-editor"/);
    assert.match(read("components/admin/SeriesEditor.tsx"), /attemptSaveDraft|publishButtonLabel/);
    assert.match(read("app/admin/(app)/series/import/page.tsx"), /topicId="series-import"/);
    assert.match(read("app/admin/(app)/series/import/page.tsx"), /Create Mesa Collection instead/);
    assert.match(read("app/admin/(app)/types/[id]/page.tsx"), /topicId="recipe-type-editor"/);
    assert.match(read("components/admin/AdminReviewDetail.tsx"), /topicId="review-detail"/);
    assert.match(read("app/admin/(app)/members/[id]/page.tsx"), /topicId="member-detail"/);
    const performance = read("app/admin/(app)/content-performance/recipes/[id]/page.tsx");
    assert.match(performance, /topicId="recipe-performance"/);
    assert.match(performance, /Edit recipe/);
    assert.match(read("app/admin/(app)/visitors/[visitorId]/page.tsx"), /topicId="visitor-detail"/);
    assert.match(
      read("app/admin/(app)/youtube/videos/[videoId]/page.tsx"),
      /topicId="youtube-video"/,
    );
  });

  it("pilots Recipe Editor section help into the same drawer without Center navigation", () => {
    const editor = read("components/admin/RecipeEditor.tsx");
    assert.match(editor, /documentationSectionId="basics"/);
    assert.match(editor, /documentationSectionId="details"/);
    assert.match(editor, /documentationSectionId="content"/);
    assert.match(editor, /documentationSectionId="media"/);
    assert.match(editor, /initialSectionId="advanced"/);
    assert.match(editor, /quiet/);
    assert.match(editor, /allowDocumentationCenterNavigation=\{false\}/);
    assert.doesNotMatch(editor, /label=["']About this page["']/);
    const button = read("components/admin/AdminDocumentationButton.tsx");
    assert.match(button, /initialSectionId/);
    assert.match(button, /quiet/);
    assert.match(button, /label = "About this page"/);
    assert.match(button, /allowDocumentationCenterNavigation/);
    const drawer = read("components/admin/AdminDocumentationDrawer.tsx");
    assert.match(drawer, /openRelatedTopic/);
    assert.match(drawer, /← Back/);
  });

  it("keeps contextual About this page label centralized for page headers", () => {
    const button = read("components/admin/AdminDocumentationButton.tsx");
    assert.match(button, /label = "About this page"/);
    assert.match(
      read("components/admin/AdminPageHeader.tsx"),
      /AdminDocumentationButton topicId=\{documentationTopicId\}/,
    );
    assert.doesNotMatch(
      read("components/admin/AdminPageHeader.tsx"),
      /allowDocumentationCenterNavigation=\{false\}/,
    );
  });

  it("preserves Content Calendar action hierarchy with Documentation secondary", () => {
    const page = read("app/admin/(app)/content-calendar/page.tsx");
    assert.match(page, /documentationTopicId="content-calendar"/);
    assert.match(page, /Jump to Today/);
    assert.match(page, /\+ Recipe/);
    assert.match(page, /\+ YouTube release/);
    const docIdx = page.indexOf('documentationTopicId="content-calendar"');
    const jumpIdx = page.indexOf("Jump to Today");
    assert.ok(docIdx > 0 && jumpIdx > docIdx);
  });

  it("keeps preview and public routes free of Admin documentation", () => {
    const preview = read("app/admin/(preview)/recipes/[id]/preview/page.tsx");
    assert.doesNotMatch(preview, /AdminDocumentationButton|documentationTopicId/);
    const publicRecipe = read("app/recipes/[slug]/page.tsx");
    assert.doesNotMatch(publicRecipe, /AdminDocumentationButton|getAdminDocTopicForPath/);
  });
});
