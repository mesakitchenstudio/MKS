import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAiVideoChapterSuggestions,
  sectionSemanticMatchScore,
  titleMatchScore,
  AI_VIDEO_MIN_SECTION_GAP_SECONDS,
} from "@/lib/ai-recipe/chapter-suggestions/build";
import { collectChapterSuggestionEvidence } from "@/lib/ai-recipe/chapter-suggestions/evidence";
import { parseVideoChapterAnalysisRaw } from "@/lib/ai-recipe/chapter-suggestions/parse-video-chapter-analysis";
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
    youtubeChapterGapIssue({ previousTimestamp: 0, currentTimestamp: 18 })?.editorialWarning?.includes("18s"),
    true,
  );
});

test("semantic matching maps equivalent potato-chip labels", () => {
  assert.ok(titleMatchScore("Slice and Starch Rinse", "Preparing and soaking potatoes") >= 4);
  assert.ok(titleMatchScore("Blanch, Shock, and Dry", "Blanching potato slices") >= 4);
  assert.ok(titleMatchScore("Fry the Chips", "Deep frying") >= 4);
  assert.ok(titleMatchScore("Mix Seasoning & Toss", "Seasoning the chips") >= 4);
  assert.ok(
    sectionSemanticMatchScore({
      sectionTitle: "Slice and Starch Rinse",
      steps: ["Wash and peel potatoes", "Slice into paper-thin rounds", "Submerge in water to remove starch"],
      chapterLabel: "Prepare potato slices",
    }) >= 4,
  );
});

test("parseVideoChapterAnalysisRaw accepts section-targeted hits", () => {
  const parsed = parseVideoChapterAnalysisRaw({
    duration: "4:18",
    sections: [
      {
        sectionIndex: 0,
        matched: true,
        startTime: "0:00",
        label: "Slice",
        confidence: "HIGH_CONFIDENCE_INFERENCE",
        evidence: "Slicing begins",
      },
      {
        sectionIndex: 1,
        matched: true,
        startTime: "1:07",
        label: "Blanch",
        confidence: "HIGH_CONFIDENCE_INFERENCE",
        evidence: "Into boiling water",
      },
      { sectionIndex: 2, matched: false, confidence: "UNKNOWN", evidence: "Unclear" },
      {
        sectionIndex: 3,
        matched: true,
        startTime: "3:25",
        label: "Season",
        confidence: "HIGH_CONFIDENCE_INFERENCE",
        evidence: "Tossing chips",
      },
    ],
  });
  assert.equal(parsed.sectionHits.filter((hit) => hit.matched).length, 3);
  assert.equal(parsed.sectionHits.find((hit) => hit.sectionIndex === 2)?.matched, false);
});

test("parseVideoChapterAnalysisRaw accepts youtubeMetadata.chapters and numeric times", () => {
  const parsed = parseVideoChapterAnalysisRaw({
    youtubeMetadata: {
      chapters: [
        { time: 0, label: "Intro prep", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "prep" },
        { time: "1:10", label: "Fry", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "fry" },
      ],
    },
  });
  assert.equal(parsed.chapters.length, 2);
  assert.equal(parsed.chapters[0]?.time, 0);
});

test("3 good + 1 unmatched yields partial suggestions", () => {
  const groups = [
    { name: "Slice and Starch Rinse", steps: ["slice"] },
    { name: "Blanch, Shock, and Dry", steps: ["blanch"] },
    { name: "Fry the Chips", steps: ["fry"] },
    { name: "Mix Seasoning & Toss", steps: ["toss"] },
  ];
  const evidence = collectChapterSuggestionEvidence({
    videoId: "chips",
    values: { instructions: groups, youtube: { duration: "4:18" } },
    cacheRaw: {
      youtubeMetadata: {
        chapters: [
          { time: "0:00", label: "Slice and Starch Rinse", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "a" },
          { time: "1:07", label: "Blanch, Shock, and Dry", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "b" },
          { time: "2:11", label: "Fry the Chips", confidence: "HIGH_CONFIDENCE_INFERENCE", sourceNote: "c" },
        ],
      },
    },
  });
  const suggestions = buildAiVideoChapterSuggestions({
    groups,
    evidence,
    mode: "missing",
    sectionHits: [
      { sectionIndex: 0, matched: true, startTimestamp: 0, confidence: "HIGH_CONFIDENCE_INFERENCE", evidence: "a" },
      { sectionIndex: 1, matched: true, startTimestamp: 67, confidence: "HIGH_CONFIDENCE_INFERENCE", evidence: "b" },
      { sectionIndex: 2, matched: true, startTimestamp: 131, confidence: "HIGH_CONFIDENCE_INFERENCE", evidence: "c" },
      { sectionIndex: 3, matched: false, confidence: "UNKNOWN", evidence: "unclear" },
    ],
  });
  assert.equal(suggestions.filter((row) => row.status === "suggested").length, 3);
  assert.equal(suggestions.find((row) => row.instructionIndex === 3)?.status, "no_evidence");
});

test("one malformed/conflict timestamp does not discard other sections", () => {
  const groups = [
    { name: "Slice and Starch Rinse", steps: ["a"] },
    { name: "Blanch, Shock, and Dry", steps: ["b"] },
    { name: "Fry the Chips", steps: ["c"] },
  ];
  const suggestions = buildAiVideoChapterSuggestions({
    groups,
    evidence: collectChapterSuggestionEvidence({
      videoId: "chips",
      values: { instructions: groups, youtube: { duration: "4:18" } },
      cacheRaw: { youtubeMetadata: { chapters: [] } },
    }),
    mode: "missing",
    sectionHits: [
      { sectionIndex: 0, matched: true, startTimestamp: 0, confidence: "HIGH_CONFIDENCE_INFERENCE" },
      { sectionIndex: 1, matched: true, startTimestamp: 5, confidence: "HIGH_CONFIDENCE_INFERENCE" },
      { sectionIndex: 2, matched: true, startTimestamp: 120, confidence: "HIGH_CONFIDENCE_INFERENCE" },
    ],
  });
  assert.equal(suggestions[0]?.status, "suggested");
  assert.equal(suggestions[1]?.status, "conflict");
  assert.equal(suggestions[2]?.status, "suggested");
});

test("14-second AI video gap remains a valid suggestion", () => {
  const groups = [
    { name: "Slice and Starch Rinse", steps: ["a"] },
    { name: "Blanch, Shock, and Dry", steps: ["b"] },
  ];
  const suggestions = buildAiVideoChapterSuggestions({
    groups,
    evidence: collectChapterSuggestionEvidence({
      videoId: "chips123",
      values: { instructions: groups, youtube: { duration: "4:18" } },
      cacheRaw: { youtubeMetadata: { chapters: [] } },
    }),
    mode: "missing",
    sectionHits: [
      { sectionIndex: 0, matched: true, startTimestamp: 0, confidence: "HIGH_CONFIDENCE_INFERENCE" },
      { sectionIndex: 1, matched: true, startTimestamp: 14, confidence: "HIGH_CONFIDENCE_INFERENCE" },
    ],
  });
  assert.equal(suggestions[1]?.status, "suggested");
  assert.equal(suggestions[1]?.startTimestamp, 14);
});

test("9-second AI video gap is rejected", () => {
  const groups = [
    { name: "Slice and Starch Rinse", steps: ["a"] },
    { name: "Blanch, Shock, and Dry", steps: ["b"] },
  ];
  const suggestions = buildAiVideoChapterSuggestions({
    groups,
    evidence: collectChapterSuggestionEvidence({
      videoId: "chips123",
      values: { instructions: groups, youtube: { duration: "4:18" } },
      cacheRaw: { youtubeMetadata: { chapters: [] } },
    }),
    mode: "missing",
    sectionHits: [
      { sectionIndex: 0, matched: true, startTimestamp: 0, confidence: "HIGH_CONFIDENCE_INFERENCE" },
      { sectionIndex: 1, matched: true, startTimestamp: 9, confidence: "HIGH_CONFIDENCE_INFERENCE" },
    ],
  });
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
      sectionHits: [
        {
          sectionIndex: 0,
          matched: true,
          startTimestamp: 0,
          label: "A",
          confidence: "HIGH_CONFIDENCE_INFERENCE",
          evidence: "A",
        },
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
      sections: [{ sectionIndex: 0, title: "A", steps: ["do a"] }],
      cacheRaw,
      forceRefresh: false,
    },
    {
      analyzeVideoChaptersWithGemini: async () => {
        analyzeCalls += 1;
        return {
          ok: false,
          latencyMs: 1,
          stage: "VIDEO_ANALYSIS_EMPTY",
          error: { code: "RECIPE_SCHEMA_EMPTY", message: "fail", stage: "recipe_schema" },
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
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fromCache, true);
    assert.equal(analyzeCalls, 0);
  }
  assert.equal(shouldReuseVideoChapterCache({ cachedChapterCount: 1, forceRefresh: false }), true);
  assert.equal(shouldReuseVideoChapterCache({ cachedChapterCount: 1, forceRefresh: true }), false);
});

test("empty/invalid cache triggers fresh analysis", async () => {
  let analyzeCalls = 0;
  const result = await fetchOrAnalyzeVideoChapters(
    {
      videoId: "v2",
      typeId: "type1",
      schemaVersion: "sv1",
      youtubeUrl: "https://www.youtube.com/watch?v=v2",
      sections: [{ sectionIndex: 0, title: "Slice and Starch Rinse", steps: ["slice"] }],
      cacheRaw: { youtubeMetadata: { chapters: [] } },
      forceRefresh: false,
    },
    {
      analyzeVideoChaptersWithGemini: async () => {
        analyzeCalls += 1;
        return {
          ok: true,
          model: "gemini-test",
          latencyMs: 12,
          raw: {
            sections: [
              {
                sectionIndex: 0,
                matched: true,
                startTime: "0:00",
                label: "Slice and Starch Rinse",
                confidence: "HIGH_CONFIDENCE_INFERENCE",
                evidence: "Slicing begins",
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
    assert.equal(result.sectionHits.filter((hit) => hit.matched).length, 1);
  }
});

test("failed fresh analysis does not fabricate timestamps", async () => {
  const result = await fetchOrAnalyzeVideoChapters(
    {
      videoId: "v3",
      typeId: "type1",
      schemaVersion: "sv1",
      youtubeUrl: "https://www.youtube.com/watch?v=v3",
      sections: [{ sectionIndex: 0, title: "A", steps: [] }],
      cacheRaw: null,
      forceRefresh: true,
    },
    {
      analyzeVideoChaptersWithGemini: async () => ({
        ok: true,
        model: "gemini-test",
        latencyMs: 5,
        raw: { sections: [{ sectionIndex: 0, matched: false, confidence: "UNKNOWN", evidence: "none" }] },
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
    assert.ok(
      result.stage === "VIDEO_ANALYSIS_EMPTY" ||
        result.stage === "VIDEO_ANALYSIS_NO_SECTION_MATCH" ||
        result.stage === "VIDEO_ANALYSIS_PARSE_FAILED",
    );
  }
});
