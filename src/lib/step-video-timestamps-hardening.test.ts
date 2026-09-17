import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { Recipe } from "../data/types.ts";
import { buildCookingNavModel } from "./cooking-nav.ts";
import { cookingContentVersion } from "./cooking-session.ts";
import { recipeInstructionStages } from "./recipe-instructions.ts";
import {
  buildRecipeRevisionSnapshot,
  hashRecipeRevisionSnapshot,
} from "./recipe-revisions.ts";
import {
  applyStepVideoTimestampsOnSave,
  clearStepVideoTimestamps,
  getStepTimestampBindingState,
  isPublicStepVideoTimestampsEligible,
  normalizeStepVideoTimestampSeconds,
  withMovedInstructionStep,
  withStepTimestampsVideoBinding,
} from "./step-video-timestamps.ts";
import { resolveVideoAnalyticsTimestamp } from "./video-analytics.ts";
import { youtubeEmbedUrl, youtubeWatchUrlAt } from "./youtube.ts";
import { formatTimestampInput } from "./youtube-metadata-editor.ts";
import { formatVideoTimestampAccessible } from "./step-video-timestamps.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");
const repoRoot = path.join(srcRoot, "..");

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
  stepTimers?: Array<number | null>;
}) {
  const steps = input.steps ?? ["A", "B", "C", "D"];
  const group: Record<string, unknown> = { name: "Mix", steps };
  if (input.stamps) group.stepVideoTimestamps = input.stamps;
  if (input.startTimestamp != null) group.startTimestamp = input.startTimestamp;
  if (input.stepTimers) group.stepTimers = input.stepTimers;
  const youtube: Record<string, unknown> = {};
  if (input.videoId) youtube.videoId = input.videoId;
  if (input.binding) youtube.stepTimestampsVideoId = input.binding;
  const values: Record<string, unknown> = { instructions: [group] };
  if (Object.keys(youtube).length) values.youtube = youtube;
  if (input.youtubeUrl) values.youtubeUrl = input.youtubeUrl;
  return values;
}

function recipeFromValues(values: Record<string, unknown>): Recipe {
  return {
    slug: "10f-harden",
    title: "10F Harden",
    excerpt: "",
    intro: "",
    whyItWorks: "",
    keyIngredients: [],
    tips: [],
    faqs: [],
    image: "/x.jpg",
    imageAlt: "x",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-02",
    prepMinutes: 1,
    cookMinutes: 1,
    servings: 4,
    servingsUnit: "servings",
    course: "Bread",
    method: "Bake",
    cuisine: "French",
    categories: ["bread"],
    tags: [],
    ingredients: [{ items: [{ item: "Flour", amount: "1 cup" }] }],
    instructions: (values.instructions as Recipe["instructions"]) ?? [],
    notes: [],
    nutrition: { calories: 1, carbs: 1, protein: 1, fat: 1 },
    youtubeUrl: values.youtubeUrl as string | undefined,
    youtube: values.youtube as Recipe["youtube"],
  };
}

describe("Roadmap #10F — 0-second analytics hardening", () => {
  it("resolveVideoAnalyticsTimestamp preserves 0 and omits absent", () => {
    assert.equal(resolveVideoAnalyticsTimestamp(0), 0);
    assert.equal(resolveVideoAnalyticsTimestamp(65), 65);
    assert.equal(resolveVideoAnalyticsTimestamp(undefined), undefined);
    assert.equal(resolveVideoAnalyticsTimestamp(null), undefined);
  });

  it("RecipeVideoContext uses nullish-safe helper (not ||)", () => {
    const ctx = read("components/youtube/RecipeVideoContext.tsx");
    assert.match(ctx, /resolveVideoAnalyticsTimestamp\(options\?\.start\)/);
    assert.doesNotMatch(ctx, /options\?\.start\s*\|\|\s*undefined/);
    assert.doesNotMatch(ctx, /timestamp:\s*start\s*\|\|\s*undefined/);
  });

  it("youtubeWatchUrlAt and embed start preserve 0", () => {
    assert.equal(
      youtubeWatchUrlAt(VIDEO_A, 0),
      `https://www.youtube.com/watch?v=${VIDEO_A}&t=0`,
    );
    const embed = youtubeEmbedUrl(VIDEO_A, { start: 0 });
    assert.ok(embed);
    assert.match(embed!, /[?&]start=0(?:&|$)/);
  });
});

describe("Roadmap #10F — lifecycle certification contracts", () => {
  it("first author → replace → reconfirm → clear", () => {
    const previous = valuesWith({ videoId: VIDEO_A });
    const first = applyStepVideoTimestampsOnSave({
      previous,
      nextValues: valuesWith({
        videoId: VIDEO_A,
        stamps: [0, null, 65, null],
      }),
      intent: "",
      featureEnabled: true,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(getStepTimestampBindingState(first.values), "active");
    assert.equal(
      (first.values.youtube as { stepTimestampsVideoId?: string }).stepTimestampsVideoId,
      VIDEO_A,
    );

    const replaced = applyStepVideoTimestampsOnSave({
      previousValues: first.values,
      nextValues: {
        ...first.values,
        youtube: { videoId: VIDEO_B, stepTimestampsVideoId: VIDEO_A },
        youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_B}`,
      },
      intent: "",
      featureEnabled: true,
    });
    assert.equal(replaced.ok, true);
    if (!replaced.ok) return;
    assert.equal(getStepTimestampBindingState(replaced.values), "mismatch");
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: replaced.values.instructions,
        youtube: replaced.values.youtube,
        youtubeUrl: replaced.values.youtubeUrl as string,
      }),
      false,
    );

    const reconfirmed = applyStepVideoTimestampsOnSave({
      previousValues: replaced.values,
      nextValues: replaced.values,
      intent: "reconfirm",
      featureEnabled: true,
    });
    assert.equal(reconfirmed.ok, true);
    if (!reconfirmed.ok) return;
    assert.equal(getStepTimestampBindingState(reconfirmed.values), "active");
    assert.equal(
      (reconfirmed.values.youtube as { stepTimestampsVideoId?: string }).stepTimestampsVideoId,
      VIDEO_B,
    );

    const cleared = applyStepVideoTimestampsOnSave({
      previousValues: reconfirmed.values,
      nextValues: reconfirmed.values,
      intent: "clear",
      featureEnabled: true,
    });
    assert.equal(cleared.ok, true);
    if (!cleared.ok) return;
    assert.equal(getStepTimestampBindingState(cleared.values), "none");
    assert.equal(
      (cleared.values.youtube as { stepTimestampsVideoId?: string } | undefined)
        ?.stepTimestampsVideoId,
      undefined,
    );
  });

  it("same-video URL formatting change stays active without reconfirm", () => {
    const previous = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_A,
      stamps: [0, null, 65, null],
      steps: ["A", "B", "C", "D"],
      youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_A}`,
    });
    const next = {
      ...previous,
      youtubeUrl: `https://youtu.be/${VIDEO_A}`,
      youtube: { videoId: VIDEO_A, stepTimestampsVideoId: VIDEO_A },
    };
    const result = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: next,
      intent: "",
      featureEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(getStepTimestampBindingState(result.values), "active");
  });

  it("video removal retains dormant binding; restore ABC active; restore XYZ mismatch", () => {
    const active = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_A,
      stamps: [0, null, 65, null],
      steps: ["A", "B", "C", "D"],
    });
    // Normalize via a no-op save so fingerprints align.
    const seeded = applyStepVideoTimestampsOnSave({
      previousValues: active,
      nextValues: active,
      featureEnabled: true,
    });
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    assert.equal(getStepTimestampBindingState(seeded.values), "active");

    const removed = applyStepVideoTimestampsOnSave({
      previousValues: seeded.values,
      nextValues: {
        instructions: seeded.values.instructions,
        youtube: { stepTimestampsVideoId: VIDEO_A },
      },
      intent: "",
      featureEnabled: true,
    });
    assert.equal(removed.ok, true);
    if (!removed.ok) return;
    assert.equal(getStepTimestampBindingState(removed.values), "missing_video");

    const restoreAbc = applyStepVideoTimestampsOnSave({
      previousValues: removed.values,
      nextValues: {
        ...removed.values,
        youtube: { videoId: VIDEO_A, stepTimestampsVideoId: VIDEO_A },
        youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_A}`,
      },
      intent: "",
      featureEnabled: true,
    });
    assert.equal(restoreAbc.ok, true);
    if (!restoreAbc.ok) return;
    assert.equal(getStepTimestampBindingState(restoreAbc.values), "active");

    const restoreXyz = applyStepVideoTimestampsOnSave({
      previousValues: removed.values,
      nextValues: {
        ...removed.values,
        youtube: { videoId: VIDEO_B, stepTimestampsVideoId: VIDEO_A },
        youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_B}`,
      },
      intent: "",
      featureEnabled: true,
    });
    assert.equal(restoreXyz.ok, true);
    if (!restoreXyz.ok) return;
    assert.equal(getStepTimestampBindingState(restoreXyz.values), "mismatch");
  });

  it("last timestamp blank clears binding and all-null arrays", () => {
    const previous = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_A,
      stamps: [null, 102, null],
      steps: ["A", "B", "C"],
    });
    const next = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_A,
      steps: ["A", "B", "C"],
    });
    delete (next.instructions as Record<string, unknown>[])[0]!.stepVideoTimestamps;
    const result = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: next,
      intent: "",
      featureEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(getStepTimestampBindingState(result.values), "none");
    assert.equal(
      (result.values.instructions as { stepVideoTimestamps?: unknown }[])[0]
        ?.stepVideoTimestamps,
      undefined,
    );
  });

  it("gate OFF preserves stored data and ignores clear/reconfirm intents", () => {
    const previous = valuesWith({
      videoId: VIDEO_A,
      binding: VIDEO_A,
      stamps: [0, null, 65, null],
      steps: ["A", "B", "C", "D"],
    });
    const clearedIntent = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: previous,
      intent: "clear",
      featureEnabled: false,
    });
    assert.equal(clearedIntent.ok, true);
    if (!clearedIntent.ok) return;
    assert.equal(getStepTimestampBindingState(clearedIntent.values), "active");

    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: false,
        instructions: previous.instructions,
        youtube: previous.youtube,
        youtubeUrl: previous.youtubeUrl as string,
      }),
      false,
    );
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: previous.instructions,
        youtube: previous.youtube,
        youtubeUrl: previous.youtubeUrl as string,
      }),
      true,
    );
  });

  it("historical recipe no-churn when timestamps unchanged", () => {
    const historical = valuesWith({ videoId: VIDEO_A, steps: ["A", "B"] });
    const result = applyStepVideoTimestampsOnSave({
      previousValues: historical,
      nextValues: historical,
      intent: "",
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
      (result.values.youtube as { stepTimestampsVideoId?: string }).stepTimestampsVideoId,
      undefined,
    );
  });
});

describe("Roadmap #10F — revision restore mismatch safety", () => {
  it("snapshot hash changes for timestamp/binding edits; restore-style mismatch stays dormant", () => {
    const active = {
      title: "T",
      slug: "s",
      excerpt: "",
      status: "published",
      featured: false,
      seasonal: false,
      typeId: null,
      categoryIds: [] as string[],
      values: valuesWith({
        videoId: VIDEO_A,
        binding: VIDEO_A,
        stamps: [0, null, 65],
      }),
      publicUpdateNote: null,
      publicUpdatedAt: null,
    };
    const snapA = buildRecipeRevisionSnapshot(active);
    const hashA = hashRecipeRevisionSnapshot(snapA);

    const edited = {
      ...active,
      values: valuesWith({
        videoId: VIDEO_A,
        binding: VIDEO_A,
        stamps: [0, null, 102],
      }),
    };
    assert.notEqual(hashRecipeRevisionSnapshot(buildRecipeRevisionSnapshot(edited)), hashA);

    const restoredMismatchValues = valuesWith({
      videoId: VIDEO_B,
      binding: VIDEO_A,
      stamps: [0, null, 65],
      youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_B}`,
    });
    assert.equal(getStepTimestampBindingState(restoredMismatchValues), "mismatch");
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: restoredMismatchValues.instructions,
        youtube: restoredMismatchValues.youtube,
        youtubeUrl: restoredMismatchValues.youtubeUrl as string,
      }),
      false,
    );
  });
});

describe("Roadmap #10F — public/cook parity + content version", () => {
  it("public stages and cooking nav resolve the same semantic timestamps", () => {
    const recipe = recipeFromValues(
      valuesWith({
        videoId: VIDEO_A,
        binding: VIDEO_A,
        stamps: [0, null, 65, 3725],
        steps: ["A", "B", "C", "D"],
        stepTimers: [null, 600, null, null],
      }),
    );
    const stages = recipeInstructionStages(recipe);
    const nav = buildCookingNavModel(recipe);
    assert.equal(stages[0]!.steps.length, nav.steps.length);
    for (let i = 0; i < nav.steps.length; i += 1) {
      assert.equal(stages[0]!.steps[i]!.videoTimestampSeconds, nav.steps[i]!.videoTimestampSeconds);
      assert.equal(stages[0]!.steps[i]!.text, nav.steps[i]!.text);
    }
    assert.equal(formatTimestampInput(0), "00:00");
    assert.equal(formatTimestampInput(65), "01:05");
    assert.equal(formatTimestampInput(3725), "1:02:05");
    assert.equal(formatVideoTimestampAccessible(65), "1 minute 5 seconds");
  });

  it("timestamp-only edits do not change cookingContentVersion; step text edits do", () => {
    const base = recipeFromValues(
      valuesWith({
        videoId: VIDEO_A,
        binding: VIDEO_A,
        stamps: [0, null, 65],
        steps: ["A", "B", "C"],
        stepTimers: [null, 600, null],
      }),
    );
    const tsOnly = recipeFromValues(
      valuesWith({
        videoId: VIDEO_A,
        binding: VIDEO_A,
        stamps: [0, null, 999],
        steps: ["A", "B", "C"],
        stepTimers: [null, 600, null],
      }),
    );
    const textEdit = recipeFromValues(
      valuesWith({
        videoId: VIDEO_A,
        binding: VIDEO_A,
        stamps: [0, null, 65],
        steps: ["A changed", "B", "C"],
        stepTimers: [null, 600, null],
      }),
    );
    assert.equal(cookingContentVersion(base), cookingContentVersion(tsOnly));
    assert.notEqual(cookingContentVersion(base), cookingContentVersion(textEdit));
  });

  it("reorder co-moves timestamps with semantic steps for public and cook", () => {
    const group = {
      name: "Mix",
      steps: ["A", "B", "C"],
      stepVideoTimestamps: [10, 20, 30] as Array<number | null>,
    };
    const moved = withMovedInstructionStep(group, 0, 2);
    const recipe = recipeFromValues({
      instructions: [moved],
      youtube: { videoId: VIDEO_A, stepTimestampsVideoId: VIDEO_A },
      youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_A}`,
    });
    const nav = buildCookingNavModel(recipe);
    assert.deepEqual(
      nav.steps.map((s) => [s.text, s.videoTimestampSeconds]),
      [
        ["B", 20],
        ["C", 30],
        ["A", 10],
      ],
    );
  });
});

describe("Roadmap #10F — security / failure isolation / revalidation", () => {
  it("rejects mutation during mismatch; client binding writes are ignored", () => {
    const previous = valuesWith({
      videoId: VIDEO_B,
      binding: VIDEO_A,
      stamps: [10, null, 20, null],
      steps: ["A", "B", "C", "D"],
    });
    const mutated = applyStepVideoTimestampsOnSave({
      previousValues: previous,
      nextValues: valuesWith({
        videoId: VIDEO_B,
        binding: VIDEO_A,
        stamps: [99, null, 20, null],
        steps: ["A", "B", "C", "D"],
      }),
      intent: "",
      featureEnabled: true,
    });
    assert.equal(mutated.ok, false);

    const tamperedBinding = applyStepVideoTimestampsOnSave({
      previousValues: valuesWith({
        videoId: VIDEO_A,
        binding: VIDEO_A,
        stamps: [10, null, null, null],
        steps: ["A", "B", "C", "D"],
      }),
      nextValues: valuesWith({
        videoId: VIDEO_A,
        binding: VIDEO_B,
        stamps: [10, null, null, null],
        steps: ["A", "B", "C", "D"],
      }),
      intent: "",
      featureEnabled: true,
    });
    assert.equal(tamperedBinding.ok, true);
    if (!tamperedBinding.ok) return;
    assert.equal(
      (tamperedBinding.values.youtube as { stepTimestampsVideoId?: string })
        .stepTimestampsVideoId,
      VIDEO_A,
    );
    assert.equal(getStepTimestampBindingState(tamperedBinding.values), "active");
  });

  it("malformed timestamps never become presentation seconds", () => {
    assert.equal(normalizeStepVideoTimestampSeconds(-1), null);
    assert.equal(normalizeStepVideoTimestampSeconds(1.5), null);
    assert.equal(normalizeStepVideoTimestampSeconds(999999), null);
    assert.equal(normalizeStepVideoTimestampSeconds({}), null);
    assert.equal(normalizeStepVideoTimestampSeconds(0), 0);
  });

  it("fallback href never accepts malformed id; 0 remains explicit", () => {
    assert.equal(youtubeWatchUrlAt("bad", 10), null);
    assert.equal(youtubeWatchUrlAt(VIDEO_A, 0)?.includes("t=0"), true);
  });

  it("clear preserves section chapters and stepTimers", () => {
    const cleared = clearStepVideoTimestamps(
      valuesWith({
        videoId: VIDEO_A,
        binding: VIDEO_A,
        stamps: [1, 2, 3],
        startTimestamp: 9,
        stepTimers: [null, 600, null],
      }),
    );
    assert.equal(
      (cleared.instructions as { startTimestamp?: number }[])[0]!.startTimestamp,
      9,
    );
    assert.deepEqual(
      (cleared.instructions as { stepTimers?: unknown }[])[0]!.stepTimers,
      [null, 600, null],
    );
  });

  it("saveRecipeAction revalidates recipe + cook (+ previous slug cook)", () => {
    const actions = read("app/admin/actions.ts");
    assert.match(actions, /revalidatePath\(`\/recipes\/\$\{slug\}`\)/);
    assert.match(actions, /revalidatePath\(`\/recipes\/\$\{slug\}\/cook`\)/);
    assert.match(actions, /revalidatePath\(`\/recipes\/\$\{previousSlug\}\/cook`\)/);
  });

  it("no Prisma schema / NEXT_PUBLIC / player API in #10 surfaces", () => {
    const schema = readFileSync(path.join(repoRoot, "prisma", "schema.prisma"), "utf8");
    assert.doesNotMatch(schema, /stepVideoTimestamps|stepTimestampsVideoId/);
    assert.doesNotMatch(read("lib/flags.ts"), /NEXT_PUBLIC_RECIPE_STEP/);
    assert.doesNotMatch(
      read("components/youtube/RecipeStepVideoTimestampLink.tsx"),
      /YT\.Player|querySelector\(|postMessage/,
    );
  });

  it("no new #10 analytics event names", () => {
    assert.doesNotMatch(read("lib/analytics.ts"), /recipe_step_video_timestamp|step_timestamp_click/);
    assert.match(read("lib/video-analytics.ts"), /resolveVideoAnalyticsTimestamp/);
  });
});

describe("Roadmap #10F — withStepTimestampsVideoBinding pure helper", () => {
  it("sets and clears binding without inventing timestamps", () => {
    const bound = withStepTimestampsVideoBinding(
      valuesWith({ videoId: VIDEO_A, stamps: [10] }),
      VIDEO_A,
    );
    assert.equal(
      (bound.youtube as { stepTimestampsVideoId?: string }).stepTimestampsVideoId,
      VIDEO_A,
    );
    const cleared = withStepTimestampsVideoBinding(bound, null);
    assert.equal(
      (cleared.youtube as { stepTimestampsVideoId?: string } | undefined)
        ?.stepTimestampsVideoId,
      undefined,
    );
  });
});
