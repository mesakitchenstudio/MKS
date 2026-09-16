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
  applyStepVideoTimestampsOnSave,
  clearStepVideoTimestamps,
  getStepTimestampBindingState,
  hasStepVideoTimestamps,
  withInsertedInstructionStep,
  withMovedInstructionStep,
  withRemovedInstructionStep,
  withStepVideoTimestampSeconds,
} from "./step-video-timestamps.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

const VIDEO_A = "abcdefghijk";
const VIDEO_B = "zyxwvutsrqp";

function valuesWith(input: {
  videoId?: string | null;
  youtubeUrl?: string;
  binding?: string | null;
  stamps?: Array<number | null> | null;
  steps?: string[];
  startTimestamp?: number;
}) {
  const steps = input.steps ?? ["A", "B", "C"];
  const group: Record<string, unknown> = {
    name: "Mix",
    steps,
  };
  if (input.stamps) group.stepVideoTimestamps = input.stamps;
  if (input.startTimestamp != null) group.startTimestamp = input.startTimestamp;
  const youtube: Record<string, unknown> = {};
  if (input.videoId) youtube.videoId = input.videoId;
  if (input.binding) youtube.stepTimestampsVideoId = input.binding;
  const values: Record<string, unknown> = {
    instructions: [group],
  };
  if (Object.keys(youtube).length) values.youtube = youtube;
  if (input.youtubeUrl) values.youtubeUrl = input.youtubeUrl;
  return values;
}

describe("Roadmap #10C — Admin gate wiring", () => {
  it("Admin Recipe pages pass isRecipeStepTimestampsEnabled into RecipeEditor", () => {
    const edit = read("app/admin/(app)/recipes/[id]/page.tsx");
    const create = read("app/admin/(app)/recipes/new/page.tsx");
    assert.match(edit, /stepTimestampsEnabled=\{isRecipeStepTimestampsEnabled\(\)\}/);
    assert.match(create, /stepTimestampsEnabled=\{isRecipeStepTimestampsEnabled\(\)\}/);
  });

  it("InstructionsAccordionEditor gates Video timestamp fields", () => {
    const accordion = read("components/admin/InstructionsAccordionEditor.tsx");
    assert.match(accordion, /stepTimestampsEnabled/);
    assert.match(accordion, /Video timestamp/);
    assert.match(accordion, /Reconfirm for current video/);
    assert.match(accordion, /Clear step timestamps/);
  });

  it("gate OFF leaves UI hooks inactive in source contracts", () => {
    const prev = process.env.RECIPE_STEP_TIMESTAMPS_ENABLED;
    try {
      delete process.env.RECIPE_STEP_TIMESTAMPS_ENABLED;
      assert.equal(isRecipeStepTimestampsEnabled(), false);
    } finally {
      if (prev === undefined) delete process.env.RECIPE_STEP_TIMESTAMPS_ENABLED;
      else process.env.RECIPE_STEP_TIMESTAMPS_ENABLED = prev;
    }
  });
});

describe("Roadmap #10C — applyStepVideoTimestampsOnSave", () => {
  it("first authoring auto-binds to current video", () => {
    const previous = valuesWith({ videoId: VIDEO_A });
    const next = valuesWith({
      videoId: VIDEO_A,
      stamps: [0, 102, null],
    });
    const result = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: next,
      featureEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(getStepTimestampBindingState(result.values), "active");
    assert.deepEqual(
      (result.values.instructions as { stepVideoTimestamps?: number[] }[])[0]
        ?.stepVideoTimestamps,
      [0, 102, null],
    );
  });

  it("0-second first authoring binds", () => {
    const result = applyStepVideoTimestampsOnSave({
      previousValues: valuesWith({ videoId: VIDEO_A }),
      nextValues: valuesWith({ videoId: VIDEO_A, stamps: [0] , steps: ["A"] }),
      featureEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(getStepTimestampBindingState(result.values), "active");
  });

  it("rejects timestamp mutation without video", () => {
    const result = applyStepVideoTimestampsOnSave({
      previousValues: valuesWith({}),
      nextValues: valuesWith({ stamps: [10, null, null] }),
      featureEnabled: true,
    });
    assert.equal(result.ok, false);
  });

  it("rejects invalid numeric timestamps", () => {
    for (const bad of [-1, 1.5, 86401]) {
      const result = applyStepVideoTimestampsOnSave({
        previousValues: valuesWith({ videoId: VIDEO_A }),
        nextValues: valuesWith({ videoId: VIDEO_A, stamps: [bad as number, null, null] }),
        featureEnabled: true,
      });
      assert.equal(result.ok, false, `expected reject for ${bad}`);
    }
  });

  it("active mapping allows edits and keeps binding", () => {
    const previous = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_A,
      stamps: [10, 20, null],
    });
    const next = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_A,
      stamps: [10, 45, null],
    });
    const result = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: next,
      featureEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(getStepTimestampBindingState(result.values), "active");
    assert.deepEqual(
      (result.values.instructions as { stepVideoTimestamps?: number[] }[])[0]
        ?.stepVideoTimestamps,
      [10, 45, null],
    );
  });

  it("same video URL formatting change keeps active mapping without reconfirm", () => {
    const previous = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_A,
      stamps: [10, null, null],
    });
    const next = {
      instructions: previous.instructions,
      youtubeUrl: `https://youtu.be/${VIDEO_A}`,
      youtube: { stepTimestampsVideoId: VIDEO_A },
    };
    const result = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: next,
      featureEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(getStepTimestampBindingState(result.values), "active");
  });

  it("video replacement retains dormant binding and does not silent-rebind", () => {
    const previous = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_A,
      stamps: [10, 20, null],
    });
    const next = valuesWith({
      videoId: VIDEO_B,
      binding: VIDEO_B, // malicious client attempt
      stamps: [10, 20, null],
    });
    const result = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: next,
      featureEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(getStepTimestampBindingState(result.values), "mismatch");
    assert.equal(
      (result.values.youtube as { stepTimestampsVideoId?: string }).stepTimestampsVideoId,
      VIDEO_A,
    );
  });

  it("rejects timestamp mutation during mismatch without reconfirm", () => {
    const previous = valuesWith({
      videoId: VIDEO_B,
      binding: VIDEO_A,
      stamps: [10, 20, null],
    });
    const next = valuesWith({
      videoId: VIDEO_B,
      binding: VIDEO_A,
      stamps: [10, 99, null],
    });
    const result = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: next,
      featureEnabled: true,
    });
    assert.equal(result.ok, false);
  });

  it("unrelated save during mismatch preserves timestamps and binding", () => {
    const previous = valuesWith({
      videoId: VIDEO_B,
      binding: VIDEO_A,
      stamps: [10, 20, null],
      startTimestamp: 5,
    });
    const next = {
      ...previous,
      title: "Renamed",
      youtube: { videoId: VIDEO_B, stepTimestampsVideoId: VIDEO_B },
    };
    const result = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: next,
      featureEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(getStepTimestampBindingState(result.values), "mismatch");
    assert.equal(
      (result.values.instructions as { startTimestamp?: number }[])[0]?.startTimestamp,
      5,
    );
  });

  it("explicit reconfirm binds to server current video only", () => {
    const previous = valuesWith({
      videoId: VIDEO_B,
      binding: VIDEO_A,
      stamps: [10, 20, null],
    });
    const next = valuesWith({
      videoId: VIDEO_B,
      binding: "lllllllllll", // ignored
      stamps: [10, 20, null],
    });
    const result = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: next,
      intent: "reconfirm",
      featureEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(getStepTimestampBindingState(result.values), "active");
    assert.equal(
      (result.values.youtube as { stepTimestampsVideoId?: string }).stepTimestampsVideoId,
      VIDEO_B,
    );
  });

  it("unbound timestamps require reconfirm before mutation", () => {
    const previous = valuesWith({
      videoId: VIDEO_A,
      stamps: [10, null, null],
    });
    const next = valuesWith({
      videoId: VIDEO_A,
      stamps: [12, null, null],
    });
    const blocked = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: next,
      featureEnabled: true,
    });
    assert.equal(blocked.ok, false);

    const confirmed = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: valuesWith({ videoId: VIDEO_A, stamps: [10, null, null] }),
      intent: "reconfirm",
      featureEnabled: true,
    });
    assert.equal(confirmed.ok, true);
    if (!confirmed.ok) return;
    assert.equal(getStepTimestampBindingState(confirmed.values), "active");
  });

  it("clear intent removes timestamps and binding; keeps section chapters", () => {
    const previous = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_A,
      stamps: [10, 20, null],
      startTimestamp: 40,
    });
    const result = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: previous,
      intent: "clear",
      featureEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(hasStepVideoTimestamps(result.values.instructions), false);
    assert.equal(
      (result.values.youtube as { stepTimestampsVideoId?: string }).stepTimestampsVideoId,
      undefined,
    );
    assert.equal(
      (result.values.instructions as { startTimestamp?: number }[])[0]?.startTimestamp,
      40,
    );
  });

  it("video removal retains dormant timestamps", () => {
    const previous = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_A,
      stamps: [10, null, null],
    });
    const next = {
      instructions: previous.instructions,
      youtube: { stepTimestampsVideoId: VIDEO_A },
    };
    const result = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: next,
      featureEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(getStepTimestampBindingState(result.values), "missing_video");
  });

  it("same-video restoration becomes active without reconfirm", () => {
    const previous = {
      instructions: [{ steps: ["A"], stepVideoTimestamps: [10] }],
      youtube: { stepTimestampsVideoId: VIDEO_A },
    };
    const next = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_A,
      stamps: [10],
      steps: ["A"],
    });
    const result = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: next,
      featureEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(getStepTimestampBindingState(result.values), "active");
  });

  it("last timestamp removal clears binding", () => {
    const previous = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_A,
      stamps: [null, 102, null],
    });
    const next = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_A,
      stamps: null,
    });
    // explicit no stamps
    delete (next.instructions as Record<string, unknown>[])[0]!.stepVideoTimestamps;
    const result = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: next,
      featureEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(getStepTimestampBindingState(result.values), "none");
    assert.equal(
      (result.values.youtube as { stepTimestampsVideoId?: string }).stepTimestampsVideoId,
      undefined,
    );
  });

  it("gate OFF preserves prior timestamps and ignores clear/reconfirm intents", () => {
    const previous = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_A,
      stamps: [10, 20, null],
    });
    const next = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_B,
      stamps: [99, null, null],
    });
    const result = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: next,
      intent: "clear",
      featureEnabled: false,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // Gate OFF: co-mutated/client stamps may remain, but binding stays previous.
    assert.equal(
      (result.values.youtube as { stepTimestampsVideoId?: string }).stepTimestampsVideoId,
      VIDEO_A,
    );
    assert.equal(hasStepVideoTimestamps(result.values.instructions), true);
  });

  it("gate OFF strips injected timestamps when previous had none", () => {
    const result = applyStepVideoTimestampsOnSave({
      previousValues: valuesWith({ videoId: VIDEO_A }),
      nextValues: valuesWith({ videoId: VIDEO_A, stamps: [10, null, null] }),
      featureEnabled: false,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(hasStepVideoTimestamps(result.values.instructions), false);
  });

  it("historical recipe no-churn when timestamps unchanged", () => {
    const previous = valuesWith({ videoId: VIDEO_A, startTimestamp: 12 });
    const next = valuesWith({ videoId: VIDEO_A, startTimestamp: 12 });
    const result = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: next,
      featureEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(
      (result.values.instructions as { stepVideoTimestamps?: unknown }[])[0]
        ?.stepVideoTimestamps,
      undefined,
    );
    assert.equal(
      (result.values.youtube as { stepTimestampsVideoId?: string } | undefined)
        ?.stepTimestampsVideoId,
      undefined,
    );
  });
});

describe("Roadmap #10C — editor co-mutation with timestamps", () => {
  it("insert / remove / reorder keep timestamps attached", () => {
    const base = {
      steps: ["A", "B", "C"],
      stepVideoTimestamps: [10, 20, 30],
      stepTimers: [null, 600, null],
    };
    const inserted = withInsertedInstructionStep(base, 1, "X");
    assert.deepEqual(inserted.stepVideoTimestamps, [10, null, 20, 30]);

    const removed = withRemovedInstructionStep(base, 1);
    assert.deepEqual(removed.stepVideoTimestamps, [10, 30]);

    const moved = withMovedInstructionStep(base, 2, 0);
    assert.deepEqual(moved.steps, ["C", "A", "B"]);
    assert.deepEqual(moved.stepVideoTimestamps, [30, 10, 20]);
  });

  it("withStepVideoTimestampSeconds round-trips 0 and clears last", () => {
    let group = withStepVideoTimestampSeconds({ steps: ["A", "B"] }, 0, 0);
    assert.deepEqual(group.stepVideoTimestamps, [0, null]);
    group = withStepVideoTimestampSeconds(group, 0, null);
    assert.equal(group.stepVideoTimestamps, undefined);
  });
});

describe("Roadmap #10C — derived chapters / revision", () => {
  it("enrich preserves #10 fields while updating chapters", () => {
    const values = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_A,
      stamps: [0, 45, null],
      startTimestamp: 10,
    });
    (values.instructions as { chapterLabel?: string }[])[0]!.chapterLabel = "Mix";
    const enriched = enrichRecipeValuesWithDerivedChapters(values);
    assert.deepEqual(
      (enriched.instructions as { stepVideoTimestamps?: number[] }[])[0]?.stepVideoTimestamps,
      [0, 45, null],
    );
    assert.equal(
      (enriched.youtube as { stepTimestampsVideoId?: string }).stepTimestampsVideoId,
      VIDEO_A,
    );
  });

  it("timestamp and binding changes are content-hash significant", () => {
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
    const a = buildRecipeRevisionSnapshot({
      ...base,
      values: valuesWith({ videoId: VIDEO_A, binding: VIDEO_A, stamps: [10, null, null] }),
    });
    const b = buildRecipeRevisionSnapshot({
      ...base,
      values: valuesWith({ videoId: VIDEO_A, binding: VIDEO_A, stamps: [20, null, null] }),
    });
    const c = buildRecipeRevisionSnapshot({
      ...base,
      values: valuesWith({ videoId: VIDEO_A, binding: VIDEO_B, stamps: [10, null, null] }),
    });
    assert.notEqual(hashRecipeRevisionSnapshot(a), hashRecipeRevisionSnapshot(b));
    assert.notEqual(hashRecipeRevisionSnapshot(a), hashRecipeRevisionSnapshot(c));
  });

  it("restore-style mismatch remains dormant", () => {
    const restored = valuesWith({
      videoId: VIDEO_B,
      binding: VIDEO_A,
      stamps: [15, null, null],
    });
    assert.equal(getStepTimestampBindingState(restored), "mismatch");
  });
});

describe("Roadmap #10C — scope / regression contracts", () => {
  it("does not add public Watch-at #10 controls", () => {
    assert.doesNotMatch(read("components/RecipeCard.tsx"), /stepVideoTimestamps/);
    assert.doesNotMatch(read("components/cooking/CookingMode.tsx"), /stepVideoTimestamps/);
  });

  it("saveRecipeAction applies server policy", () => {
    const actions = read("app/admin/actions.ts");
    assert.match(actions, /applyStepVideoTimestampsOnSave/);
    assert.match(actions, /stepTimestampsIntent/);
    assert.match(actions, /isRecipeStepTimestampsEnabled/);
  });

  it("normalizeInstructionGroups still preserves historical absence", () => {
    const groups = normalizeInstructionGroups([{ name: "Mix", steps: ["A", "B"] }]);
    assert.equal(groups[0]!.stepVideoTimestamps, undefined);
  });

  it("clearStepVideoTimestamps does not touch section chapters", () => {
    const cleared = clearStepVideoTimestamps(
      valuesWith({
        videoId: VIDEO_A,
        binding: VIDEO_A,
        stamps: [1, 2, 3],
        startTimestamp: 9,
      }),
    );
    assert.equal(
      (cleared.instructions as { startTimestamp?: number }[])[0]?.startTimestamp,
      9,
    );
  });
});
