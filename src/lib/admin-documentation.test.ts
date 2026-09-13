import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
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

describe("Admin documentation Phase 1 path resolution", () => {
  it("maps pilot routes to the correct topics", () => {
    assert.equal(getAdminDocTopicForPath("/admin")?.id, "recipes");
    assert.equal(getAdminDocTopicForPath("/admin/")?.id, "recipes");
    assert.equal(getAdminDocTopicForPath("/admin/recipes/new")?.id, "recipe-editor");
    assert.equal(
      getAdminDocTopicForPath("/admin/recipes/clr123abc")?.id,
      "recipe-editor",
    );
    assert.equal(getAdminDocTopicForPath("/admin/search-console")?.id, "search-console");
    assert.equal(getAdminDocTopicForPath("/admin/categories")?.id, "categories");
  });

  it("excludes preview, auth, history, and unwired Admin routes", () => {
    assert.equal(getAdminDocTopicForPath("/admin/recipes/clr123/preview"), null);
    assert.equal(getAdminDocTopicForPath("/admin/recipes/clr123/history"), null);
    assert.equal(getAdminDocTopicForPath("/admin/recipes/clr123/history/rev1"), null);
    assert.equal(getAdminDocTopicForPath("/admin/login"), null);
    assert.equal(getAdminDocTopicForPath("/admin/forgot-password"), null);
    assert.equal(getAdminDocTopicForPath("/admin/reset-password"), null);
    assert.equal(getAdminDocTopicForPath("/admin/media"), null);
    assert.equal(getAdminDocTopicForPath("/admin/youtube"), null);
    assert.equal(getAdminDocTopicForPath("/admin/staff"), null);
    assert.equal(getAdminDocTopicForPath("/recipes/some-slug"), null);
    assert.equal(getAdminDocTopicForPath("/"), null);
  });
});

describe("Admin documentation Phase 1 registry", () => {
  it("includes exactly the four pilot topics without duplicate ids", () => {
    const topics = listAdminDocTopics();
    assert.deepEqual(
      topics.map((topic) => topic.id).sort(),
      ["categories", "recipe-editor", "recipes", "search-console"],
    );
    const ids = new Set(ADMIN_DOC_TOPICS.map((topic) => topic.id));
    assert.equal(ids.size, ADMIN_DOC_TOPICS.length);
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

  it("loads topic content for each pilot", () => {
    for (const id of ["recipes", "recipe-editor", "search-console", "categories"]) {
      const topic = getAdminDocTopicById(id);
      assert.ok(topic);
      assert.ok(topic.title.trim());
      assert.ok(topic.summary.trim());
      assert.ok(topic.sections.length >= 4);
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
    assert.equal(opened.formState.title, "Unsaved profiteroles");
    assert.equal(opened.formState.cookMinutes, 15);

    const closed = toggleDocumentationOverlayWithoutTouchingForm(
      opened.formState,
      opened.documentationOpen,
      false,
    );
    assert.equal(closed.documentationOpen, false);
    assert.deepEqual(closed.formState, dirty);
  });
});

describe("Admin documentation Phase 1 UI contracts", () => {
  it("uses z-[70] drawer with dialog accessibility and Escape/backdrop close", () => {
    const drawer = read("components/admin/AdminDocumentationDrawer.tsx");
    assert.equal(ADMIN_DOCUMENTATION_DRAWER_Z_CLASS, "z-[70]");
    assert.match(drawer, /ADMIN_DOCUMENTATION_DRAWER_Z_CLASS/);
    assert.match(drawer, /role="dialog"/);
    assert.match(drawer, /aria-modal="true"/);
    assert.match(drawer, /aria-labelledby=\{titleId\}/);
    assert.match(drawer, /Escape/);
    assert.match(drawer, /createPortal/);
    assert.match(drawer, /sm:max-w-lg/);
    assert.match(drawer, /document\.body\.style\.overflow = "hidden"/);
    assert.match(drawer, /returnFocusRef/);
    assert.match(drawer, /Close documentation/);
  });

  it("Documentation button is a labelled secondary control", () => {
    const button = read("components/admin/AdminDocumentationButton.tsx");
    assert.match(button, /type="button"/);
    assert.match(button, />\s*Documentation\s*</);
    assert.match(button, /adminSecondaryButtonClass|adminCompactSecondaryButtonClass/);
    assert.match(button, /aria-expanded=\{open\}/);
    assert.match(button, /aria-haspopup="dialog"/);
    assert.doesNotMatch(button, /router\.(push|replace|refresh)/);
  });

  it("wires pilot pages without public-route documentation", () => {
    const recipes = read("components/admin/RecipesIndex.tsx");
    assert.match(recipes, /AdminPageHeader/);
    assert.match(recipes, /documentationTopicId="recipes"/);
    assert.match(recipes, /Find, filter and manage every Mesa recipe/);

    const categories = read("components/admin/CategoriesManager.tsx");
    assert.match(categories, /documentationTopicId="categories"/);
    assert.match(categories, /AdminPageHeader/);

    const searchConsole = read("app/admin/(app)/search-console/page.tsx");
    assert.match(searchConsole, /documentationTopicId="search-console"/);
    assert.match(searchConsole, /AdminPageHeader/);

    const editor = read("components/admin/RecipeEditor.tsx");
    assert.match(editor, /AdminDocumentationButton/);
    assert.match(editor, /topicId="recipe-editor"/);
    assert.match(editor, /Create, edit, review, preview and publish this Mesa recipe/);
    assert.doesNotMatch(editor, /documentationTopicId[\s\S]{0,40}router\.(push|replace|refresh)/);

    const preview = read("app/admin/(preview)/recipes/[id]/preview/page.tsx");
    assert.doesNotMatch(preview, /AdminDocumentationButton|AdminPageHeader|documentationTopicId/);

    const publicRecipe = read("app/recipes/[slug]/page.tsx");
    assert.doesNotMatch(publicRecipe, /AdminDocumentationButton|getAdminDocTopicForPath/);
  });

  it("Recipe Editor keeps Documentation as a local overlay sibling of dirty state", () => {
    const editor = read("components/admin/RecipeEditor.tsx");
    // Button owns open state; editor does not navigate for docs.
    assert.match(editor, /AdminDocumentationButton topicId="recipe-editor"/);
    assert.doesNotMatch(
      editor,
      /Documentation[\s\S]{0,120}href=\{[^}]*documentation/,
    );
    assert.match(editor, /const \[title, setTitle\]/);
    assert.match(editor, /const \[values, setValues\]/);
  });
});
