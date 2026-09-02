import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { CORE_VALUE_KEYS } from "@/lib/fields";
import {
  computeRecipeSchemaVersion,
  type SchemaCategory,
  type SchemaField,
  type SchemaRecipeType,
} from "@/lib/ai-recipe/schema-version";
import { normalizeInstructionGroups } from "@/lib/instruction-chapters";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { youtubeVideoId } from "@/lib/youtube";
import {
  collectChapterSuggestionEvidence,
  hasTrustworthyTimestampEvidence,
} from "@/lib/ai-recipe/chapter-suggestions/evidence";
import {
  buildChapterTitleSuggestions,
  buildDeterministicChapterSuggestions,
} from "@/lib/ai-recipe/chapter-suggestions/build";
import { instructionSnapshotFingerprint } from "@/lib/ai-recipe/chapter-suggestions/fingerprints";
import type {
  ChapterSuggestionBatch,
  ChapterSuggestionMode,
} from "@/lib/ai-recipe/chapter-suggestions/types";

function mapType(row: {
  id: string;
  name: string;
  slug: string;
  fields: {
    key: string;
    label: string;
    helpText: string;
    kind: string;
    required: boolean;
    options: string;
    sortOrder: number;
  }[];
}): SchemaRecipeType {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    fields: row.fields
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(
        (field): SchemaField => ({
          key: field.key,
          label: field.label,
          kind: field.kind,
          required: field.required,
          helpText: field.helpText,
          options: JSON.parse(field.options || "[]") as string[],
        }),
      ),
  };
}

export type RunChapterSuggestionsInput = {
  typeId: string;
  youtubeUrl?: string;
  values: Record<string, unknown>;
  title?: string;
  aiMeta?: RecipeAiMeta | null;
  mode?: ChapterSuggestionMode;
};

export type RunChapterSuggestionsSuccess = {
  ok: true;
  batch: ChapterSuggestionBatch;
};

export type RunChapterSuggestionsFailure = {
  ok: false;
  code:
    | "bad_request"
    | "no_video"
    | "insufficient_evidence"
    | "no_suggestions"
    | "invalid_type";
  message: string;
};

export async function runChapterTimestampSuggestions(
  input: RunChapterSuggestionsInput,
): Promise<RunChapterSuggestionsSuccess | RunChapterSuggestionsFailure> {
  const started = Date.now();
  const mode: ChapterSuggestionMode = input.mode === "all" ? "all" : "missing";
  const typeId = String(input.typeId || "").trim();
  if (!typeId) {
    return { ok: false, code: "bad_request", message: "typeId is required." };
  }

  const videoId =
    youtubeVideoId(String(input.youtubeUrl ?? "")) ??
    youtubeVideoId(String(input.values.youtubeUrl ?? "")) ??
    input.aiMeta?.sourceVideoId ??
    null;
  if (!videoId) {
    return { ok: false, code: "no_video", message: "Link a YouTube video before suggesting chapters." };
  }

  const db = getDb();
  const [types, categories, recipeType] = await Promise.all([
    db.recipeType.findMany({ include: { fields: true }, orderBy: { name: "asc" } }),
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.recipeType.findUnique({ where: { id: typeId }, include: { fields: true } }),
  ]);
  if (!recipeType) {
    return { ok: false, code: "invalid_type", message: "Recipe type not found." };
  }

  const allTypes = types.map(mapType);
  const selectedType = mapType(recipeType);
  const schemaCategories: SchemaCategory[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    group: category.group,
  }));
  const schemaVersion = computeRecipeSchemaVersion({
    types: allTypes,
    categories: schemaCategories,
    coreFieldKeys: CORE_VALUE_KEYS,
  });

  let cacheRaw: unknown | null = null;
  const cached = await db.aiRecipeGenerationCache.findUnique({
    where: {
      videoId_typeId_schemaVersion: {
        videoId,
        typeId,
        schemaVersion,
      },
    },
  });
  if (cached?.responseJson) {
    try {
      cacheRaw = JSON.parse(cached.responseJson) as unknown;
    } catch {
      cacheRaw = null;
    }
  }

  let youtubeDescription: string | null = null;
  const syncedVideo = await db.youTubeVideo.findUnique({
    where: { videoId },
    select: { description: true },
  });
  if (syncedVideo?.description) {
    youtubeDescription = syncedVideo.description;
  }

  const evidence = collectChapterSuggestionEvidence({
    values: input.values,
    aiMeta: input.aiMeta ?? null,
    videoId,
    cacheRaw,
    youtubeDescription,
  });

  const groups = normalizeInstructionGroups(input.values.instructions);
  if (!groups.length) {
    return {
      ok: false,
      code: "no_suggestions",
      message: "Add instruction sections before suggesting chapters.",
    };
  }

  const timestampEvidenceAvailable = hasTrustworthyTimestampEvidence(evidence);
  const suggestions = timestampEvidenceAvailable
    ? buildDeterministicChapterSuggestions({ groups, evidence, mode })
    : buildChapterTitleSuggestions({ groups, mode });

  if (!suggestions.length) {
    return {
      ok: false,
      code: "no_suggestions",
      message: timestampEvidenceAvailable
        ? "No reliable timestamp suggestions could be produced from available sources."
        : "No chapter title suggestions are needed for the current sections.",
    };
  }

  if (timestampEvidenceAvailable) {
    const applicable = suggestions.filter((row) => row.status !== "no_evidence");
    if (!applicable.length) {
      return {
        ok: false,
        code: "no_suggestions",
        message: "No reliable timestamp suggestions could be produced from available sources.",
      };
    }
  }

  const batch: ChapterSuggestionBatch = {
    requestId: randomUUID(),
    generatedAt: new Date().toISOString(),
    mode,
    instructionSnapshotFingerprint: instructionSnapshotFingerprint(groups),
    suggestions,
    diagnostics: {
      strategy: "deterministic",
      evidenceSources: evidence.evidenceSources,
      sectionsRequested:
        mode === "all"
          ? groups.length
          : groups.filter((group) => group.startTimestamp == null).length,
      sectionsSuggested: suggestions.filter((row) => row.status === "suggested").length,
      sectionsNoEvidence: suggestions.filter((row) => row.status === "no_evidence").length,
      sectionsConflict: suggestions.filter((row) => row.status === "conflict").length,
      generationCacheUsed: evidence.generationCacheUsed,
      geminiUsed: false,
      latencyMs: Date.now() - started,
      timestampEvidenceAvailable,
      suggestionKind: timestampEvidenceAvailable ? "timestamps" : "titles",
    },
  };

  return { ok: true, batch };
}
