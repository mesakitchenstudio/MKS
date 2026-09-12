import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  adminRecipePreviewBannerCopy,
  adminRecipePreviewPath,
  adminRecipePreviewStatus,
} from "./recipe-admin-preview.ts";
import { loadAdminRecipePreviewById } from "./recipe-admin-preview-server.ts";
import { beginRecipeEngagementSuppression, isRecipeEngagementSuppressed } from "./recipe-engagement-gate.ts";
import { trackEvent } from "./analytics.ts";
import { getRecipeBySlug } from "./recipes.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("admin recipe preview helpers", () => {
  it("builds preview paths by recipe id", () => {
    assert.equal(adminRecipePreviewPath("abc123"), "/admin/recipes/abc123/preview");
    assert.equal(adminRecipePreviewPath(""), "");
  });

  it("classifies draft / scheduled / published for banners", () => {
    assert.equal(adminRecipePreviewStatus({ status: "published" }), "published");
    assert.equal(adminRecipePreviewStatus({ status: "draft" }), "draft");
    assert.equal(
      adminRecipePreviewStatus({
        status: "draft",
        scheduledPublishAt: new Date("2030-01-01T00:00:00.000Z"),
      }),
      "scheduled",
    );
    assert.match(adminRecipePreviewBannerCopy("draft").eyebrow, /Draft/i);
    assert.match(adminRecipePreviewBannerCopy("scheduled").eyebrow, /Scheduled/i);
    assert.match(adminRecipePreviewBannerCopy("published").eyebrow, /Preview/i);
  });

  it("suppresses analytics while preview engagement gate is active", () => {
    assert.equal(isRecipeEngagementSuppressed(), false);
    const end = beginRecipeEngagementSuppression();
    assert.equal(isRecipeEngagementSuppressed(), true);
    // Should no-op rather than throw when suppressed.
    trackEvent("recipe_print", { recipe_slug: "x" });
    end();
    assert.equal(isRecipeEngagementSuppressed(), false);
  });
});

describe("admin recipe preview loading", () => {
  const db = new PrismaClient();
  const prefix = `rcp-prev-${Date.now()}-`;
  let recipeTypeId = "";
  let draftId = "";
  let draftSlug = "";
  let publishedId = "";
  let publishedSlug = "";
  let scheduledId = "";

  before(async () => {
    await db.$connect();
    const type =
      (await db.recipeType.findFirst({ orderBy: { name: "asc" } })) ||
      (await db.recipeType.create({
        data: { name: `${prefix}Type`, slug: `${prefix}type` },
      }));
    recipeTypeId = type.id;

    const draft = await db.recipe.create({
      data: {
        title: `${prefix} Draft Cookie`,
        slug: `${prefix}draft-cookie`,
        excerpt: "Draft excerpt",
        status: "draft",
        typeId: recipeTypeId,
        values: JSON.stringify({
          intro: "Draft intro",
          servings: 4,
          ingredients: [],
          instructions: [],
        }),
      },
    });
    draftId = draft.id;
    draftSlug = draft.slug;

    const published = await db.recipe.create({
      data: {
        title: `${prefix} Published Cookie`,
        slug: `${prefix}published-cookie`,
        excerpt: "Published excerpt",
        status: "published",
        publishedAt: new Date(),
        typeId: recipeTypeId,
        values: JSON.stringify({
          intro: "Published intro",
          servings: 2,
          ingredients: [],
          instructions: [],
        }),
      },
    });
    publishedId = published.id;
    publishedSlug = published.slug;

    const scheduled = await db.recipe.create({
      data: {
        title: `${prefix} Scheduled Cookie`,
        slug: `${prefix}scheduled-cookie`,
        excerpt: "Scheduled excerpt",
        status: "draft",
        scheduledPublishAt: new Date("2030-06-01T12:00:00.000Z"),
        typeId: recipeTypeId,
        values: JSON.stringify({
          intro: "Scheduled intro",
          servings: 6,
          ingredients: [],
          instructions: [],
        }),
      },
    });
    scheduledId = scheduled.id;
  });

  after(async () => {
    await db.recipe.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.recipeType.deleteMany({ where: { slug: `${prefix}type` } }).catch(() => undefined);
    await db.$disconnect();
  });

  it("loads draft / scheduled / published by id for preview", async () => {
    const draft = await loadAdminRecipePreviewById(draftId);
    assert.equal(draft.status, "draft");
    assert.equal(draft.recipe.slug, draftSlug);
    assert.match(draft.recipe.title, /Draft Cookie/);

    const scheduled = await loadAdminRecipePreviewById(scheduledId);
    assert.equal(scheduled.status, "scheduled");

    const published = await loadAdminRecipePreviewById(publishedId);
    assert.equal(published.status, "published");
    assert.equal(published.recipe.slug, publishedSlug);
  });

  it("draft and scheduled remain unavailable on the public catalogue", async () => {
    assert.equal(await getRecipeBySlug(draftSlug), undefined);
    const scheduledRow = await db.recipe.findUniqueOrThrow({ where: { id: scheduledId } });
    assert.equal(await getRecipeBySlug(scheduledRow.slug), undefined);
    assert.ok(await getRecipeBySlug(publishedSlug));
  });

  it("preview reflects current DB edits without republishing", async () => {
    await db.recipe.update({
      where: { id: draftId },
      data: {
        title: `${prefix} Draft Edited`,
        values: JSON.stringify({
          intro: "Edited intro for preview",
          servings: 8,
          ingredients: [{ amount: "1", unit: "cup", item: "flour" }],
          instructions: ["Mix carefully"],
        }),
      },
    });
    const preview = await loadAdminRecipePreviewById(draftId);
    assert.match(preview.recipe.title, /Draft Edited/);
    assert.equal(preview.recipe.servings, 8);
    assert.match(preview.recipe.intro, /Edited intro/);
    assert.equal(await getRecipeBySlug(draftSlug), undefined);
  });

  it("preview survives a slug change while still keyed by id", async () => {
    const nextSlug = `${prefix}draft-cookie-renamed`;
    await db.recipe.update({
      where: { id: draftId },
      data: { slug: nextSlug, title: `${prefix} Draft Renamed` },
    });
    const preview = await loadAdminRecipePreviewById(draftId);
    assert.equal(preview.recipe.slug, nextSlug);
    assert.match(preview.recipe.title, /Draft Renamed/);
    assert.equal(await getRecipeBySlug(draftSlug), undefined);
  });
});

describe("admin recipe preview wiring", () => {
  it("editor Preview points at protected route by id; public page stays published-only", () => {
    const editor = read("components/admin/RecipeEditor.tsx");
    const sticky = read("components/admin/EditorStickyActionBar.tsx");
    const previewPage = read("app/admin/(preview)/recipes/[id]/preview/page.tsx");
    const publicPage = read("app/recipes/[slug]/page.tsx");
    const recipesLib = read("lib/recipes.ts");
    const detailView = read("components/recipe/RecipeDetailView.tsx");
    const chrome = read("components/PublicChrome.tsx");
    const heroActions = read("components/RecipePageHeroActions.tsx");
    const access = read("lib/admin-access.ts");
    const auth = read("lib/auth.ts");

    assert.match(editor, /\/admin\/recipes\/\$\{\(recipeId \|\| ""\)\.trim\(\)\}\/preview/);
    assert.doesNotMatch(editor, /previewHref = slug\.trim\(\) \? `\/recipes\/\$\{/);
    assert.match(sticky, /previewHref/);
    assert.match(previewPage, /requireAccess\("content"\)/);
    assert.match(previewPage, /loadAdminRecipePreviewById/);
    assert.match(previewPage, /recipe-admin-preview-server/);
    assert.match(previewPage, /mode="preview"/);
    assert.match(previewPage, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
    assert.doesNotMatch(previewPage, /recipeJsonLd/);
    assert.match(publicPage, /mode="public"/);
    assert.match(publicPage, /getRecipeBySlug/);
    assert.doesNotMatch(publicPage, /admin|requireAccess|loadAdminRecipePreview/);
    assert.match(recipesLib, /status:\s*"published"/);
    assert.match(detailView, /mode === "preview"/);
    assert.match(detailView, /preview \? null : \(\s*<SetCurrentRecipe/);
    assert.match(detailView, /preview \? null : <JsonLd/);
    assert.match(detailView, /interactionDisabled=\{preview\}/);
    assert.match(chrome, /isRecipePreview/);
    assert.match(heroActions, /Cooking Mode unavailable in preview/);
    assert.match(auth, /export async function requireAccess/);
    assert.match(access, /if \(area === "content"\) return role === "editor"/);
    assert.match(access, /if \(role === "owner"\) return true/);
  });

  it("preview layout is outside AdminShell route group", () => {
    const previewLayout = read("app/admin/(preview)/layout.tsx");
    const appLayout = read("app/admin/(app)/layout.tsx");
    assert.equal(previewLayout.includes('<AdminShell'), false);
    assert.equal(previewLayout.includes('from "@/components/admin/AdminShell"'), false);
    assert.match(appLayout, /AdminShell/);
  });
});
