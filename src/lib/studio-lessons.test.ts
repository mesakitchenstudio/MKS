import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lessons, lessonHref, partitionStudioLessons } from "../data/lessons.ts";

describe("studio lessons", () => {
  it("partitions featured and remaining lessons", () => {
    const { featured, notes } = partitionStudioLessons(lessons);
    assert.equal(featured.slug, "how-to-measure");
    assert.equal(notes.length, 3);
    assert.ok(notes.every((lesson) => lesson.slug !== featured.slug));
  });

  it("builds lesson routes", () => {
    assert.equal(lessonHref("how-to-measure"), "/studio/how-to-measure");
  });
});
