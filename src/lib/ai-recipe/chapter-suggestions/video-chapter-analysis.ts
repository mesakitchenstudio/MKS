import { getDb } from "@/lib/db";
import { analyzeVideoChaptersWithGemini } from "@/lib/ai-recipe/gemini";
import {
  aiChaptersFromGeminiRaw,
  normalizeAiYoutubeChapters,
  type NormalizedAiYoutubeChapter,
} from "@/lib/ai-recipe/youtube-chapters";
import { formatTimestampInput } from "@/lib/youtube-metadata-editor";

export const VIDEO_CHAPTER_ANALYSIS_FAILURE_MESSAGE =
  "Video analysis couldn't locate reliable chapter times.";

export type FetchOrAnalyzeVideoChaptersInput = {
  videoId: string;
  typeId: string;
  schemaVersion: string;
  youtubeUrl: string;
  sectionTitles: string[];
  cacheRaw: unknown | null;
  forceRefresh?: boolean;
};

export type FetchOrAnalyzeVideoChaptersResult =
  | {
      ok: true;
      cacheRaw: unknown;
      chapters: NormalizedAiYoutubeChapter[];
      model: string;
      fromCache: boolean;
      freshAnalysis: boolean;
    }
  | {
      ok: false;
      message: string;
      code: "video_analysis_failed" | "video_analysis_unconfigured";
    };

type VideoChapterAnalysisDeps = {
  analyzeVideoChaptersWithGemini: typeof analyzeVideoChaptersWithGemini;
  getDb: typeof getDb;
};

const defaultDeps: VideoChapterAnalysisDeps = {
  analyzeVideoChaptersWithGemini,
  getDb,
};

function mergeChaptersIntoCacheRaw(
  existingRaw: unknown | null,
  chapters: NormalizedAiYoutubeChapter[],
  duration?: string,
): unknown {
  const root =
    existingRaw && typeof existingRaw === "object" && !Array.isArray(existingRaw)
      ? { ...(existingRaw as Record<string, unknown>) }
      : {};
  const metadata =
    root.youtubeMetadata && typeof root.youtubeMetadata === "object" && !Array.isArray(root.youtubeMetadata)
      ? { ...(root.youtubeMetadata as Record<string, unknown>) }
      : {};
  metadata.chapters = chapters.map((chapter) => ({
    time: formatTimestampInput(chapter.time),
    label: chapter.label,
    confidence: chapter.confidence,
    sourceNote: chapter.sourceNote,
  }));
  if (duration?.trim()) {
    metadata.duration = duration.trim();
  }
  root.youtubeMetadata = metadata;
  return root;
}

function readAnalysisDuration(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const metadata = (raw as Record<string, unknown>).youtubeMetadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const duration = (metadata as Record<string, unknown>).duration;
  return typeof duration === "string" ? duration : undefined;
}

function chaptersFromAnalysisRaw(raw: unknown): NormalizedAiYoutubeChapter[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const row = raw as Record<string, unknown>;
  return normalizeAiYoutubeChapters(row.chapters, null);
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
  const cachedChapters = input.cacheRaw ? aiChaptersFromGeminiRaw(input.cacheRaw) : [];
  if (cachedChapters.length && !input.forceRefresh) {
    return {
      ok: true,
      cacheRaw: input.cacheRaw!,
      chapters: cachedChapters,
      model: "cache",
      fromCache: true,
      freshAnalysis: false,
    };
  }

  const analyzed = await deps.analyzeVideoChaptersWithGemini({
    youtubeUrl: input.youtubeUrl,
    sectionTitles: input.sectionTitles,
  });

  if (!analyzed.ok) {
    const code =
      analyzed.error.code === "GEMINI_CONFIGURATION_ERROR"
        ? "video_analysis_unconfigured"
        : "video_analysis_failed";
    return {
      ok: false,
      code,
      message:
        code === "video_analysis_unconfigured"
          ? "Video analysis is not configured on this server."
          : VIDEO_CHAPTER_ANALYSIS_FAILURE_MESSAGE,
    };
  }

  const chapters = chaptersFromAnalysisRaw(analyzed.raw);
  if (!chapters.length) {
    return {
      ok: false,
      code: "video_analysis_failed",
      message: VIDEO_CHAPTER_ANALYSIS_FAILURE_MESSAGE,
    };
  }

  const cacheRaw = mergeChaptersIntoCacheRaw(
    input.cacheRaw,
    chapters,
    readAnalysisDuration(analyzed.raw),
  );

  await persistVideoChapterCache({
    videoId: input.videoId,
    typeId: input.typeId,
    schemaVersion: input.schemaVersion,
    model: analyzed.model,
    cacheRaw,
    deps,
  });

  return {
    ok: true,
    cacheRaw,
    chapters,
    model: analyzed.model,
    fromCache: false,
    freshAnalysis: true,
  };
}

export function shouldReuseVideoChapterCache(input: {
  cachedChapterCount: number;
  forceRefresh: boolean;
}): boolean {
  return input.cachedChapterCount > 0 && !input.forceRefresh;
}
