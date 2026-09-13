import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ADMIN_DOC_CATEGORY_ORDER,
  ADMIN_DOC_TOPIC_ACCESS,
  ADMIN_DOC_TOPIC_PAGE_LINKS,
  ADMIN_DOC_TOPICS,
  adminDocumentationCenterHref,
  canAccessAdminDocTopic,
  filterAdminDocTopicsForRole,
  getAdminDocPageLink,
  getAdminDocTopicById,
  getAdminDocTopicForPath,
  groupAdminDocTopicsByCategory,
  listAdminDocTopics,
  listAdminDocTopicsForRole,
  searchAdminDocTopics,
} from "./admin-documentation/index.ts";
import { canAccess } from "./admin-access.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("Admin documentation Phase 4 center access", () => {
  it("requires authenticated Admin session on the Documentation Center page", () => {
    const page = read("app/admin/(app)/documentation/page.tsx");
    assert.match(page, /getAdminSession/);
    assert.match(page, /redirect\("\/admin\/login"\)/);
    assert.match(page, /listAdminDocTopicsForRole/);
    assert.doesNotMatch(page, /AdminDocumentationButton|documentationTopicId/);
  });

  it("maps every registered topic to an access area", () => {
    for (const topic of listAdminDocTopics()) {
      assert.ok(ADMIN_DOC_TOPIC_ACCESS[topic.id], `missing access: ${topic.id}`);
    }
    assert.equal(Object.keys(ADMIN_DOC_TOPIC_ACCESS).length, 33);
  });

  it("shows all topics to owners", () => {
    const topics = listAdminDocTopicsForRole("owner");
    assert.equal(topics.length, 33);
  });

  it("hides members and staff topics from editors", () => {
    const topics = listAdminDocTopicsForRole("editor");
    const ids = new Set(topics.map((topic) => topic.id));
    assert.ok(ids.has("recipes"));
    assert.ok(ids.has("youtube"));
    assert.ok(ids.has("profile"));
    assert.equal(ids.has("members"), false);
    assert.equal(ids.has("visitors"), false);
    assert.equal(ids.has("team-access"), false);
    assert.equal(ids.has("activity"), false);
    for (const topic of topics) {
      assert.equal(canAccessAdminDocTopic("editor", topic.id), true);
    }
  });

  it("limits Audience admin to members-area topics plus profile", () => {
    const topics = listAdminDocTopicsForRole("members");
    const ids = new Set(topics.map((topic) => topic.id));
    assert.ok(ids.has("members"));
    assert.ok(ids.has("visitors"));
    assert.ok(ids.has("newsletter"));
    assert.ok(ids.has("profile"));
    assert.equal(ids.has("recipes"), false);
    assert.equal(ids.has("redirects"), false);
    assert.equal(ids.has("search-console"), false);
    assert.equal(ids.has("team-access"), false);
    assert.equal(ids.has("youtube"), false);
    for (const topic of topics) {
      const area = ADMIN_DOC_TOPIC_ACCESS[topic.id];
      assert.ok(area === "members" || area === "any", topic.id);
    }
  });

  it("aligns topic access with canAccess for area-backed topics", () => {
    for (const [topicId, area] of Object.entries(ADMIN_DOC_TOPIC_ACCESS)) {
      if (area === "any") {
        assert.equal(canAccessAdminDocTopic("members", topicId), true);
        continue;
      }
      assert.equal(canAccessAdminDocTopic("owner", topicId), canAccess("owner", area));
      assert.equal(canAccessAdminDocTopic("editor", topicId), canAccess("editor", area));
      assert.equal(canAccessAdminDocTopic("members", topicId), canAccess("members", area));
    }
  });
});

describe("Admin documentation Phase 4 registry and page links", () => {
  it("keeps unique ids, valid categories, and non-empty useful sections", () => {
    const topics = listAdminDocTopics();
    assert.equal(topics.length, 33);
    assert.equal(new Set(topics.map((topic) => topic.id)).size, 33);
    for (const topic of topics) {
      assert.ok(ADMIN_DOC_CATEGORY_ORDER.includes(topic.category), topic.id);
      assert.ok(topic.title.trim());
      assert.ok(topic.summary.trim().length > 12, topic.id);
      assert.ok(topic.sections.length >= 3, topic.id);
      for (const section of topic.sections) {
        const hasContent =
          section.paragraphs.some((p) => p.trim()) ||
          (section.bullets ?? []).some((b) => b.trim()) ||
          section.id === "related";
        assert.ok(hasContent, `${topic.id}:${section.id}`);
      }
    }
  });

  it("keeps relatedTopicIds and page links valid without fake dynamic URLs", () => {
    for (const topic of ADMIN_DOC_TOPICS) {
      for (const related of topic.relatedTopicIds ?? []) {
        assert.ok(getAdminDocTopicById(related), `${topic.id} → ${related}`);
      }
      const link = getAdminDocPageLink(topic.id);
      assert.ok(link, `missing page link: ${topic.id}`);
      assert.equal(link!.href.includes(":"), false, link!.href);
      assert.equal(link!.href.includes("["), false, link!.href);
      assert.match(link!.href, /^\/admin/);
      assert.ok(link!.label.startsWith("Open "));
    }
    assert.equal(Object.keys(ADMIN_DOC_TOPIC_PAGE_LINKS).length, 33);
  });

  it("groups topics by category for the center", () => {
    const groups = groupAdminDocTopicsByCategory(listAdminDocTopics());
    assert.ok(groups.length >= 5);
    assert.equal(
      groups.reduce((sum, group) => sum + group.topics.length, 0),
      33,
    );
  });
});

describe("Admin documentation Phase 4 search", () => {
  const topics = listAdminDocTopics();

  it("matches title, summary, and body case-insensitively with trimmed whitespace", () => {
    const byTitle = searchAdminDocTopics(topics, "  Recipe Editor  ");
    assert.ok(byTitle.some((row) => row.topic.id === "recipe-editor"));
    assert.ok(byTitle[0]?.matchedIn.includes("title"));

    const bySummary = searchAdminDocTopics(topics, "meaningful saved versions");
    assert.ok(bySummary.some((row) => row.topic.id === "recipe-history"));

    const byBody = searchAdminDocTopics(topics, "cooking");
    assert.ok(byBody.some((row) => row.topic.id === "recipe-editor"));

    const redirectHits = searchAdminDocTopics(topics, "redirect");
    assert.ok(redirectHits.some((row) => row.topic.id === "redirects"));
    assert.ok(redirectHits.some((row) => row.topic.id === "recipe-editor"));
  });

  it("returns an empty list for unmatched queries", () => {
    assert.deepEqual(searchAdminDocTopics(topics, "zzzxnotatopic999"), []);
  });

  it("returns all topics when the query is blank", () => {
    assert.equal(searchAdminDocTopics(topics, "   ").length, topics.length);
  });
});

describe("Admin documentation Phase 4 UI contracts", () => {
  it("excludes Documentation Center from contextual drawer resolution", () => {
    assert.equal(getAdminDocTopicForPath("/admin/documentation"), null);
    assert.equal(getAdminDocTopicForPath("/admin/documentation?topic=recipes"), null);
  });

  it("wires center search, topic detail, related navigation, and open-page actions", () => {
    const center = read("components/admin/AdminDocumentationCenter.tsx");
    assert.match(center, /Search documentation/);
    assert.match(center, /htmlFor=\{searchId\}/);
    assert.match(center, /No documentation found/);
    assert.match(center, /onOpenRelated/);
    assert.match(center, /getAdminDocPageLink/);
    assert.match(center, /← Documentation/);
    assert.match(center, /adminDocumentationCenterHref/);
    assert.doesNotMatch(center, /\/admin\/members\/\$\{|\/admin\/media\/\$\{/);
  });

  it("places Documentation in Account nav after Profile", () => {
    const nav = read("components/admin/AdminSidebarNav.tsx");
    const profileIdx = nav.indexOf('href="/admin/profile"');
    const docsIdx = nav.indexOf('href="/admin/documentation"');
    const viewIdx = nav.indexOf('label="View site"');
    assert.ok(profileIdx > 0 && docsIdx > profileIdx && viewIdx > docsIdx);
  });

  it("links contextual drawer to Documentation Center for the current topic", () => {
    const drawer = read("components/admin/AdminDocumentationDrawer.tsx");
    assert.match(drawer, /Open Documentation Center/);
    assert.match(drawer, /allowDocumentationCenterNavigation/);
    assert.match(drawer, /adminDocumentationCenterHref\(currentTopic\.id\)/);
    const button = read("components/admin/AdminDocumentationButton.tsx");
    assert.match(button, /allowDocumentationCenterNavigation = true/);
  });

  it("hides Documentation Center navigation from Recipe Editor drawers", () => {
    const editor = read("components/admin/RecipeEditor.tsx");
    assert.match(editor, /allowDocumentationCenterNavigation=\{false\}/);
    assert.equal(
      (editor.match(/allowDocumentationCenterNavigation=\{false\}/g) || []).length >= 4,
      true,
    );
    assert.doesNotMatch(
      editor,
      /allowDocumentationCenterNavigation=\{true\}|allowDocumentationCenterNavigation=\{false\}[\s\S]*Open Documentation Center/,
    );
  });

  it("uses About this page as the shared contextual button label", () => {
    const button = read("components/admin/AdminDocumentationButton.tsx");
    assert.match(button, /label = "About this page"/);
    assert.match(button, /quiet \? "\?" : label/);
    assert.doesNotMatch(button, /label = "Documentation"/);
    assert.match(
      read("components/admin/RecipesIndex.tsx"),
      /documentationTopicId="recipes"/,
    );
    assert.match(
      read("app/admin/(app)/search-console/page.tsx"),
      /documentationTopicId="search-console"/,
    );
    assert.match(
      read("components/admin/CategoriesManager.tsx"),
      /documentationTopicId="categories"/,
    );
    assert.match(read("app/admin/(app)/staff/page.tsx"), /documentationTopicId="team-access"/);
    assert.match(read("components/admin/RecipeEditor.tsx"), /topicId="recipe-editor"/);
    assert.doesNotMatch(
      read("components/admin/RecipeEditor.tsx"),
      /label=["']About this page["']/,
    );
    assert.match(read("components/admin/RecipeEditor.tsx"), /quiet/);
    assert.match(read("components/admin/AdminSidebarNav.tsx"), /label="Documentation"/);
    assert.match(read("app/admin/(app)/documentation/page.tsx"), />\s*Documentation\s*</);
    assert.match(
      read("components/admin/AdminDocumentationDrawer.tsx"),
      /Open Documentation Center/,
    );
  });

  it("builds deep-linkable center URLs", () => {
    assert.equal(adminDocumentationCenterHref(), "/admin/documentation");
    assert.equal(
      adminDocumentationCenterHref("recipe-editor"),
      "/admin/documentation?topic=recipe-editor",
    );
  });

  it("keeps preview and public free of documentation center wiring", () => {
    const preview = read("app/admin/(preview)/recipes/[id]/preview/page.tsx");
    assert.doesNotMatch(preview, /AdminDocumentationCenter|\/admin\/documentation/);
    const publicRecipe = read("app/recipes/[slug]/page.tsx");
    assert.doesNotMatch(publicRecipe, /AdminDocumentationCenter|\/admin\/documentation/);
  });

  it("preserves role filtering helper purity", () => {
    const all = listAdminDocTopics();
    const filtered = filterAdminDocTopicsForRole("editor", all);
    assert.ok(filtered.length < all.length);
    assert.ok(filtered.every((topic) => canAccessAdminDocTopic("editor", topic.id)));
  });
});
