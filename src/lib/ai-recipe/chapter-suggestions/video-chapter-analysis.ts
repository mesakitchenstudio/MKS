import { getDb } from "@/lib/db";
import { analyzeVideoChaptersWithGemini } from "@/lib/ai-recipe/gemini";
import { aiChaptersFromGeminiRaw } from "@/lib/ai-recipe/youtube-chapters";
import { formatTimestampInput } from "@/lib/youtube-metadata-editor";
import {
  hitsToNormalizedChapters,
  parseVideoChapterAnalysisRaw,
  type ParsedVideoChapterAnalysis,
  type VideoChapterAnalysisStage,
  type VideoChapterSectionHit,
  type VideoSectionTarget,
} from "@/lib/ai-recipe/chapter-suggestions/parse-video-chapter-analysis";

export const VIDEO_CHAPTER_ANALYSIS_FAILURE_MESSAGE =
  "Video analysis couldn't locate reliable chapter times.";

export type FetchOrAnalyzeVideoChaptersInput = {
  videoId: string;
  typeId: string;
  schemaVersion: string;
  youtubeUrl: string;
  sections: VideoSectionTarget[];
  cacheRaw: unknown | null;
  forceRefresh?: boolean;
};

export type VideoChapterAnalysisDiagnostics = {
  videoId: string;
  typeId: string;
  cachePresent: boolean;
  cacheBypassed: boolean;
  cacheChapterCount: number;
  freshGeminiStarted: boolean;
  model?: string;
  latencyMs: number;
  stage: VideoChapterAnalysisStage;
  rawChapterCount: number;
  matchedSectionCount: number;
  parseNotes: string[];
  geminiErrorCode?: string;
};

export type FetchOrAnalyzeVideoChaptersResult =
  | {
      ok: true;
      cacheRaw: unknown;
      chapters: ReturnType<typeof aiChaptersFromGeminiRaw>;
      sectionHits: VideoChapterSectionHit[];
      model: string;
      fromCache: boolean;
      freshAnalysis: boolean;
      diagnostics: VideoChapterAnalysisDiagnostics;
      parsed: ParsedVideoChapterAnalysis;
    }
  | {
      ok: false;
      message: string;
      code: "video_analysis_failed" | "video_analysis_unconfigured";
      stage: VideoChapterAnalysisStage;
      diagnostics: VideoChapterAnalysisDiagnostics;
    };

type VideoChapterAnalysisDeps = {
  analyzeVideoChaptersWithGemini: typeof analyzeVideoChaptersWithGemini;
  getDb: typeof getDb;
};

const defaultDeps: VideoChapterAnalysisDeps = {
  analyzeVideoChaptersWithGemini,
  getDb,
};

function logVideoChapterAnalysis(diagnostics: VideoChapterAnalysisDiagnostics) {
  console.info("[video-chapter-analysis]", {
    videoId: diagnostics.videoId,
    typeId: diagnostics.typeId,
    cachePresent: diagnostics.cachePresent,
    cacheBypassed: diagnostics.cacheBypassed,
    cacheChapterCount: diagnostics.cacheChapterCount,
    freshGeminiStarted: diagnostics.freshGeminiStarted,
    model: diagnostics.model,
    latencyMs: diagnostics.latencyMs,
    stage: diagnostics.stage,
    rawChapterCount: diagnostics.rawChapterCount,
    matchedSectionCount: diagnostics.matchedSectionCount,
    parseNotes: diagnostics.parseNotes,
    geminiErrorCode: diagnostics.geminiErrorCode,
  });
}

function mergeChaptersIntoCacheRaw(
  existingRaw: unknown | null,
  parsed: ParsedVideoChapterAnalysis,
): unknown {
  const root =
    existingRaw && typeof existingRaw === "object" && !Array.isArray(existingRaw)
      ? { ...(existingRaw as Record<string, unknown>) }
      : {};
  const metadata =
    root.youtubeMetadata && typeof root.youtubeMetadata === "object" && !Array.isArray(root.youtubeMetadata)
      ? { ...(root.youtubeMetadata as Record<string, unknown>) }
      : {};

  const chapters = parsed.chapters.length
    ? parsed.chapters
    : hitsToNormalizedChapters(parsed.sectionHits);

  metadata.chapters = chapters.map((chapter) => ({
    time: formatTimestampInput(chapter.time),
    label: chapter.label,
    confidence: chapter.confidence,
    sourceNote: chapter.sourceNote,
  }));
  metadata.sectionHits = parsed.sectionHits;
  if (parsed.duration?.trim()) {
    metadata.duration = parsed.duration.trim();
  }
  root.youtubeMetadata = metadata;
  return root;
}

function sectionHitsFromCacheRaw(cacheRaw: unknown): VideoChapterSectionHit[] {
  if (!cacheRaw || typeof cacheRaw !== "object" || Array.isArray(cacheRaw)) return [];
  const metadata = (cacheRaw as Record<string, unknown>).youtubeMetadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const hits = (metadata as Record<string, unknown>).sectionHits;
  if (!Array.isArray(hits)) return [];
  return parseVideoChapterAnalysisRaw({ sections: hits }).sectionHits;
}

async function persistVideoChapterCache(input: {
  videoId: string;
  typeId: string;
  schemaVersion: string;
  model: string;
  cacheRaw: unknown;
  deps: VideoChapterAnalysisDeps;
}) {
  await input.deps.getDb().aiRecipeGenerationCache.upsert({
    where: {
      videoId_typeId_schemaVersion: {
        videoId: input.videoId,
        typeId: input.typeId,
        schemaVersion: input.schemaVersion,
      },
    },
    create: {
      videoId: input.videoId,
      typeId: input.typeId,
      schemaVersion: input.schemaVersion,
      model: input.model,
      responseJson: JSON.stringify(input.cacheRaw),
    },
    update: {
      model: input.model,
      responseJson: JSON.stringify(input.cacheRaw),
    },
  });
}

export async function fetchOrAnalyzeVideoChapters(
  input: FetchOrAnalyzeVideoChaptersInput,
  deps: VideoChapterAnalysisDeps = defaultDeps,
): Promise<FetchOrAnalyzeVideoChaptersResult> {
  const started = Date.now();
  const cachedChapters = input.cacheRaw ? aiChaptersFromGeminiRaw(input.cacheRaw) : [];
  const cachedHits = sectionHitsFromCacheRaw(input.cacheRaw);
  const cachePresent = Boolean(input.cacheRaw);
  const cacheUsable =
    cachedHits.some((hit) => hit.matched && hit.startTimestamp != null) || cachedChapters.length > 0;

  if (cacheUsable && !input.forceRefresh) {
    const parsed = parseVideoChapterAnalysisRaw(
      input.cacheRaw && typeof input.cacheRaw === "object"
        ? {
            chapters: cachedChapters.map((chapter) => ({
              time: formatTimestampInput(chapter.time),
              label: chapter.label,
              confidence: chapter.confidence,
              sourceNote: chapter.sourceNote,
            })),
            sections: cachedHits,
            youtubeMetadata: (input.cacheRaw as Record<string, unknown>).youtubeMetadata,
          }
        : input.cacheRaw,
    );
    const diagnostics: VideoChapterAnalysisDiagnostics = {
      videoId: input.videoId,
      typeId: input.typeId,
      cachePresent,
      cacheBypassed: false,
      cacheChapterCount: cachedChapters.length,
      freshGeminiStarted: false,
      model: "cache",
      latencyMs: Date.now() - started,
      stage: "VIDEO_ANALYSIS_OK",
      rawChapterCount: Math.max(cachedChapters.length, cachedHits.length),
      matchedSectionCount: cachedHits.filter((hit) => hit.matched).length || cachedChapters.length,
      parseNotes: ["cache_reuse", ...parsed.parseNotes],
    };
    logVideoChapterAnalysis(diagnostics);
    return {
      ok: true,
      cacheRaw: input.cacheRaw!,
      chapters: cachedChapters,
      sectionHits: cachedHits,
      model: "cache",
      fromCache: true,
      freshAnalysis: false,
      diagnostics,
      parsed: {
        ...parsed,
        chapters: cachedChapters.length ? cachedChapters : parsed.chapters,
        sectionHits: cachedHits.length ? cachedHits : parsed.sectionHits,
      },
    };
  }

  if (cachePresent && !cacheUsable && !input.forceRefresh) {
    // Fall through to fresh analysis — stale/empty cache must not block.
  }

  const analyzed = await deps.analyzeVideoChaptersWithGemini({
    youtubeUrl: input.youtubeUrl,
    sections: input.sections,
  });

  if (!analyzed.ok) {
    const stage = analyzed.stage;
    const diagnostics: VideoChapterAnalysisDiagnostics = {
      videoId: input.videoId,
      typeId: input.typeId,
      cachePresent,
      cacheBypassed: Boolean(input.forceRefresh) || (cachePresent && !cacheUsable),
      cacheChapterCount: cachedChapters.length,
      freshGeminiStarted: true,
      latencyMs: analyzed.latencyMs,
      stage,
      rawChapterCount: 0,
      matchedSectionCount: 0,
      parseNotes: [],
      geminiErrorCode: analyzed.error.code,
    };
    logVideoChapterAnalysis(diagnostics);
    return {
      ok: false,
      code: stage === "VIDEO_ANALYSIS_UNCONFIGURED" ? "video_analysis_unconfigured" : "video_analysis_failed",
      stage,
      message:
        stage === "VIDEO_ANALYSIS_UNCONFIGURED"
          ? "Video analysis is not configured on this server."
          : VIDEO_CHAPTER_ANALYSIS_FAILURE_MESSAGE,
      diagnostics,
    };
  }

  const parsed = parseVideoChapterAnalysisRaw(analyzed.raw);
  const matchedHits = parsed.sectionHits.filter(
    (hit) => hit.matched && hit.startTimestamp != null,
  );
  const chapters =
    parsed.chapters.length > 0 ? parsed.chapters : hitsToNormalizedChapters(matchedHits);

  if (!chapters.length && !matchedHits.length) {
    const stage: VideoChapterAnalysisStage =
      parsed.rawChapterCount === 0 && parsed.sectionHits.length === 0
        ? "VIDEO_ANALYSIS_EMPTY"
        : parsed.sectionHits.length > 0
          ? "VIDEO_ANALYSIS_NO_SECTION_MATCH"
          : "VIDEO_ANALYSIS_PARSE_FAILED";
    const diagnostics: VideoChapterAnalysisDiagnostics = {
      videoId: input.videoId,
      typeId: input.typeId,
      cachePresent,
      cacheBypassed: Boolean(input.forceRefresh) || (cachePresent && !cacheUsable),
      cacheChapterCount: cachedChapters.length,
      freshGeminiStarted: true,
      model: analyzed.model,
      latencyMs: analyzed.latencyMs,
      stage,
      rawChapterCount: parsed.rawChapterCount,
      matchedSectionCount: 0,
      parseNotes: parsed.parseNotes,
    };
    logVideoChapterAnalysis(diagnostics);
    return {
      ok: false,
      code: "video_analysis_failed",
      stage,
      message: VIDEO_CHAPTER_ANALYSIS_FAILURE_MESSAGE,
      diagnostics,
    };
  }

  const cacheRaw = mergeChaptersIntoCacheRaw(input.cacheRaw, {
    ...parsed,
    chapters,
  });

  await persistVideoChapterCache({
    videoId: input.videoId,
    typeId: input.typeId,
    schemaVersion: input.schemaVersion,
    model: analyzed.model,
    cacheRaw,
    deps,
  });

  const diagnostics: VideoChapterAnalysisDiagnostics = {
    videoId: input.videoId,
    typeId: input.typeId,
    cachePresent,
    cacheBypassed: Boolean(input.forceRefresh) || (cachePresent && !cacheUsable),
    cacheChapterCount: cachedChapters.length,
    freshGeminiStarted: true,
    model: analyzed.model,
    latencyMs: analyzed.latencyMs,
    stage: "VIDEO_ANALYSIS_OK",
    rawChapterCount: Math.max(chapters.length, parsed.sectionHits.length),
    matchedSectionCount: matchedHits.length || chapters.length,
    parseNotes: parsed.parseNotes,
  };
  logVideoChapterAnalysis(diagnostics);

  return {
    ok: true,
    cacheRaw,
    chapters,
    sectionHits: parsed.sectionHits,
    model: analyzed.model,
    fromCache: false,
    freshAnalysis: true,
    diagnostics,
    parsed: { ...parsed, chapters },
  };
}

export function shouldReuseVideoChapterCache(input: {
  cachedChapterCount: number;
  forceRefresh: boolean;
}): boolean {
  return input.cachedChapterCount > 0 && !input.forceRefresh;
}

export type { VideoChapterAnalysisStage, VideoSectionTarget, VideoChapterSectionHit };
