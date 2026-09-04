import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const editor = readFileSync(path.join(root, "../components/admin/RecipeEditor.tsx"), "utf8");

const headerJsx = editor.slice(
  editor.indexOf("ref={stickyHeaderRef}"),
  editor.indexOf("ref={headerSentinelRef}"),
);

describe("Recipe editor sticky header title layout", () => {
  it("gives the title region flexible width and keeps actions shrink-to-content", () => {
    assert.match(headerJsx, /lg:flex-row lg:items-start lg:justify-between/);
    assert.match(headerJsx, /min-w-0 flex-1/);
    assert.match(headerJsx, /flex shrink-0 flex-wrap items-center gap-2/);
    assert.match(headerJsx, /<h1 className="min-w-0 flex-1 font-serif/);
    assert.doesNotMatch(headerJsx, /<h1[^>]*max-w-/);
    assert.doesNotMatch(headerJsx, /basis-\[|w-\[2[0-9]rem\]|w-1\/2|w-2\/5/);
  });

  it("moves the type label onto the status line below 2xl so the H1 can use full width", () => {
    assert.match(headerJsx, /hidden shrink-0[\s\S]*2xl:inline/);
    assert.match(headerJsx, /2xl:hidden/);
    assert.match(headerJsx, /\{typeName\}/);
    assert.match(headerJsx, /documentStateLabel/);
    assert.match(headerJsx, /publicationLabel/);
  });

  it("preserves opaque sticky chrome and mobile compact stacking", () => {
    assert.match(headerJsx, /sticky top-0 z-50 isolate/);
    assert.match(headerJsx, /adminRecipeEditorStickyBleedClass/);
    assert.match(headerJsx, /bg-\[var\(--cream\)\]/);
    assert.doesNotMatch(headerJsx, /bg-\[var\(--cream\)\]\/95/);
    assert.doesNotMatch(headerJsx, /backdrop-blur/);
    assert.match(headerJsx, /mobileHeaderCompact \? "hidden md:block"/);
    assert.match(headerJsx, /mobileHeaderCompact \? "flex" : "hidden"[\s\S]*md:hidden/);
    assert.match(headerJsx, /truncate text-sm font-semibold text-ink/);
  });
});
