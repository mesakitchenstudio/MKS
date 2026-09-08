import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.join(root, "..");

function readSrc(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (name.endsWith(".js")) acc.push(full);
  }
  return acc;
}

describe("Admin RecipeEditor readiness import boundary (React client)", () => {
  it("recipe-editor-completeness must not import recipe-publishing-readiness", () => {
    const completeness = readSrc("lib/recipe-editor-completeness.ts");
    // Reverse edge caused Turbopack to bind RecipeEditor's getRecipePublishingReadiness
    // to the completeness module namespace (export missing → not a function).
    assert.doesNotMatch(completeness, /from\s+["']@\/lib\/recipe-publishing-readiness["']/);
    assert.doesNotMatch(completeness, /from\s+["']\.\/recipe-publishing-readiness["']/);
    assert.doesNotMatch(completeness, /require\s*\(\s*["']@\/lib\/recipe-publishing-readiness["']\s*\)/);
    assert.doesNotMatch(completeness, /export function validateRecipeForPublish/);
  });

  it("RecipeEditor imports readiness from the canonical module only", () => {
    const editor = readSrc("components/admin/RecipeEditor.tsx");
    assert.match(
      editor,
      /import\s*\{[^}]*getRecipePublishingReadiness[^}]*\}\s*from\s*"@\/lib\/recipe-publishing-readiness"/,
    );
    assert.match(editor, /getRecipePublishingReadiness\s*\(/);
    assert.match(editor, /"use client"/);
  });

  it("built RecipeEditor client chunk invokes a real readiness function (not missing export)", () => {
    const candidates = [
      ...walk(path.join(repoRoot, ".next", "static", "chunks")),
      ...walk(path.join(repoRoot, ".next", "server", "chunks", "ssr")),
    ];
    if (!candidates.length) {
      assert.ok(true, "skip: no .next build artifacts yet");
      return;
    }

    const editorChunk = candidates.find((f) => {
      const base = path.basename(f);
      if (base.includes("RecipeEditor")) {
        const s = readFileSync(f, "utf8");
        return s.includes("ready_with_recommendations") && s.includes("useMemo");
      }
      const s = readFileSync(f, "utf8");
      return (
        s.includes("saveRecipeAction") &&
        s.includes("ready_with_recommendations") &&
        s.includes("useMemo") &&
        s.includes("resolveSection")
      );
    });
    assert.ok(editorChunk, "expected a built RecipeEditor chunk");

    const source = readFileSync(editorChunk!, "utf8");

    // Pre-fix failure class: (0, ns.getRecipePublishingReadiness) where ns is
    // recipe-editor-completeness and the export is undefined.
    const nsCall = source.match(
      /\(0,([A-Za-z_$][\w$]*)\.getRecipePublishingReadiness\)\s*\(/,
    );
    if (nsCall) {
      const ns = nsCall[1];
      const assign = source.match(new RegExp(`${ns}=a\\.i\\((\\d+)\\)`));
      assert.ok(assign, `expected module id for namespace ${ns}`);
      const moduleId = assign![1];
      const factoryIdx = Math.max(
        source.indexOf(`,${moduleId},a=>`),
        source.indexOf(`[${moduleId},a=>`),
      );
      assert.ok(factoryIdx >= 0, `expected factory for module ${moduleId}`);
      const factoryHead = source.slice(factoryIdx, factoryIdx + 900);
      assert.match(
        factoryHead,
        /getRecipePublishingReadiness/,
        `module ${moduleId} must export getRecipePublishingReadiness (pre-fix bound completeness)`,
      );
      return;
    }

    // Post-fix Turbopack may inline the canonical function into the chunk.
    const inlineCall = source.match(
      /useMemo\)\(\(\)=>([A-Za-z_$][\w$]*)\(\{title:[^,]+,slug:[^,]+,excerpt:[^,]+,typeId:[^,]+,fields:[^,]+,values:[^,]+,categoryIds:[^,]+,aiMeta:[^,]+,resolveSection:/,
    );
    assert.ok(inlineCall, "expected useMemo readiness call (namespaced or inlined)");
    const fnName = inlineCall![1];
    const fnIdx = source.indexOf(`function ${fnName}(`);
    assert.ok(fnIdx >= 0, `expected local function ${fnName}`);
    const fnBody = source.slice(fnIdx, fnIdx + 8000);
    assert.match(fnBody, /ready_with_recommendations/);
    assert.match(fnBody, /not_ready/);
    assert.equal(typeof fnName, "string");
  });
});
