import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Recipe } from "@/data/types";
import { summarizeRecipeAuditChanges } from "./admin-audit.ts";
import { RecipePublicUpdateNote } from "../components/RecipePublicUpdateNote.tsx";
import { RecipePrintSheet } from "../components/RecipePrintSheet.tsx";
import {
  formatPublicUpdateLabel,
  normalizePublicUpdateFields,
  parsePublicUpdateDateInput,
  publicUpdateDateInputValue,
  recipeDateModifiedIso,
} from "./recipe-public-update.ts";
import {
  buildRecipeRevisionSnapshot,
  hashRecipeRevisionSnapshot,
  parseRecipeRevisionSnapshot,
} from "./recipe-revisions.ts";
import { recipeJsonLd } from "./schema.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

function baseRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    slug: "classic-baguettes",
    title: "Classic French Baguettes",
    excerpt: "Crisp crust.",
    intro: "",
    whyItWorks: "",
    keyIngredients: [],
    tips: [],
    faqs: [],
    image: "/b.jpg",
    imageAlt: "Baguettes",
    publishedAt: "2026-01-01",
    updatedAt: "2026-08-01",
    prepMinutes: 20,
    cookMinutes: 0,
    bakeMinutes: 24,
    servings: 4,
    servingsUnit: "baguettes",
    course: "Bread",
    method: "Bake",
    cuisine: "French",
    categories: ["breads"],
    tags: [],
    ingredients: [{ items: [{ item: "flour", amount: "500 g" }] }],
    instructions: [{ steps: ["Mix."] }],
    notes: [],
    nutrition: { calories: 200, carbs: 0, protein: 0, fat: 0 },
    ...overrides,
  };
}

const snapBase = {
  title: "Baguettes",
  excerpt: "x",
  featured: false,
  seasonal: false,
  typeId: "t1",
  categoryIds: ["c1"],
  values: { ingredients: [] },
  slug: "baguettes",
  status: "published" as const,
  publishedAt: "2026-01-01T00:00:00.000Z",
};

describe("public update note — data", () => {
  it("schema adds optional public update columns on Recipe", () => {
    const schema = readFileSync(path.join(srcRoot, "..", "prisma", "schema.prisma"), "utf8");
    assert.match(schema, /publicUpdateNote\s+String\?/);
    assert.match(schema, /publicUpdatedAt\s+DateTime\?/);
  });

  it("stores empty note as null pair", () => {
    const result = normalizePublicUpdateFields({
      enabled: true,
      note: "   ",
      date: "",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.note, null);
      assert.equal(result.value.updatedAt, null);
    }
  });

  it("stores note + date together", () => {
    const result = normalizePublicUpdateFields({
      enabled: true,
      note: "We retested this recipe and adjusted the baking time.",
      date: "2026-09-07",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.note, "We retested this recipe and adjusted the baking time.");
      assert.equal(publicUpdateDateInputValue(result.value.updatedAt), "2026-09-07");
    }
  });

  it("normalizes whitespace-only note to empty", () => {
    const result = normalizePublicUpdateFields({
      enabled: true,
      note: "\n  \t  ",
      date: "2026-09-07",
    });
    assert.equal(result.ok, false);
  });

  it("rejects note without date", () => {
    const result = normalizePublicUpdateFields({
      enabled: true,
      note: "We retested this recipe carefully.",
      date: "",
    });
    assert.equal(result.ok, false);
  });

  it("rejects date without note", () => {
    const result = normalizePublicUpdateFields({
      enabled: true,
      note: "",
      date: "2026-09-07",
    });
    assert.equal(result.ok, false);
  });

  it("clears both when disabled", () => {
    const result = normalizePublicUpdateFields({
      enabled: false,
      note: "We retested this recipe carefully.",
      date: "2026-09-07",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.note, null);
      assert.equal(result.value.updatedAt, null);
    }
  });

  it("parses date-only input as UTC noon", () => {
    const date = parsePublicUpdateDateInput("2026-09-07");
    assert.ok(date);
    assert.equal(date?.getUTCFullYear(), 2026);
    assert.equal(date?.getUTCMonth(), 8);
    assert.equal(date?.getUTCDate(), 7);
    assert.equal(date?.getUTCHours(), 12);
  });

  it("formats public label as month + year", () => {
    assert.equal(formatPublicUpdateLabel("2026-09-07T12:00:00.000Z"), "Updated September 2026");
  });
});

describe("public update note — public render", () => {
  it("renders nothing without a note", () => {
    const html = renderToStaticMarkup(
      createElement(RecipePublicUpdateNote, { note: null, updatedAt: null }),
    );
    assert.equal(html, "");
  });

  it("renders label and body when present", () => {
    const html = renderToStaticMarkup(
      createElement(RecipePublicUpdateNote, {
        note: "We retested this recipe and adjusted the baking time.",
        updatedAt: "2026-09-07T12:00:00.000Z",
      }),
    );
    assert.match(html, /Updated September 2026/);
    assert.match(html, /We retested this recipe and adjusted the baking time\./);
    assert.match(html, /aria-labelledby=/);
    assert.doesNotMatch(html, /role=["']alert["']/);
  });

  it("escapes HTML in note body", () => {
    const html = renderToStaticMarkup(
      createElement(RecipePublicUpdateNote, {
        note: 'Adjusted <script>alert("x")</script> time.',
        updatedAt: "2026-09-07T12:00:00.000Z",
      }),
    );
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });

  it("hero no longer shows operational updatedAt and hosts the note component", () => {
    const hero = read("components/RecipePageHero.tsx");
    assert.match(hero, /RecipePublicUpdateNote/);
    assert.doesNotMatch(hero, /Updated \{updated\}/);
    assert.doesNotMatch(hero, /role=["']alert["']/);
    assert.match(hero, /"use client"/);
    const note = read("components/RecipePublicUpdateNote.tsx");
    assert.doesNotMatch(note, /"use client"/);
  });

  it("cook mode does not surface update notes", () => {
    const cook = read("components/cooking/CookingMode.tsx");
    assert.doesNotMatch(cook, /publicUpdate|RecipePublicUpdateNote|Updated September/);
  });
});

describe("public update note — revisions + audit", () => {
  it("includes public update fields in revision snapshots and content hash", () => {
    const without = buildRecipeRevisionSnapshot(snapBase);
    const withNote = buildRecipeRevisionSnapshot({
      ...snapBase,
      publicUpdateNote: "We retested this recipe and adjusted the baking time.",
      publicUpdatedAt: "2026-09-07T12:00:00.000Z",
    });
    assert.equal(withNote.publicUpdateNote?.startsWith("We retested"), true);
    assert.ok(withNote.publicUpdatedAt);
    assert.notEqual(hashRecipeRevisionSnapshot(without), hashRecipeRevisionSnapshot(withNote));

    const parsed = parseRecipeRevisionSnapshot(JSON.stringify(without));
    assert.equal(parsed?.publicUpdateNote, null);
    assert.equal(parsed?.publicUpdatedAt, null);
  });

  it("restore path writes public update fields and preserves slug/status/publishedAt", () => {
    const source = read("lib/recipe-revisions.ts");
    assert.match(source, /publicUpdateNote: nextSnapshot\.publicUpdateNote/);
    assert.match(source, /publicUpdatedAt: nextSnapshot\.publicUpdatedAt/);
    assert.match(source, /Explicitly do NOT change slug, status, publishedAt/);
  });

  it("audit changedFields recognizes public update note without note body", () => {
    const changed = summarizeRecipeAuditChanges({
      before: {
        title: "A",
        slug: "a",
        excerpt: "e",
        status: "published",
        featured: false,
        seasonal: false,
        typeId: "t1",
        categoryIds: [],
        values: "{}",
        publicUpdateNote: null,
        publicUpdatedAt: null,
      },
      after: {
        title: "A",
        slug: "a",
        excerpt: "e",
        status: "published",
        featured: false,
        seasonal: false,
        typeId: "t1",
        categoryIds: [],
        values: "{}",
        publicUpdateNote: "We retested this recipe and adjusted the baking time.",
        publicUpdatedAt: "2026-09-07T12:00:00.000Z",
      },
    });
    assert.deepEqual(changed, ["publicUpdateNote"]);
    const audit = read("lib/admin-audit.ts");
    assert.doesNotMatch(audit, /publicUpdateNote:\s*afterNote|metadata:.*publicUpdateNote/);
  });
});

describe("public update note — print + SEO", () => {
  it("print sheet includes a concise update block when present", () => {
    const html = renderToStaticMarkup(
      createElement(RecipePrintSheet, {
        recipe: baseRecipe({
          publicUpdateNote: "We retested this recipe and adjusted the baking time.",
          publicUpdatedAt: "2026-09-07T12:00:00.000Z",
        }),
        servings: 4,
      }),
    );
    assert.match(html, /recipe-print-sheet__update/);
    assert.match(html, /Updated September 2026/);
    assert.match(html, /We retested this recipe and adjusted the baking time\./);
    assert.equal((html.match(/Updated September 2026/g) || []).length, 1);
  });

  it("print sheet omits update block when absent", () => {
    const html = renderToStaticMarkup(
      createElement(RecipePrintSheet, { recipe: baseRecipe(), servings: 8 }),
    );
    assert.doesNotMatch(html, /recipe-print-sheet__update/);
    assert.match(html, /8 baguettes/);
  });

  it("JSON-LD dateModified prefers publicUpdatedAt when set", () => {
    const withNote = recipeJsonLd(
      baseRecipe({
        publicUpdatedAt: "2026-09-07T12:00:00.000Z",
        publicUpdateNote: "We retested this recipe and adjusted the baking time.",
        updatedAt: "2026-08-01",
      }),
    );
    assert.equal(withNote.dateModified, "2026-09-07");

    const without = recipeJsonLd(baseRecipe({ updatedAt: "2026-08-01" }));
    assert.equal(without.dateModified, "2026-08-01");
    assert.equal(
      recipeDateModifiedIso({ updatedAt: "2026-08-01", publicUpdatedAt: null }),
      "2026-08-01",
    );
  });

  it("sitemap continues to use technical updatedAt", () => {
    const sitemap = read("app/sitemap.ts");
    const entries = read("lib/sitemap-entries.ts");
    assert.match(sitemap, /buildSitemapEntries/);
    assert.match(sitemap, /updatedAt:\s*recipe\.updatedAt/);
    assert.doesNotMatch(sitemap, /publicUpdatedAt/);
    assert.match(entries, /lastModified:\s*new Date\(recipe\.updatedAt\)/);
    assert.doesNotMatch(entries, /publicUpdatedAt/);
  });

  it("publishing readiness does not require public update notes", () => {
    const readiness = read("lib/recipe-publishing-readiness.ts");
    assert.doesNotMatch(readiness, /publicUpdate/);
  });

  it("save path does not auto-generate notes", () => {
    const actions = read("app/admin/actions.ts");
    assert.match(actions, /normalizePublicUpdateFields/);
    const saveStart = actions.indexOf("export async function saveRecipeAction");
    const saveEnd = actions.indexOf("export async function", saveStart + 1);
    const saveBody = actions.slice(saveStart, saveEnd > 0 ? saveEnd : undefined);
    assert.match(saveBody, /formData\.get\("publicUpdateNote"\)/);
    assert.doesNotMatch(saveBody, /generatePublicUpdate|We retested this recipe/);
  });
});
