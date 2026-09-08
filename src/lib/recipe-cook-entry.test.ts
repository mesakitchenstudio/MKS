import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  serializeCookEntrySnapshot,
  type RecipeCookEntrySnapshot,
} from "@/components/cooking/RecipeCookEntry";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

/** Mirrors React's checkIfSnapshotChanged used by useSyncExternalStore. */
function countUpdatesUntilStable<T>(getSnapshot: () => T, max = 100) {
  let value = getSnapshot();
  let updates = 0;
  while (!Object.is(value, getSnapshot()) && updates < max) {
    value = getSnapshot();
    updates += 1;
  }
  return updates;
}

describe("RecipeCookEntry React #185 snapshot stability", () => {
  it("unstable object getSnapshot never settles (pre-fix failure class)", () => {
    const updates = countUpdatesUntilStable(() => ({
      label: "Start Cooking",
      href: "/recipes/demo/cook",
    } satisfies RecipeCookEntrySnapshot));
    assert.equal(updates, 100);
  });

  it("serialized string getSnapshot settles immediately (fix class)", () => {
    const getSnapshot = () =>
      serializeCookEntrySnapshot({
        label: "Start Cooking",
        href: "/recipes/demo/cook",
      });
    assert.equal(getSnapshot(), getSnapshot());
    assert.equal(countUpdatesUntilStable(getSnapshot), 0);
  });

  it("RecipeCookEntry serializes snapshots for useSyncExternalStore", () => {
    const entry = read("components/cooking/RecipeCookEntry.tsx");
    assert.match(entry, /useSyncExternalStore/);
    assert.match(entry, /serializeCookEntrySnapshot/);
    assert.match(entry, /parseCookEntrySnapshot/);
    assert.match(entry, /JSON\.stringify/);
    // Guard against regressing to a bare fresh-object getSnapshot.
    assert.doesNotMatch(
      entry,
      /useSyncExternalStore\(\s*subscribeRecipeServingsBridge,\s*getSnapshot,\s*\(\)\s*=>\s*\(\s*\{\s*label:/,
    );
    assert.doesNotMatch(
      entry,
      /getSnapshot = useCallback\(\s*\(\)\s*=>\s*readEntrySnapshot/,
    );
  });
});
