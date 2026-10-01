import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  orderContextualInternalLinkTargetsByAcceptedIds,
  type ContextualInternalLinkTarget,
} from "./contextual-internal-links-public.ts";
import {
  getContextualInternalLinkIds,
  normalizeContextualInternalLinks,
} from "./contextual-internal-links.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("contextual internal links — public order helper", () => {
  it("preserves accepted editorial order even when DB returns different order", () => {
    const accepted = ["c", "a", "b"];
    const resolved: ContextualInternalLinkTarget[] = [
      { id: "a", title: "A", slug: "a" },
      { id: "b", title: "B", slug: "b" },
      { id: "c", title: "C", slug: "c" },
    ];
    assert.deepEqual(
      orderContextualInternalLinkTargetsByAcceptedIds(accepted, resolved).map((t) => t.id),
      ["c", "a", "b"],
    );
  });

  it("omits missing targets and never invents rows", () => {
    const ordered = orderContextualInternalLinkTargetsByAcceptedIds(
      ["a", "missing", "c"],
      [
        { id: "c", title: "C", slug: "c" },
        { id: "a", title: "A", slug: "a" },
      ],
    );
    assert.deepEqual(
      ordered.map((t) => t.id),
      ["a", "c"],
    );
  });

  it("caps to 3 and ignores malformed accepted entries via normalizer", () => {
    const ids = getContextualInternalLinkIds({
      contextualInternalLinks: [
        { recipeId: "" },
        { bad: true },
        { recipeId: "missing" },
        { recipeId: "valid" },
        { recipeId: "two" },
        { recipeId: "three" },
        { recipeId: "four" },
      ],
    });
    assert.deepEqual(ids, ["missing", "valid", "two"]);
    assert.equal(normalizeContextualInternalLinks([{ recipeId: "x" }, { recipeId: "x" }])?.length, 1);
  });
});

describe("Phase 11D — public Try next wiring", () => {
  it("places RecipeTryNext before Related shelf with Try next heading and no-print", () => {
    const detail = read("components/recipe/RecipeDetailView.tsx");
    const component = read("components/recipe/RecipeTryNext.tsx");
    assert.match(component, /Try next/);
    assert.match(component, /no-print/);
    assert.match(component, /aria-labelledby/);
    assert.match(component, /href=\{`\/recipes\/\$\{target\.slug\}`\}/);
    assert.doesNotMatch(component, /target="_blank"|rel="nofollow"|recommendInternalRecipeLinks/);
    assert.match(detail, /RecipeTryNext/);
    const tryIdx = detail.indexOf("<RecipeTryNext");
    const relatedIdx = detail.indexOf('title="More from the studio"');
    assert.ok(tryIdx > 0 && relatedIdx > tryIdx);
  });

  it("loads targets only when gate ON via presentation helper", () => {
    const presentation = read("lib/recipe-detail-presentation.ts");
    assert.match(presentation, /isInternalLinkRecommendationsEnabled/);
    assert.match(presentation, /loadContextualInternalLinkTargetsForRecipe/);
    assert.doesNotMatch(presentation, /recommendInternalRecipeLinks/);
  });

  it("Preview uses same presentation path; Cooking excludes Try next", () => {
    const preview = read("app/admin/(preview)/recipes/[id]/preview/page.tsx");
    assert.match(preview, /loadRecipeDetailPresentation/);
    assert.match(preview, /RecipeDetailView/);
    const cook = read("app/recipes/[slug]/cook/page.tsx");
    assert.doesNotMatch(cook, /RecipeTryNext|contextualInternalLinks|Try next/);
  });

  it("revalidates source Recipe on save and reverse-links targets on lifecycle", () => {
    const actions = read("app/admin/actions.ts");
    assert.match(actions, /revalidatePath\(`\/recipes\/\$\{slug\}`\)/);
    assert.match(actions, /revalidateRecipesLinkingToContextualTarget/);
    assert.match(actions, /deleteRecipeAction/);
    const publicLib = read("lib/contextual-internal-links-public.ts");
    assert.match(publicLib, /findRecipeSlugsLinkingToContextualTarget/);
    assert.match(publicLib, /revalidateRecipesLinkingToContextualTarget/);
    assert.match(publicLib, /status:\s*"published"/);
  });

  it("does not change Related scoring, Prisma, analytics, JSON-LD, or scoring on public path", () => {
    const related = read("lib/recipe-related.ts");
    assert.doesNotMatch(related, /contextualInternalLinks|Try next/);
    const schema = readFileSync(path.join(root, "..", "prisma", "schema.prisma"), "utf8");
    assert.doesNotMatch(schema, /ContextualInternalLink|TryNext/);
    const tryNext = read("components/recipe/RecipeTryNext.tsx");
    assert.doesNotMatch(tryNext, /analytics|gtag|trackEvent|JSON-LD|ItemList/);
    assert.doesNotMatch(read("lib/flags.ts"), /NEXT_PUBLIC_INTERNAL_LINK/);
  });

  it("unit-test-files.json includes 11D tests", () => {
    const allow = JSON.parse(
      readFileSync(path.join(root, "..", "scripts", "unit-test-files.json"), "utf8"),
    ) as string[];
    assert.ok(allow.includes("src/lib/contextual-internal-links-public.test.ts"));
  });
});
