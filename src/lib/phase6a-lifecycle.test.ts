import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { listPublishContentWarnings } from "./recipe-catalog-integrity.ts";
import { getRecipePublishingReadiness } from "./recipe-publishing-readiness.ts";
import {
  contentHealthStatusLabel,
  filterRecipeContentHealth,
  getRecipeContentHealth,
  issuesFromReadiness,
  mapReadinessToContentHealthStatus,
  sortRecipeContentHealth,
  summarizeRecipeContentHealth,
  type RecipeContentHealth,
} from "./recipe-content-health.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

const requiredFields = [
  { key: "image", label: "Hero image", kind: "image", required: true },
  { key: "imageAlt", label: "Image alt", kind: "text", required: true },
  { key: "intro", label: "Intro", kind: "textarea", required: true },
  { key: "ingredients", label: "Ingredients", kind: "ingredients", required: true },
  { key: "instructions", label: "Instructions", kind: "instructions", required: true },
  { key: "prepMinutes", label: "Prep", kind: "minutes", required: true },
  { key: "servings", label: "Servings", kind: "number", required: true },
];

const completeValues = {
  image: "https://example.public.blob.vercel-storage.com/baguette.jpg",
  imageAlt: "Baguettes",
  intro: "A classic loaf.",
  ingredients: [{ name: "Dough", items: [{ item: "flour", amount: "500g", notes: "" }] }],
  instructions: [{ title: "Mix", steps: ["Mix", "Bake"] }],
  prepMinutes: 20,
  servings: 4,
  youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
};

function healthFor(input: {
  recipeId?: string;
  title?: string;
  slug?: string;
  publicationStatus: string;
  excerpt?: string;
  values?: Record<string, unknown>;
  fields?: typeof requiredFields;
}) {
  return getRecipeContentHealth({
    recipeId: input.recipeId ?? "r1",
    title: input.title ?? "Classic Baguettes",
    slug: input.slug ?? "classic-baguettes",
    publicationStatus: input.publicationStatus,
    typeId: "t1",
    typeName: "Bread",
    updatedAt: "2026-01-01T00:00:00.000Z",
    readinessInput: {
      title: input.title ?? "Classic Baguettes",
      slug: input.slug ?? "classic-baguettes",
      excerpt: input.excerpt ?? "Crisp crust.",
      typeId: "t1",
      fields: input.fields ?? requiredFields,
      values: input.values ?? completeValues,
    },
  });
}

describe("phase 6A — content health readiness parity", () => {
  it("maps ready / recommendations / not_ready without redefining readiness", () => {
    const ready = healthFor({
      publicationStatus: "published",
      values: completeValues,
      excerpt: "Crisp crust.",
    });
    assert.equal(ready.readinessStatus, "ready");
    assert.equal(ready.health, "healthy");
    assert.equal(ready.blockingCount, 0);

    const recommendations = healthFor({
      publicationStatus: "published",
      excerpt: "",
      values: { ...completeValues, youtubeUrl: "" },
    });
    assert.equal(recommendations.readinessStatus, "ready_with_recommendations");
    assert.equal(recommendations.health, "recommendations");

    const blocked = healthFor({
      publicationStatus: "published",
      title: "",
      values: {},
    });
    assert.equal(blocked.readinessStatus, "not_ready");
    assert.equal(blocked.health, "needs_attention");
    assert.ok(blocked.blockingCount > 0);
  });

  it("keeps readiness issue ids and severity", () => {
    const blocked = healthFor({ publicationStatus: "draft", title: "", excerpt: "", values: {} });
    assert.ok(blocked.issues.some((issue) => issue.id === "recipe.title" && issue.severity === "blocking"));
    const direct = getRecipePublishingReadiness({
      title: "",
      slug: "classic-baguettes",
      excerpt: "",
      typeId: "t1",
      fields: requiredFields,
      values: {},
    });
    assert.deepEqual(
      issuesFromReadiness(direct).map((i) => i.id).sort(),
      blocked.issues.map((i) => i.id).sort(),
    );
  });

  it("parity: health.embedded readiness matches direct getRecipePublishingReadiness", () => {
    const input = {
      title: "Flatbread",
      slug: "flatbread",
      excerpt: "",
      typeId: "t1",
      fields: requiredFields,
      values: { ...completeValues, youtubeUrl: "" },
    };
    const direct = getRecipePublishingReadiness(input);
    const health = getRecipeContentHealth({
      recipeId: "r-parity",
      title: input.title,
      slug: input.slug,
      publicationStatus: "published",
      typeId: "t1",
      typeName: "Bread",
      updatedAt: new Date(),
      readinessInput: input,
    });
    assert.equal(health.readinessStatus, direct.status);
    assert.equal(health.readiness.counts.requiredPassed, direct.counts.requiredPassed);
    assert.equal(health.readiness.counts.recommendedPassed, direct.counts.recommendedPassed);
  });
});

describe("phase 6A — published vs draft policy", () => {
  it("separates published blockers from draft incompleteness", () => {
    assert.equal(mapReadinessToContentHealthStatus("published", "not_ready"), "needs_attention");
    assert.equal(mapReadinessToContentHealthStatus("draft", "not_ready"), "draft_not_ready");
    assert.equal(mapReadinessToContentHealthStatus("draft", "ready"), "draft_ready");
    assert.equal(contentHealthStatusLabel("needs_attention"), "Needs attention");
    assert.equal(contentHealthStatusLabel("draft_not_ready"), "Draft — not ready");
  });

  it("sorts published needs attention ahead of drafts and healthy", () => {
    const rows: RecipeContentHealth[] = [
      healthFor({ recipeId: "h", publicationStatus: "published", values: completeValues, excerpt: "Ok" }),
      healthFor({ recipeId: "d", publicationStatus: "draft", title: "", values: {} }),
      healthFor({
        recipeId: "n",
        publicationStatus: "published",
        title: "",
        values: {},
      }),
    ];
    const sorted = sortRecipeContentHealth(rows);
    assert.equal(sorted[0]?.recipeId, "n");
    assert.equal(sorted[0]?.health, "needs_attention");
  });
});

describe("phase 6A — deduplication", () => {
  it("does not re-emit soft catalog warnings as separate health issues", () => {
    const soft = listPublishContentWarnings({
      values: { image: "", prepMinutes: "", servings: "" },
    });
    assert.ok(soft.length > 0);
    const health = healthFor({
      publicationStatus: "published",
      values: { ...completeValues, image: "", prepMinutes: 20, servings: 4 },
      fields: requiredFields.map((f) =>
        f.key === "image" ? { ...f, required: false } : f,
      ),
    });
    // Hero may appear once via readiness recommendation id only.
    const heroIssues = health.issues.filter((issue) => issue.id === "recipe.hero_image");
    assert.ok(heroIssues.length <= 1);
    assert.ok(health.issues.every((issue) => issue.source === "readiness"));
  });
});

describe("phase 6A — optional features are not health requirements", () => {
  it("does not invent Related / Collection / saves / reviews / update-note issues", () => {
    const health = healthFor({ publicationStatus: "published", values: completeValues, excerpt: "Ok" });
    assert.ok(!health.issues.some((issue) => /related|collection|save|review|update.?note/i.test(issue.id)));
    assert.ok(!health.issues.some((issue) => /related|collection|save|review|update note/i.test(issue.description)));
  });

  it("treats missing video as recommendation only when readiness does", () => {
    const health = healthFor({
      publicationStatus: "published",
      excerpt: "Ok",
      values: { ...completeValues, youtubeUrl: "" },
    });
    const youtube = health.issues.find((issue) => issue.id === "recipe.youtube");
    assert.ok(youtube);
    assert.equal(youtube?.severity, "recommendation");
    assert.notEqual(health.health, "needs_attention");
  });

  it("keeps malformed YouTube URL as blocking via readiness ownership", () => {
    const health = healthFor({
      publicationStatus: "published",
      excerpt: "Ok",
      values: { ...completeValues, youtubeUrl: "not-a-url" },
    });
    assert.ok(health.issues.some((issue) => issue.id === "recipe.youtube_url" && issue.severity === "blocking"));
  });
});

describe("phase 6A — identity and filters", () => {
  it("slug rename keeps the same recipeId identity", () => {
    const before = healthFor({
      recipeId: "stable-id",
      slug: "old-slug",
      publicationStatus: "published",
      excerpt: "Ok",
    });
    const after = healthFor({
      recipeId: "stable-id",
      slug: "new-slug",
      publicationStatus: "published",
      excerpt: "Ok",
    });
    assert.equal(before.recipeId, after.recipeId);
    assert.equal(after.slug, "new-slug");
  });

  it("summary counts and filters are deterministic", () => {
    const rows = [
      healthFor({ recipeId: "p-ok", publicationStatus: "published", excerpt: "Ok" }),
      healthFor({
        recipeId: "p-rec",
        publicationStatus: "published",
        excerpt: "",
        values: { ...completeValues, youtubeUrl: "" },
      }),
      healthFor({ recipeId: "p-bad", publicationStatus: "published", title: "", values: {} }),
      healthFor({ recipeId: "d-ok", publicationStatus: "draft", excerpt: "Ok" }),
      healthFor({ recipeId: "d-bad", publicationStatus: "draft", title: "", values: {} }),
    ];
    const summary = summarizeRecipeContentHealth(rows);
    assert.equal(summary.publishedCount, 3);
    assert.equal(summary.needsAttentionCount, 1);
    assert.equal(summary.recommendationsCount, 1);
    assert.equal(summary.healthyCount, 1);
    assert.equal(summary.draftsReadyCount, 1);
    assert.equal(summary.draftsNotReadyCount, 1);

    const attention = filterRecipeContentHealth(rows, { health: "needs_attention" });
    assert.equal(attention.length, 1);
    assert.equal(attention[0]?.recipeId, "p-bad");
  });
});

describe("phase 6A — admin surface wiring", () => {
  it("exposes Content Health under Publishing with content permission", () => {
    const nav = read("lib/admin-nav.ts");
    const page = read("app/admin/(app)/content-health/page.tsx");
    assert.match(nav, /\/admin\/content-health/);
    assert.match(nav, /Content Health/);
    assert.match(page, /requireAccess\("content"\)/);
    assert.match(page, /loadRecipeContentHealthCatalogue/);
    assert.match(page, /Review recipe/);
    assert.match(page, /Needs attention/);
    assert.doesNotMatch(page, /contentHealthScore|82%|SEO score/i);
    assert.doesNotMatch(page, /AdminAuditEvent|createRecipeRevision|recordAdminAudit/);
  });

  it("server loader batches recipes and type fields without N+1 YouTube calls", () => {
    const server = read("lib/recipe-content-health-server.ts");
    assert.match(server, /recipe\.findMany/);
    assert.match(server, /recipeTypeField\.findMany/);
    assert.match(server, /Promise\.all/);
    assert.doesNotMatch(server, /youTubeVideo\.findUnique/);
    assert.doesNotMatch(server, /for \(.*recipe[\s\S]*findUnique/);
  });

  it("defers YouTube operational privacy health and does not use SearchEvent", () => {
    const lib = read("lib/recipe-content-health.ts");
    const server = read("lib/recipe-content-health-server.ts");
    assert.doesNotMatch(lib, /privacyStatus|SearchEvent|FunnelEvent|SavedRecipe/);
    assert.doesNotMatch(server, /SearchEvent|listPublishContentWarnings/);
  });
});
