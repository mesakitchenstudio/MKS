import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  enrichRecipeValuesWithDerivedChapters,
  normalizeInstructionGroups,
} from "./instruction-chapters.ts";
import { isRecipeStepTimestampsEnabled } from "./flags.ts";
import {
  buildRecipeRevisionSnapshot,
  hashRecipeRevisionSnapshot,
} from "./recipe-revisions.ts";
import {
  MAX_STEP_VIDEO_TIMESTAMP_SECONDS,
  alignStepVideoTimestamps,
  clearStepVideoTimestamps,
  didRecipeVideoIdChange,
  getCanonicalRecipeVideoIdFromValues,
  getStepTimestampBindingState,
  hasStepVideoTimestamps,
  normalizeStepVideoTimestampSeconds,
  withAppendedInstructionStep,
  withInsertedInstructionStep,
  withMovedInstructionStep,
  withRemovedInstructionStep,
  withStepTimestampsVideoBinding,
} from "./step-video-timestamps.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

const VIDEO_A = "abcdefghijk";
const VIDEO_B = "zyxwvutsrqp";

describe("Roadmap #10B — feature gate", () => {
  it("RECIPE_STEP_TIMESTAMPS_ENABLED exact lowercase true only", () => {
    const prev = process.env.RECIPE_STEP_TIMESTAMPS_ENABLED;
    try {
      delete process.env.RECIPE_STEP_TIMESTAMPS_ENABLED;
      assert.equal(isRecipeStepTimestampsEnabled(), false);
      process.env.RECIPE_STEP_TIMESTAMPS_ENABLED = "false";
      assert.equal(isRecipeStepTimestampsEnabled(), false);
      process.env.RECIPE_STEP_TIMESTAMPS_ENABLED = "TRUE";
      assert.equal(isRecipeStepTimestampsEnabled(), false);
      process.env.RECIPE_STEP_TIMESTAMPS_ENABLED = "True";
      assert.equal(isRecipeStepTimestampsEnabled(), false);
      process.env.RECIPE_STEP_TIMESTAMPS_ENABLED = "1";
      assert.equal(isRecipeStepTimestampsEnabled(), false);
      process.env.RECIPE_STEP_TIMESTAMPS_ENABLED = "yes";
      assert.equal(isRecipeStepTimestampsEnabled(), false);
      process.env.RECIPE_STEP_TIMESTAMPS_ENABLED = "true";
      assert.equal(isRecipeStepTimestampsEnabled(), true);
    } finally {
      if (prev === undefined) delete process.env.RECIPE_STEP_TIMESTAMPS_ENABLED;
      else process.env.RECIPE_STEP_TIMESTAMPS_ENABLED = prev;
    }
  });

  it("flag helper is server-only (no NEXT_PUBLIC)", () => {
    const flags = read("lib/flags.ts");
    assert.match(flags, /RECIPE_STEP_TIMESTAMPS_ENABLED === "true"/);
    assert.match(flags, /isRecipeStepTimestampsEnabled/);
    assert.doesNotMatch(flags, /NEXT_PUBLIC_RECIPE_STEP_TIMESTAMPS/);
  });
});

describe("Roadmap #10B — normalizeStepVideoTimestampSeconds", () => {
  it("accepts 0 and positive integers within max", () => {
    assert.equal(normalizeStepVideoTimestampSeconds(0), 0);
    assert.equal(normalizeStepVideoTimestampSeconds(102), 102);
    assert.equal(normalizeStepVideoTimestampSeconds(MAX_STEP_VIDEO_TIMESTAMP_SECONDS), MAX_STEP_VIDEO_TIMESTAMP_SECONDS);
  });

  it("rejects invalid values", () => {
    assert.equal(normalizeStepVideoTimestampSeconds(null), null);
    assert.equal(normalizeStepVideoTimestampSeconds(undefined), null);
    assert.equal(normalizeStepVideoTimestampSeconds(""), null);
    assert.equal(normalizeStepVideoTimestampSeconds(-1), null);
    assert.equal(normalizeStepVideoTimestampSeconds(1.5), null);
    assert.equal(normalizeStepVideoTimestampSeconds(Number.NaN), null);
    assert.equal(normalizeStepVideoTimestampSeconds(Number.POSITIVE_INFINITY), null);
    assert.equal(normalizeStepVideoTimestampSeconds(MAX_STEP_VIDEO_TIMESTAMP_SECONDS + 1), null);
    assert.equal(normalizeStepVideoTimestampSeconds("abc"), null);
    assert.equal(normalizeStepVideoTimestampSeconds(true), null);
  });
});

describe("Roadmap #10B — alignStepVideoTimestamps / absence preservation", () => {
  it("returns undefined when field is absent", () => {
    assert.equal(alignStepVideoTimestamps(undefined, 3), undefined);
    assert.equal(alignStepVideoTimestamps([], 3), undefined);
  });

  it("returns undefined when all slots normalize to null (no churn arrays)", () => {
    assert.equal(alignStepVideoTimestamps([null, null, null], 3), undefined);
    assert.equal(alignStepVideoTimestamps([-1, "x", 1.5] as never, 3), undefined);
  });

  it("preserves 0 and pads/truncates to step count", () => {
    assert.deepEqual(alignStepVideoTimestamps([0, 20], 3), [0, 20, null]);
    assert.deepEqual(alignStepVideoTimestamps([10, 20, 30, 40], 2), [10, 20]);
  });

  it("mixed null/values and short/long arrays", () => {
    assert.deepEqual(alignStepVideoTimestamps([null, 20, null], 3), [null, 20, null]);
    assert.deepEqual(alignStepVideoTimestamps([10], 3), [10, null, null]);
  });
});

describe("Roadmap #10B — normalizeInstructionGroups", () => {
  it("leaves historical groups without stepVideoTimestamps absent", () => {
    const groups = normalizeInstructionGroups([
      { name: "Mix", steps: ["A", "B", "C"] },
    ]);
    assert.equal(groups[0]!.stepVideoTimestamps, undefined);
    assert.deepEqual(groups[0]!.steps, ["A", "B", "C"]);
  });

  it("normalizes valid timestamps including 0; drops invalid", () => {
    const groups = normalizeInstructionGroups([
      {
        name: "Mix",
        steps: ["A", "B", "C"],
        stepVideoTimestamps: [0, -5, 90],
      },
    ]);
    assert.deepEqual(groups[0]!.stepVideoTimestamps, [0, null, 90]);
  });

  it("does not materialize all-null timestamp arrays", () => {
    const groups = normalizeInstructionGroups([
      {
        name: "Mix",
        steps: ["A", "B"],
        stepVideoTimestamps: [null, null],
      },
    ]);
    assert.equal(groups[0]!.stepVideoTimestamps, undefined);
  });

  it("preserves stepTimers alongside stepVideoTimestamps", () => {
    const groups = normalizeInstructionGroups([
      {
        name: "Mix",
        steps: ["A", "B"],
        stepTimers: [null, 600],
        stepVideoTimestamps: [10, 20],
        startTimestamp: 30,
        chapterLabel: "Mix",
      },
    ]);
    assert.equal(groups[0]!.stepTimers?.[1], 600);
    assert.deepEqual(groups[0]!.stepVideoTimestamps, [10, 20]);
    assert.equal(groups[0]!.startTimestamp, 30);
    assert.equal(groups[0]!.chapterLabel, "Mix");
  });

  it("does not conflate section startTimestamp with stepVideoTimestamps", () => {
    const groups = normalizeInstructionGroups([
      {
        name: "Bake",
        steps: ["A"],
        startTimestamp: 120,
      },
    ]);
    assert.equal(groups[0]!.startTimestamp, 120);
    assert.equal(groups[0]!.stepVideoTimestamps, undefined);
  });
});

describe("Roadmap #10B — step insert / remove / reorder", () => {
  it("insert between steps co-moves timestamps; absent array stays absent", () => {
    const withTs = withInsertedInstructionStep(
      {
        steps: ["A", "B", "C"],
        stepVideoTimestamps: [10, 20, 30],
      },
      1,
      "X",
    );
    assert.deepEqual(withTs.steps, ["A", "X", "B", "C"]);
    assert.deepEqual(withTs.stepVideoTimestamps, [10, null, 20, 30]);

    const historical = withAppendedInstructionStep({ steps: ["A", "B"] }, "");
    assert.deepEqual(historical.steps, ["A", "B", ""]);
    assert.equal(historical.stepVideoTimestamps, undefined);
  });

  it("remove keeps surviving timestamps attached", () => {
    const middle = withRemovedInstructionStep(
      { steps: ["A", "B", "C"], stepVideoTimestamps: [10, 20, 30] },
      1,
    );
    assert.deepEqual(middle.steps, ["A", "C"]);
    assert.deepEqual(middle.stepVideoTimestamps, [10, 30]);

    const first = withRemovedInstructionStep(
      { steps: ["A", "B", "C"], stepVideoTimestamps: [10, 20, 30] },
      0,
    );
    assert.deepEqual(first.steps, ["B", "C"]);
    assert.deepEqual(first.stepVideoTimestamps, [20, 30]);

    const last = withRemovedInstructionStep(
      { steps: ["A", "B", "C"], stepVideoTimestamps: [10, 20, 30] },
      2,
    );
    assert.deepEqual(last.steps, ["A", "B"]);
    assert.deepEqual(last.stepVideoTimestamps, [10, 20]);
  });

  it("reorder moves timestamp with the step (not length-only realign)", () => {
    const moved = withMovedInstructionStep(
      { steps: ["A", "B", "C"], stepVideoTimestamps: [10, 20, 30] },
      2,
      0,
    );
    assert.deepEqual(moved.steps, ["C", "A", "B"]);
    assert.deepEqual(moved.stepVideoTimestamps, [30, 10, 20]);
  });

  it("reorder also co-moves stepTimers when present", () => {
    const moved = withMovedInstructionStep(
      {
        steps: ["A", "B", "C"],
        stepTimers: [null, 600, 1200],
        stepVideoTimestamps: [10, 20, 30],
      },
      2,
      0,
    );
    assert.deepEqual(moved.steps, ["C", "A", "B"]);
    assert.equal(moved.stepTimers?.[0], 1200);
    assert.deepEqual(moved.stepVideoTimestamps, [30, 10, 20]);
  });
});

describe("Roadmap #10B — cross-group / group reorder", () => {
  it("documents no first-class cross-group step move in editor", () => {
    const accordion = read("components/admin/InstructionsAccordionEditor.tsx");
    assert.doesNotMatch(accordion, /moveStepToGroup|crossGroup|betweenGroups/i);
  });

  it("group reorder keeps embedded stepVideoTimestamps on the group object", () => {
    const groups = [
      { name: "One", steps: ["A"], stepVideoTimestamps: [10] },
      { name: "Two", steps: ["B"], stepVideoTimestamps: [20] },
    ];
    const reordered = [groups[1]!, groups[0]!];
    assert.deepEqual(reordered[0]!.stepVideoTimestamps, [20]);
    assert.deepEqual(reordered[1]!.stepVideoTimestamps, [10]);
  });

  it("group delete drops the group's stepVideoTimestamps with it", () => {
    const groups = [
      { name: "One", steps: ["A"], stepVideoTimestamps: [10] },
      { name: "Two", steps: ["B"], stepVideoTimestamps: [20] },
    ];
    const remaining = groups.filter((_, i) => i !== 0);
    assert.equal(remaining.length, 1);
    assert.deepEqual(remaining[0]!.stepVideoTimestamps, [20]);
    assert.equal(hasStepVideoTimestamps(remaining), true);
  });
});

describe("Roadmap #10B — video binding states", () => {
  it("none when no valid timestamps (even with binding leftover)", () => {
    assert.equal(
      getStepTimestampBindingState({
        instructions: [{ steps: ["A"] }],
        youtube: { videoId: VIDEO_A, stepTimestampsVideoId: VIDEO_A },
      }),
      "none",
    );
  });

  it("0-second-only timestamp counts as present", () => {
    assert.equal(hasStepVideoTimestamps([{ steps: ["A"], stepVideoTimestamps: [0] }]), true);
    assert.equal(
      getStepTimestampBindingState({
        instructions: [{ steps: ["A"], stepVideoTimestamps: [0] }],
        youtube: { videoId: VIDEO_A, stepTimestampsVideoId: VIDEO_A },
      }),
      "active",
    );
  });

  it("active / unbound / missing_video / mismatch", () => {
    const instructions = [{ steps: ["A", "B"], stepVideoTimestamps: [10, null] }];
    assert.equal(
      getStepTimestampBindingState({
        instructions,
        youtube: { videoId: VIDEO_A, stepTimestampsVideoId: VIDEO_A },
      }),
      "active",
    );
    assert.equal(
      getStepTimestampBindingState({
        instructions,
        youtube: { videoId: VIDEO_A },
      }),
      "unbound",
    );
    assert.equal(
      getStepTimestampBindingState({
        instructions,
        youtube: { stepTimestampsVideoId: VIDEO_A },
      }),
      "missing_video",
    );
    assert.equal(
      getStepTimestampBindingState({
        instructions,
        youtube: { videoId: VIDEO_B, stepTimestampsVideoId: VIDEO_A },
      }),
      "mismatch",
    );
  });

  it("same video ID via differently formatted URL is unchanged identity", () => {
    const a = getCanonicalRecipeVideoIdFromValues({
      youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_A}`,
    });
    const b = getCanonicalRecipeVideoIdFromValues({
      youtube: { url: `https://youtu.be/${VIDEO_A}` },
    });
    assert.equal(a, VIDEO_A);
    assert.equal(b, VIDEO_A);
    assert.equal(
      didRecipeVideoIdChange(
        { youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_A}` },
        { youtube: { url: `https://youtu.be/${VIDEO_A}` } },
      ),
      "unchanged",
    );
  });
});

describe("Roadmap #10B — video replacement detection", () => {
  it("classifies unchanged / replaced / removed / added", () => {
    assert.equal(
      didRecipeVideoIdChange(
        { youtube: { videoId: VIDEO_A } },
        { youtube: { videoId: VIDEO_A } },
      ),
      "unchanged",
    );
    assert.equal(
      didRecipeVideoIdChange(
        { youtube: { videoId: VIDEO_A } },
        { youtube: { videoId: VIDEO_B } },
      ),
      "replaced",
    );
    assert.equal(
      didRecipeVideoIdChange({ youtube: { videoId: VIDEO_A } }, {}),
      "removed",
    );
    assert.equal(
      didRecipeVideoIdChange({}, { youtube: { videoId: VIDEO_A } }),
      "added",
    );
  });
});

describe("Roadmap #10B — pure binding helpers", () => {
  it("withStepTimestampsVideoBinding sets and clears binding without inventing timestamps", () => {
    const bound = withStepTimestampsVideoBinding(
      { instructions: [{ steps: ["A"] }], youtube: { videoId: VIDEO_A } },
      VIDEO_A,
    );
    assert.equal(
      (bound.youtube as { stepTimestampsVideoId?: string }).stepTimestampsVideoId,
      VIDEO_A,
    );
    assert.equal(hasStepVideoTimestamps(bound.instructions), false);

    const cleared = withStepTimestampsVideoBinding(bound, null);
    assert.equal(
      (cleared.youtube as { stepTimestampsVideoId?: string }).stepTimestampsVideoId,
      undefined,
    );
  });

  it("clearStepVideoTimestamps removes stamps and binding", () => {
    const cleared = clearStepVideoTimestamps({
      instructions: [{ steps: ["A"], stepVideoTimestamps: [10], startTimestamp: 5 }],
      youtube: { videoId: VIDEO_A, stepTimestampsVideoId: VIDEO_A },
    });
    assert.equal(
      (cleared.instructions as { stepVideoTimestamps?: unknown }[])[0]!.stepVideoTimestamps,
      undefined,
    );
    assert.equal(
      (cleared.instructions as { startTimestamp?: number }[])[0]!.startTimestamp,
      5,
    );
    assert.equal(
      (cleared.youtube as { stepTimestampsVideoId?: string }).stepTimestampsVideoId,
      undefined,
    );
    assert.equal(getStepTimestampBindingState(cleared), "none");
  });
});

describe("Roadmap #10B — derived chapters preserve #10 fields", () => {
  it("enrichRecipeValuesWithDerivedChapters keeps stepVideoTimestamps and binding", () => {
    const values = {
      instructions: [
        {
          name: "Mix",
          steps: ["A", "B"],
          stepVideoTimestamps: [0, 45],
          startTimestamp: 10,
          chapterLabel: "Mixing",
        },
        {
          name: "Bake",
          steps: ["C"],
          stepVideoTimestamps: [90],
          startTimestamp: 100,
        },
      ],
      youtube: {
        videoId: VIDEO_A,
        stepTimestampsVideoId: VIDEO_A,
        duration: "05:00",
      },
    };
    const enriched = enrichRecipeValuesWithDerivedChapters(values);
    const groups = enriched.instructions as {
      stepVideoTimestamps?: number[];
      startTimestamp?: number;
    }[];
    assert.deepEqual(groups[0]!.stepVideoTimestamps, [0, 45]);
    assert.deepEqual(groups[1]!.stepVideoTimestamps, [90]);
    assert.equal(groups[0]!.startTimestamp, 10);
    assert.equal(
      (enriched.youtube as { stepTimestampsVideoId?: string }).stepTimestampsVideoId,
      VIDEO_A,
    );
    assert.ok(Array.isArray((enriched.youtube as { timestamps?: unknown[] }).timestamps));
    assert.ok(
      !(enriched.youtube as { timestamps?: { stepIndex?: number }[] }).timestamps?.some(
        (row) => row.stepIndex != null,
      ),
    );
  });
});

describe("Roadmap #10B — revision / content hash", () => {
  const base = {
    title: "Bread",
    excerpt: "x",
    featured: false,
    seasonal: false,
    typeId: "t1",
    categoryIds: ["c1"],
    slug: "bread",
    status: "published" as const,
    publishedAt: "2026-01-01T00:00:00.000Z",
  };

  it("timestamp-only change is content-significant", () => {
    const a = buildRecipeRevisionSnapshot({
      ...base,
      values: {
        instructions: [{ steps: ["A"], stepVideoTimestamps: [10] }],
        youtube: { videoId: VIDEO_A, stepTimestampsVideoId: VIDEO_A },
      },
    });
    const b = buildRecipeRevisionSnapshot({
      ...base,
      values: {
        instructions: [{ steps: ["A"], stepVideoTimestamps: [20] }],
        youtube: { videoId: VIDEO_A, stepTimestampsVideoId: VIDEO_A },
      },
    });
    assert.notEqual(hashRecipeRevisionSnapshot(a), hashRecipeRevisionSnapshot(b));
  });

  it("binding-only change is content-significant", () => {
    const a = buildRecipeRevisionSnapshot({
      ...base,
      values: {
        instructions: [{ steps: ["A"], stepVideoTimestamps: [10] }],
        youtube: { videoId: VIDEO_A, stepTimestampsVideoId: VIDEO_A },
      },
    });
    const b = buildRecipeRevisionSnapshot({
      ...base,
      values: {
        instructions: [{ steps: ["A"], stepVideoTimestamps: [10] }],
        youtube: { videoId: VIDEO_A, stepTimestampsVideoId: VIDEO_B },
      },
    });
    assert.notEqual(hashRecipeRevisionSnapshot(a), hashRecipeRevisionSnapshot(b));
  });

  it("snapshot retains stepVideoTimestamps and binding; historical values remain valid", () => {
    const withFields = buildRecipeRevisionSnapshot({
      ...base,
      values: {
        instructions: [{ steps: ["A"], stepVideoTimestamps: [0] }],
        youtube: { videoId: VIDEO_A, stepTimestampsVideoId: VIDEO_A },
      },
    });
    assert.deepEqual(
      (withFields.values.instructions as { stepVideoTimestamps?: number[] }[])[0]
        ?.stepVideoTimestamps,
      [0],
    );
    assert.equal(
      (withFields.values.youtube as { stepTimestampsVideoId?: string }).stepTimestampsVideoId,
      VIDEO_A,
    );

    const historical = buildRecipeRevisionSnapshot({
      ...base,
      values: { instructions: [{ steps: ["A", "B"] }] },
    });
    assert.equal(
      (historical.values.instructions as { stepVideoTimestamps?: unknown }[])[0]
        ?.stepVideoTimestamps,
      undefined,
    );
    assert.equal(getStepTimestampBindingState(historical.values), "none");
  });

  it("restore-style mismatch: restored binding vs current video reports mismatch", () => {
    const restoredValues = {
      instructions: [{ steps: ["A"], stepVideoTimestamps: [15] }],
      youtube: { videoId: VIDEO_B, stepTimestampsVideoId: VIDEO_A },
    };
    assert.equal(getStepTimestampBindingState(restoredValues), "mismatch");
  });
});

describe("Roadmap #10B — no UI / prisma / player scope leak", () => {
  it("does not add Admin timestamp input or public Watch-at UI in 10B", () => {
    const accordion = read("components/admin/InstructionsAccordionEditor.tsx");
    assert.doesNotMatch(accordion, /stepVideoTimestamps.*input|Video timestamp/i);
    const card = read("components/RecipeCard.tsx");
    assert.doesNotMatch(card, /stepVideoTimestamps/);
    const cook = read("components/cooking/CookingMode.tsx");
    assert.doesNotMatch(cook, /stepVideoTimestamps/);
  });

  it("does not change Prisma schema", () => {
    const schema = readFileSync(path.join(srcRoot, "..", "prisma", "schema.prisma"), "utf8");
    assert.doesNotMatch(schema, /stepVideoTimestamps|stepTimestampsVideoId/);
  });
});
