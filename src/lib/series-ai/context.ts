import "server-only";
import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import { classifyYouTubeVideoFormat } from "@/lib/youtube-data/video-format";
import { youtubeThumbnailUrl } from "@/lib/youtube";
import type { SeriesAiContext, SeriesAiContextItem } from "@/lib/series-ai/selection";

export type { SeriesAiContext, SeriesAiContextItem } from "@/lib/series-ai/selection";
export {
  selectSeriesHero,
  seriesContextForPrompt,
  suggestFeaturedItemId,
} from "@/lib/series-ai/selection";

function truncate(value: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function namedNotesSummary(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((row) => {
      const r = (row || {}) as { name?: string; note?: string };
      const name = String(r.name ?? "").trim();
      const note = String(r.note ?? "").trim();
      if (!name && !note) return "";
      return name && note ? `${name}: ${note}` : name || note;
    })
    .filter(Boolean)
    .slice(0, 6)
    .join("; ");
}

function tagsFromValues(values: Record<string, unknown>): string[] {
  const raw = values.tags;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean).slice(0, 12);
  return [];
}

export async function buildSeriesAiContext(seriesId: string): Promise<SeriesAiContext | null> {
  const db = getDb();
  const row = await db.series.findUnique({
    where: { id: seriesId },
    include: {
      items: {
        where: { removedFromPlaylist: false },
        orderBy: { sortOrder: "asc" },
        include: {
          recipe: {
            select: {
              id: true,
              title: true,
              slug: true,
              excerpt: true,
              status: true,
              values: true,
              type: { select: { name: true } },
              categories: { select: { category: { select: { name: true } } } },
            },
          },
          youtubeVideo: {
            select: {
              videoId: true,
              title: true,
              description: true,
              tags: true,
              durationDisplay: true,
              durationSeconds: true,
              thumbnailUrl: true,
              privacyStatus: true,
              embeddable: true,
            },
          },
        },
      },
    },
  });
  if (!row) return null;

  const items: SeriesAiContextItem[] = row.items.map((item) => {
    const values = item.recipe ? parseValues(item.recipe.values) : {};
    const image = typeof values.image === "string" ? values.image : "";
    const intro = typeof values.intro === "string" ? values.intro : "";
    const whyItWorks = typeof values.whyItWorks === "string" ? values.whyItWorks : "";
    const keyIngredients =
      typeof values.keyIngredients === "string"
        ? values.keyIngredients
        : namedNotesSummary(values.keyIngredients);
    const tags = tagsFromValues(values);
    const format = item.youtubeVideo
      ? classifyYouTubeVideoFormat({
          durationSeconds: item.youtubeVideo.durationSeconds || 0,
          title: item.youtubeVideo.title || "",
        })
      : "UNKNOWN";

    return {
      itemId: item.id,
      sortOrder: item.sortOrder,
      featured: item.featured,
      customTitle: item.customTitle,
      customDescription: item.customDescription,
      recipe: item.recipe
        ? {
            id: item.recipe.id,
            title: item.recipe.title,
            slug: item.recipe.slug,
            excerpt: item.recipe.excerpt || "",
            status: item.recipe.status,
            typeName: item.recipe.type?.name || "",
            categoryNames: item.recipe.categories.map((c) => c.category.name),
            intro: truncate(intro, 800),
            whyItWorks: truncate(whyItWorks, 600),
            keyIngredients: truncate(keyIngredients, 400),
            image,
            tags,
          }
        : null,
      video: item.youtubeVideo
        ? {
            videoId: item.youtubeVideo.videoId,
            title: item.youtubeVideo.title,
            description: truncate(item.youtubeVideo.description || "", 1500),
            tags: Array.isArray(item.youtubeVideo.tags)
              ? (item.youtubeVideo.tags as string[]).slice(0, 12)
              : typeof item.youtubeVideo.tags === "string"
                ? (() => {
                    try {
                      const parsed = JSON.parse(item.youtubeVideo.tags) as unknown;
                      return Array.isArray(parsed)
                        ? parsed.map(String).slice(0, 12)
                        : [];
                    } catch {
                      return [];
                    }
                  })()
                : [],
            durationDisplay: item.youtubeVideo.durationDisplay || "",
            durationSeconds: item.youtubeVideo.durationSeconds || 0,
            format,
            thumbnailUrl:
              item.youtubeVideo.thumbnailUrl ||
              youtubeThumbnailUrl(item.youtubeVideo.videoId) ||
              "",
          }
        : item.youtubeVideoId
          ? {
              videoId: item.youtubeVideoId,
              title: "",
              description: "",
              tags: [],
              durationDisplay: "",
              durationSeconds: 0,
              format: "UNKNOWN",
              thumbnailUrl: youtubeThumbnailUrl(item.youtubeVideoId) || "",
            }
          : null,
    };
  });

  return {
    seriesId: row.id,
    slug: row.slug,
    title: row.title,
    shortTitle: row.shortTitle,
    description: row.description,
    intro: row.intro,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    heroImage: row.heroImage,
    heroImageSource: row.heroImageSource,
    syncMode: row.syncMode,
    youtubePlaylistId: row.youtubePlaylistId,
    youtubePlaylistTitle: row.youtubePlaylistTitle,
    youtubePlaylistDescription: truncate(row.youtubePlaylistDescription || "", 1500),
    youtubePlaylistThumbnail: row.youtubePlaylistThumbnail,
    items,
  };
}
