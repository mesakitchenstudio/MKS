import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { Recipe } from "../data/types.ts";
import { isRecipeStepTimestampsEnabled } from "./flags.ts";
import { recipeInstructionStages } from "./recipe-instructions.ts";
import { timestampForStep } from "./recipe-youtube.ts";
import { recipeJsonLd } from "./schema.ts";
import {
  formatVideoTimestampAccessible,
  isPublicStepVideoTimestampsEligible,
  normalizeStepVideoTimestampSeconds,
} from "./step-video-timestamps.ts";
import { formatTimestampInput } from "./youtube-metadata-editor.ts";
import { youtubeWatchUrlAt } from "./youtube.ts";
import { isModifiedLinkActivation } from "../components/youtube/RecipeStepVideoTimestampLink.tsx";
import { RecipeStepVideoTimestampLink } from "../components/youtube/RecipeStepVideoTimestampLink.tsx";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

const VIDEO_A = "abcdefghijk";
const VIDEO_B = "zyxwvutsrqp";

function baseRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    slug: "public-ts-fixture",
    title: "Public Timestamp Fixture",
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
    prepMinutes: 10,
    cookMinutes: 20,
    servings: 4,
    servingsUnit: "servings",
    course: "Bread",
    method: "Bake",
    cuisine: "French",
    categories: ["bread"],
    tags: [],
    ingredients: [{ items: [{ item: "Flour", amount: "1 cup" }] }],
    instructions: [
      {
        name: "Mix",
        steps: ["Combine dry", "Add water", "Knead until smooth"],
        stepVideoTimestamps: [0, null, 102],
      },
    ],
    notes: [],
    nutrition: { calories: 1, carbs: 1, protein: 1, fat: 1 },
    youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_A}`,
    youtube: {
      videoId: VIDEO_A,
      stepTimestampsVideoId: VIDEO_A,
      timestamps: [{ time: 45, label: "Legacy knead", stepIndex: 2 }],
    },
    ...overrides,
  };
}

describe("Roadmap #10D — feature gate wiring", () => {
  it("public + preview pages pass server-derived isRecipeStepTimestampsEnabled", () => {
    const page = read("app/recipes/[slug]/page.tsx");
    const preview = read("app/admin/(preview)/recipes/[id]/preview/page.tsx");
    const detail = read("components/recipe/RecipeDetailView.tsx");
    const card = read("components/RecipeCard.tsx");
    assert.match(page, /stepTimestampsEnabled=\{isRecipeStepTimestampsEnabled\(\)\}/);
    assert.match(preview, /stepTimestampsEnabled=\{isRecipeStepTimestampsEnabled\(\)\}/);
    assert.match(detail, /stepTimestampsEnabled/);
    assert.match(card, /stepTimestampsEnabled/);
    assert.match(card, /isPublicStepVideoTimestampsEligible/);
    assert.doesNotMatch(page, /NEXT_PUBLIC_RECIPE_STEP_TIMESTAMPS/);
    assert.doesNotMatch(preview, /NEXT_PUBLIC_RECIPE_STEP_TIMESTAMPS/);
  });

  it("gate OFF keeps eligibility false even with active mapping", () => {
    const recipe = baseRecipe();
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: false,
        instructions: recipe.instructions,
        youtube: recipe.youtube,
        youtubeUrl: recipe.youtubeUrl,
      }),
      false,
    );
  });
});

describe("Roadmap #10D — eligibility matrix", () => {
  it("only active binding with gate ON is eligible", () => {
    const active = baseRecipe();
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: active.instructions,
        youtube: active.youtube,
        youtubeUrl: active.youtubeUrl,
      }),
      true,
    );

    const unbound = baseRecipe({
      youtube: { videoId: VIDEO_A },
    });
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: unbound.instructions,
        youtube: unbound.youtube,
        youtubeUrl: unbound.youtubeUrl,
      }),
      false,
    );

    const mismatch = baseRecipe({
      youtube: { videoId: VIDEO_B, stepTimestampsVideoId: VIDEO_A },
      youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_B}`,
    });
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: mismatch.instructions,
        youtube: mismatch.youtube,
        youtubeUrl: mismatch.youtubeUrl,
      }),
      false,
    );

    const missingVideo = baseRecipe({
      youtubeUrl: undefined,
      youtube: { stepTimestampsVideoId: VIDEO_A },
    });
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: missingVideo.instructions,
        youtube: missingVideo.youtube,
        youtubeUrl: missingVideo.youtubeUrl,
      }),
      false,
    );

    const none = baseRecipe({
      instructions: [{ name: "Mix", steps: ["A", "B", "C"] }],
    });
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: none.instructions,
        youtube: none.youtube,
        youtubeUrl: none.youtubeUrl,
      }),
      false,
    );
  });
});

describe("Roadmap #10D — presentation mapping carries co-located timestamps", () => {
  it("recipeInstructionStages preserves 0 and partial coverage without global-index rebuild", () => {
    const stages = recipeInstructionStages(baseRecipe());
    assert.equal(stages[0]!.steps.length, 3);
    assert.equal(stages[0]!.steps[0]!.videoTimestampSeconds, 0);
    assert.equal(stages[0]!.steps[1]!.videoTimestampSeconds, undefined);
    assert.equal(stages[0]!.steps[2]!.videoTimestampSeconds, 102);
  });

  it("malformed timestamps omit control data without dropping instruction text", () => {
    const recipe = baseRecipe({
      instructions: [
        {
          name: "Mix",
          steps: ["Keep me", "Also keep"],
          stepVideoTimestamps: [-1, 1.5, 999999999, "nope" as unknown as number],
        },
      ],
    });
    const stages = recipeInstructionStages(recipe);
    assert.equal(stages[0]!.steps[0]!.text, "Keep me");
    assert.equal(stages[0]!.steps[0]!.videoTimestampSeconds, undefined);
    assert.equal(stages[0]!.steps[1]!.text, "Also keep");
    assert.equal(stages[0]!.steps[1]!.videoTimestampSeconds, undefined);
  });

  it("normalizeStepVideoTimestampSeconds rejects invalid persisted values", () => {
    assert.equal(normalizeStepVideoTimestampSeconds(-1), null);
    assert.equal(normalizeStepVideoTimestampSeconds(1.5), null);
    assert.equal(normalizeStepVideoTimestampSeconds(Number.NaN), null);
    assert.equal(normalizeStepVideoTimestampSeconds(true), null);
    assert.equal(normalizeStepVideoTimestampSeconds({}), null);
    assert.equal(normalizeStepVideoTimestampSeconds(0), 0);
  });
});

describe("Roadmap #10D — fallback URL + 0-second", () => {
  it("youtubeWatchUrlAt preserves explicit 0 and positive timestamps", () => {
    assert.equal(
      youtubeWatchUrlAt(VIDEO_A, 0),
      `https://www.youtube.com/watch?v=${VIDEO_A}&t=0`,
    );
    assert.equal(
      youtubeWatchUrlAt(VIDEO_A, 5),
      `https://www.youtube.com/watch?v=${VIDEO_A}&t=5`,
    );
    assert.equal(
      youtubeWatchUrlAt(VIDEO_A, 65),
      `https://www.youtube.com/watch?v=${VIDEO_A}&t=65`,
    );
    assert.equal(
      youtubeWatchUrlAt(VIDEO_A, 3725),
      `https://www.youtube.com/watch?v=${VIDEO_A}&t=3725`,
    );
  });

  it("rejects negative seconds and malformed ids", () => {
    assert.equal(youtubeWatchUrlAt(VIDEO_A, -1), `https://www.youtube.com/watch?v=${VIDEO_A}`);
    assert.equal(youtubeWatchUrlAt("not-a-valid-id", 10), null);
  });
});

describe("Roadmap #10D — timestamp formatters", () => {
  it("visible clock formatter covers required spans", () => {
    assert.equal(formatTimestampInput(0), "00:00");
    assert.equal(formatTimestampInput(5), "00:05");
    assert.equal(formatTimestampInput(65), "01:05");
    assert.equal(formatTimestampInput(3599), "59:59");
    assert.equal(formatTimestampInput(3600), "1:00:00");
    assert.equal(formatTimestampInput(3725), "1:02:05");
  });

  it("accessible formatter uses correct singular/plural", () => {
    assert.equal(formatVideoTimestampAccessible(0), "0 seconds");
    assert.equal(formatVideoTimestampAccessible(1), "1 second");
    assert.equal(formatVideoTimestampAccessible(59), "59 seconds");
    assert.equal(formatVideoTimestampAccessible(60), "1 minute");
    assert.equal(formatVideoTimestampAccessible(61), "1 minute 1 second");
    assert.equal(formatVideoTimestampAccessible(65), "1 minute 5 seconds");
    assert.equal(formatVideoTimestampAccessible(3600), "1 hour");
    assert.equal(formatVideoTimestampAccessible(3725), "1 hour 2 minutes 5 seconds");
    assert.doesNotMatch(formatVideoTimestampAccessible(60), /1 minutes/);
    assert.doesNotMatch(formatVideoTimestampAccessible(3600), /1 hours/);
  });
});

describe("Roadmap #10D — progressive link component", () => {
  it("renders real anchor with Watch label, href, aria, and no-print", () => {
    const html = renderToStaticMarkup(
      createElement(RecipeStepVideoTimestampLink, {
        seconds: 0,
        videoId: VIDEO_A,
        stepNumber: 1,
      }),
    );
    assert.match(html, /<a /);
    assert.match(html, /Watch at 00:00/);
    assert.match(html, new RegExp(`href="https://www.youtube.com/watch\\?v=${VIDEO_A}&amp;t=0"`));
    assert.match(html, /aria-label="Watch step 1 in the video at 0 seconds"/);
    assert.match(html, /no-print/);
    assert.match(html, /data-testid="recipe-step-video-timestamp"/);
    assert.doesNotMatch(html, /target="_blank"/);
  });

  it("renders 102s as Watch at 01:42", () => {
    const html = renderToStaticMarkup(
      createElement(RecipeStepVideoTimestampLink, {
        seconds: 102,
        videoId: VIDEO_A,
        stepNumber: 3,
      }),
    );
    assert.match(html, /Watch at 01:42/);
    assert.match(html, /1 minute 42 seconds/);
  });

  it("modifier activations are not intercepted", () => {
    assert.equal(
      isModifiedLinkActivation({
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        button: 0,
      }),
      true,
    );
    assert.equal(
      isModifiedLinkActivation({
        metaKey: false,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        button: 0,
      }),
      true,
    );
    assert.equal(
      isModifiedLinkActivation({
        metaKey: false,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
        button: 0,
      }),
      true,
    );
    assert.equal(
      isModifiedLinkActivation({
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: true,
        button: 0,
      }),
      true,
    );
    assert.equal(
      isModifiedLinkActivation({
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        button: 1,
      }),
      true,
    );
    assert.equal(
      isModifiedLinkActivation({
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        button: 0,
      }),
      false,
    );
  });

  it("source contracts: preventDefault + expandWatchMethod + bridge failure fallback", () => {
    const src = read("components/youtube/RecipeStepVideoTimestampLink.tsx");
    assert.match(src, /isModifiedLinkActivation/);
    assert.match(src, /preventDefault/);
    assert.match(src, /expandWatchMethod\(\{\s*start:\s*seconds/);
    assert.match(src, /scroll(?:=\s*true)?/);
    assert.match(src, /catch\s*\{[\s\S]*location\.assign\(href\)/);
    assert.match(src, /if\s*\(!ctx\)\s*return/);
    assert.match(src, /recipe_video_timestamp_click/);
    assert.doesNotMatch(src, /recipe_step_timestamp_click|step_video_timestamp_click/);
    assert.doesNotMatch(src, /document\.querySelector/);
    assert.doesNotMatch(src, /YT\.Player|postMessage/);
  });
});

describe("Roadmap #10D — public RecipeCard precedence + stage help", () => {
  it("uses RecipeStepVideoTimestampLink for #10 and keeps legacy VideoTimestampLink fallback", () => {
    const card = read("components/RecipeCard.tsx");
    assert.match(card, /RecipeStepVideoTimestampLink/);
    assert.match(card, /VideoTimestampLink/);
    assert.match(card, /stepTimestampsEligible/);
    assert.match(card, /videoTimestampSeconds\s*!=\s*null/);
    assert.match(card, /timestampForStep/);
    assert.match(card, /StageVideoHelpLink/);
    // #10 storage key must not be rebuilt from global index in the public card.
    assert.doesNotMatch(card, /stepVideoTimestamps/);
  });

  it("#10 takes precedence over legacy stepIndex for the same step; only one control path", () => {
    const recipe = baseRecipe();
    const stages = recipeInstructionStages(recipe);
    const step = stages[0]!.steps[2]!;
    assert.equal(step.videoTimestampSeconds, 102);
    assert.equal(timestampForStep(recipe.youtube?.timestamps, step.globalIndex)?.time, 45);
    const card = read("components/RecipeCard.tsx");
    // Precedence: #10 branch before legacyTs.
    const tenIdx = card.indexOf("stepTs10");
    const legacyIdx = card.indexOf("legacyTs");
    assert.ok(tenIdx > 0 && legacyIdx > tenIdx);
    assert.match(card, /stepTs10\s*==\s*null\s*&&\s*youtube/);
  });

  it("StageVideoHelpLink remains independent of #10 gate", () => {
    const card = read("components/RecipeCard.tsx");
    assert.match(card, /StageVideoHelpLink/);
    assert.match(
      card,
      /function renderVideoHelp\(\) \{\s*\n\s*if \(!videoHelp \|\| !youtube\) return null;/,
    );
    // renderVideoHelp itself never consults stepTimestampsEligible.
    const helpFn = card.slice(
      card.indexOf("function renderVideoHelp"),
      card.indexOf("return (", card.indexOf("function renderVideoHelp")),
    );
    assert.doesNotMatch(helpFn, /stepTimestampsEligible/);
  });
});

describe("Roadmap #10D — Cooking Mode boundary (pre-10E contract retained for storage key)", () => {
  it("does not persist stepVideoTimestamps into cooking session storage keys", () => {
    const cook = read("components/cooking/CookingMode.tsx");
    const session = read("lib/cooking-session.ts");
    assert.doesNotMatch(cook, /stepVideoTimestamps/);
    assert.doesNotMatch(session, /stepVideoTimestamps|videoTimestampSeconds/);
  });

  it("legacy VideoTimestampLink remains a button (unchanged Cooking Mode contract)", () => {
    const link = read("components/youtube/VideoTimestampLink.tsx");
    assert.match(link, /<button/);
    assert.match(link, /expandWatchMethod/);
    assert.match(link, /recipe_video_timestamp_click/);
  });
});

describe("Roadmap #10D — revalidation", () => {
  it("saveRecipeAction revalidates recipe + cook paths including previous slug", () => {
    const actions = read("app/admin/actions.ts");
    assert.match(actions, /revalidatePath\(`\/recipes\/\$\{slug\}`\)/);
    assert.match(actions, /revalidatePath\(`\/recipes\/\$\{slug\}\/cook`\)/);
    assert.match(actions, /revalidatePath\(`\/recipes\/\$\{previousSlug\}`\)/);
    assert.match(actions, /revalidatePath\(`\/recipes\/\$\{previousSlug\}\/cook`\)/);
  });
});

describe("Roadmap #10D — SEO / structured data / search / analytics scope", () => {
  it("does not alter recipeJsonLd HowToStep with timestamp offsets", () => {
    const recipe = baseRecipe();
    const ld = JSON.stringify(recipeJsonLd(recipe));
    assert.doesNotMatch(ld, /"startOffset"|Watch at|stepVideoTimestamps/);
    const schema = read("lib/schema.ts");
    assert.doesNotMatch(schema, /stepVideoTimestamps|videoTimestampSeconds/);
  });

  it("search / CWYW / sitemap sources do not reference #10 timestamps", () => {
    assert.doesNotMatch(read("lib/cook-with-what-you-have.ts"), /stepVideoTimestamps/);
    assert.doesNotMatch(read("lib/sitemap-entries.ts"), /stepVideoTimestamps/);
    assert.doesNotMatch(read("app/sitemap.ts"), /stepVideoTimestamps/);
  });

  it("no new #10 analytics event name", () => {
    const analytics = read("lib/analytics.ts");
    const video = read("lib/video-analytics.ts");
    assert.match(analytics, /recipe_video_timestamp_click/);
    assert.match(video, /recipe_video_timestamp_click/);
    assert.doesNotMatch(analytics, /recipe_step_video_timestamp|step_timestamp_click/);
    assert.doesNotMatch(video, /recipe_step_video_timestamp|step_timestamp_click/);
  });
});

describe("Roadmap #10D — print + privacy + player API", () => {
  it("print sheet does not render Watch-at controls", () => {
    const print = read("components/RecipePrintSheet.tsx");
    assert.doesNotMatch(print, /RecipeStepVideoTimestampLink|Watch at/);
  });

  it("does not introduce YouTube IFrame API dependency for #10", () => {
    const link = read("components/youtube/RecipeStepVideoTimestampLink.tsx");
    assert.doesNotMatch(link, /iframe_api|YT\.Player|enablejsapi/);
    const card = read("components/RecipeCard.tsx");
    assert.doesNotMatch(card, /iframe_api|YT\.Player/);
  });

  it("gate helper remains exact lowercase true", () => {
    const prev = process.env.RECIPE_STEP_TIMESTAMPS_ENABLED;
    try {
      process.env.RECIPE_STEP_TIMESTAMPS_ENABLED = "true";
      assert.equal(isRecipeStepTimestampsEnabled(), true);
      process.env.RECIPE_STEP_TIMESTAMPS_ENABLED = "TRUE";
      assert.equal(isRecipeStepTimestampsEnabled(), false);
    } finally {
      if (prev === undefined) delete process.env.RECIPE_STEP_TIMESTAMPS_ENABLED;
      else process.env.RECIPE_STEP_TIMESTAMPS_ENABLED = prev;
    }
  });
});

describe("Roadmap #10D — Preview wiring", () => {
  it("preview page uses RecipeDetailView with same gate prop", () => {
    const preview = read("app/admin/(preview)/recipes/[id]/preview/page.tsx");
    assert.match(preview, /mode="preview"/);
    assert.match(preview, /stepTimestampsEnabled=\{isRecipeStepTimestampsEnabled\(\)\}/);
  });
});

describe("Roadmap #10D — Prisma untouched", () => {
  it("schema has no #10 columns", () => {
    const schema = readFileSync(path.join(srcRoot, "..", "prisma", "schema.prisma"), "utf8");
    assert.doesNotMatch(schema, /stepVideoTimestamps|stepTimestampsVideoId/);
  });
});
