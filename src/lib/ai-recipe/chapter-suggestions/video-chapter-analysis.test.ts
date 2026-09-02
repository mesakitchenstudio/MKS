import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAiVideoChapterSuggestions,
  AI_VIDEO_MIN_SECTION_GAP_SECONDS,
} from "@/lib/ai-recipe/chapter-suggestions/build";
import { collectChapterSuggestionEvidence } from "@/lib/ai-recipe/chapter-suggestions/evidence";
import {
  fetchOrAnalyzeVideoChapters,
  shouldReuseVideoChapterCache,
  VIDEO_CHAPTER_ANALYSIS_FAILURE_MESSAGE,
} from "@/lib/ai-recipe/chapter-suggestions/video-chapter-analysis";
import {
  isFinalChapterLongEnough,
  youtubeChapterGapIssue,
  YOUTUBE_CHAPTER_MIN_SECONDS,
} from "@/lib/youtube-chapter-sync/validity";

test("youtube chapter validity uses 10 second hard minimum", () => {
  assert.equal(YOUTUBE_CHAPTER_MIN_SECONDS, 10);
  assert.equal(AI_VIDEO_MIN_SECTION_GAP_SECONDS, 10);
  assert.equal(youtubeChapterGapIssue({ previousTimestamp: 0, currentTimestamp: 9 })?.hardInvalid, true);
  assert.equal(youtubeChapterGapIssue({ previousTimestamp: 0, currentTimestamp: 10 })?.hardInvalid, false);
  assert.equal(
    youtubeChapterGapIssue({ previousTimestamp: 0, currentTimestamp: 14 })?.editorialWarning?.includes("14s"),
    true,
  );
  assert.equal(
    youtubeChapterGapIssue({ previousTimestamp: 0, currentTimestamp: 21 })?.editorialWarning?.includes("21s"),
    true,
  );
});

test("14-second AI video gap remains a valid suggestion", () => {
  const groups = [
    { name: "Slice and Starch Rinse", steps: ["a"] },
    { name: "Blanch, Shock, and Dry", steps: ["b"] },
  ];
  const evidence = collectChapterSuggestionEvidence({
    videoId: "chips123",
    values: { instructions: groups, youtube: { duration: "4:18" } },
    cacheRaw: {
      youtubeMetadata: {
        chapters: [
          { time: "0:00", label: "Slice and Starch Rinse", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "Slice" },
          { time: "0:14", label: "Blanch, Shock, and Dry", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "Blanch" },
        ],
      },
    },
  });
  const suggestions = buildAiVideoChapterSuggestions({ groups, evidence, mode: "missing" });
  assert.equal(suggestions[1]?.status, "suggested");
  assert.equal(suggestions[1]?.startTimestamp, 14);
});

test("9-second AI video gap is rejected", () => {
  const groups = [
    { name: "Slice and Starch Rinse", steps: ["a"] },
    { name: "Blanch, Shock, and Dry", steps: ["b"] },
  ];
  const evidence = collectChapterSuggestionEvidence({
    videoId: "chips123",
    values: { instructions: groups, youtube: { duration: "4:18" } },
    cacheRaw: {
      youtubeMetadata: {
        chapters: [
          { time: "0:00", label: "Slice and Starch Rinse", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "Slice" },
          { time: "0:09", label: "Blanch, Shock, and Dry", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "Blanch" },
        ],
      },
    },
  });
  const suggestions = buildAiVideoChapterSuggestions({ groups, evidence, mode: "missing" });
  assert.equal(suggestions[1]?.status, "conflict");
  assert.equal(suggestions[1]?.startTimestamp, undefined);
});

test("final chapter shorter than 10 seconds is not export-ready", () => {
  assert.equal(isFinalChapterLongEnough(252, 258), false);
  assert.equal(isFinalChapterLongEnough(248, 258), true);
});

test("fetchOrAnalyzeVideoChapters reuses valid cache unless forceRefresh", async () => {
  const cacheRaw = {
    youtubeMetadata: {
      chapters: [
        { time: "0:00", label: "A", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "A" },
      ],
    },
  };
  let analyzeCalls = 0;
  const result = await fetchOrAnalyzeVideoChapters(
    {
      videoId: "v1",
      typeId: "type1",
      schemaVersion: "sv1",
      youtubeUrl: "https://www.youtube.com/watch?v=v1",
      sectionTitles: ["A"],
      cacheRaw,
      forceRefresh: false,
    },
    {
      analyzeVideoChaptersWithGemini: async () => {
        analyzeCalls += 1;
        return { ok: false, error: { code: "RECIPE_SCHEMA_EMPTY", message: "fail", stage: "recipe_schema" } };
      },
      getDb: () =>
        ({
          aiRecipeGenerationCache: {
            upsert: async () => ({}),
          },
        }) as never,
    },
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fromCache, true);
    assert.equal(analyzeCalls, 0);
  }
  assert.equal(shouldReuseVideoChapterCache({ cachedChapterCount: 1, forceRefresh: false }), true);
  assert.equal(shouldReuseVideoChapterCache({ cachedChapterCount: 1, forceRefresh: true }), false);
});

test("fetchOrAnalyzeVideoChapters invokes analysis when cache is empty", async () => {
  let analyzeCalls = 0;
  const result = await fetchOrAnalyzeVideoChapters(
    {
      videoId: "v2",
      typeId: "type1",
      schemaVersion: "sv1",
      youtubeUrl: "https://www.youtube.com/watch?v=v2",
      sectionTitles: ["Slice and Starch Rinse"],
      cacheRaw: null,
      forceRefresh: false,
    },
    {
      analyzeVideoChaptersWithGemini: async () => {
        analyzeCalls += 1;
        return {
          ok: true,
          model: "gemini-test",
          raw: {
            chapters: [
              {
                time: "0:00",
                label: "Slice and Starch Rinse",
                confidence: "HIGH_CONFIDENCE_INFERENCE",
                sourceNote: "Slicing begins",
              },
            ],
          },
        };
      },
      getDb: () =>
        ({
          aiRecipeGenerationCache: {
            upsert: async () => ({}),
          },
        }) as never,
    },
  );
  assert.equal(analyzeCalls, 1);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.freshAnalysis, true);
    assert.equal(result.chapters.length, 1);
  }
});

test("failed fresh analysis does not fabricate timestamps", async () => {
  const result = await fetchOrAnalyzeVideoChapters(
    {
      videoId: "v3",
      typeId: "type1",
      schemaVersion: "sv1",
      youtubeUrl: "https://www.youtube.com/watch?v=v3",
      sectionTitles: ["A"],
      cacheRaw: null,
      forceRefresh: true,
    },
    {
      analyzeVideoChaptersWithGemini: async () => ({
        ok: true,
        model: "gemini-test",
        raw: { chapters: [] },
      }),
      getDb: () =>
        ({
          aiRecipeGenerationCache: {
            upsert: async () => ({}),
          },
        }) as never,
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.message, VIDEO_CHAPTER_ANALYSIS_FAILURE_MESSAGE);
  }
});
