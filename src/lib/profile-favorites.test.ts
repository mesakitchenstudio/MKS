import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("profile favorites launch QA", () => {
  it("keeps dishName aria-labels, 44px hearts, and live empty-state focus", () => {
    const favorites = read("components/ProfileFavorites.tsx");
    const profile = read("app/profile/page.tsx");

    assert.match(favorites, /resolveRecipeCardTitle/);
    assert.match(favorites, /Remove \$\{dishLabel\} from favorites/);
    assert.match(favorites, /h-11 w-11/);
    assert.doesNotMatch(favorites, /h-10 w-10/);
    assert.match(favorites, /browseRef\.current\?\.focus/);
    assert.match(favorites, /remainingLabel/);

    assert.match(profile, /break-words font-serif text-4xl/);
    assert.match(profile, /<ProfileFavorites/);
    assert.doesNotMatch(profile, /FavoritesEmptyState/);
    assert.match(profile, /const session = await auth\(\)/);
    assert.match(profile, /const email = session\?\.user\?\.email/);
    assert.doesNotMatch(profile, /searchParams/);
  });
});
