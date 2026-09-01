import type { AttentionActionKind, AttentionQueueItem } from "@/lib/youtube-data/attention";

export type AttentionReviewGroupId =
  | "relationship"
  | "chapters"
  | "metadata"
  | "recipes-without-video"
  | "videos-without-recipe";

export type AttentionReviewEntity = {
  id: string;
  entityLabel: string;
  issues: string[];
  href?: string;
  actionLabel: string;
  actionKind: AttentionActionKind;
  videoId?: string;
  recipeId?: string;
  possibleMatchRecipeId?: string;
  possibleMatchRecipeTitle?: string;
  possibleMatchRecipeSlug?: string;
  videoTitle?: string;
};

export type AttentionReviewCollapsedList = {
  count: number;
  summaryLine: string;
  examples: string[];
  moreCount: number;
  topByViews?: { title: string; viewsLabel: string };
  actionLabel: string;
  actionKind: AttentionActionKind;
  filterTarget?: string;
  href?: string;
};

export type AttentionReviewGroup = {
  id: AttentionReviewGroupId;
  label: string;
  entities: AttentionReviewEntity[];
  collapsed?: AttentionReviewCollapsedList;
};

export type BuildAttentionReviewInput = {
  items: AttentionQueueItem[];
  recipesWithoutVideo: Array<{ id: string; title: string }>;
  remainingUnlinkedVideos: Array<{ videoId: string; title: string; periodViews: number }>;
};

const GROUP_ORDER: AttentionReviewGroupId[] = [
  "relationship",
  "chapters",
  "metadata",
  "recipes-without-video",
  "videos-without-recipe",
];

const GROUP_LABELS: Record<AttentionReviewGroupId, string> = {
  relationship: "Relationship / link issues",
  chapters: "Chapter / content issues",
  metadata: "Metadata issues",
  "recipes-without-video": "Recipes without video",
  "videos-without-recipe": "Videos without recipe",
};

export function classifyAttentionReviewGroup(item: AttentionQueueItem): AttentionReviewGroupId | null {
  if (item.id === "remaining-unlinked-queue") return "videos-without-recipe";
  if (item.id.startsWith("recipe-no-video-")) return "recipes-without-video";

  if (
    item.id.startsWith("video-unavailable-") ||
    item.id.startsWith("video-not-embeddable-") ||
    item.id.startsWith("possible-match-") ||
    item.id.startsWith("valuable-unlinked-") ||
    item.actionKind === "link-recipe"
  ) {
    return "relationship";
  }

  if (
    item.id.startsWith("long-missing-chapters-") ||
    item.id.startsWith("video-no-chapters-") ||
    item.id.startsWith("recipe-missing-saved-chapters-")
  ) {
    return "chapters";
  }

  if (item.id.startsWith("title-diff-") || item.id.startsWith("verified-yt-drift-")) {
    return "metadata";
  }

  if (item.id.startsWith("video-no-thumb-")) {
    return "metadata";
  }

  if (item.priority === "P0" && item.title === "Broken live relationship") {
    return "relationship";
  }

  if (item.title.toLowerCase().includes("chapter")) {
    return "chapters";
  }

  if (item.title.toLowerCase().includes("metadata")) {
    return "metadata";
  }

  return "metadata";
}

function recipeIdFromItem(item: AttentionQueueItem): string | undefined {
  if (item.recipeId) return item.recipeId;
  const match = item.href?.match(/\/admin\/recipes\/([^/?#]+)/);
  return match?.[1];
}

function videoIdFromItem(item: AttentionQueueItem): string | undefined {
  if (item.videoId) return item.videoId;
  for (const prefix of [
    "title-diff-",
    "verified-yt-drift-",
    "video-no-chapters-",
    "recipe-missing-saved-chapters-",
    "long-missing-chapters-",
    "video-unavailable-",
    "video-not-embeddable-",
    "possible-match-",
    "valuable-unlinked-",
  ]) {
    if (item.id.startsWith(prefix)) {
      return item.id.slice(prefix.length);
    }
  }
  const match = item.href?.match(/\/admin\/youtube\/videos\/([^/?#]+)/);
  return match?.[1];
}

function entityKey(item: AttentionQueueItem, group: AttentionReviewGroupId): string {
  if (item.actionKind === "link-recipe" && item.possibleMatchRecipeId) {
    return `match:${item.videoId}:${item.possibleMatchRecipeId}`;
  }
  const recipeId = recipeIdFromItem(item);
  if (group === "metadata" && recipeId) return `recipe:${recipeId}`;
  if (group === "chapters" && recipeId) return `recipe:${recipeId}`;
  const videoId = videoIdFromItem(item);
  if (videoId) return `video:${videoId}`;
  return item.id;
}

function entityLabelFromItem(item: AttentionQueueItem): string {
  if (item.possibleMatchRecipeTitle && item.actionKind === "link-recipe") {
    return item.possibleMatchRecipeTitle;
  }
  if (item.videoTitle) return item.videoTitle;
  const quoted = item.detail.match(/[“"]([^”"]+)[”"]/);
  if (quoted?.[1]) return quoted[1];
  return item.detail;
}

function issueLineFromItem(item: AttentionQueueItem): string {
  if (item.actionKind === "link-recipe") {
    return item.videoTitle ? `Video: ${item.videoTitle}` : item.detail;
  }
  if (item.id.startsWith("title-diff-")) {
    return "YouTube title differs from Mesa recipe title";
  }
  if (item.id.startsWith("verified-yt-drift-")) {
    return "YouTube metadata changed since last verification";
  }
  if (item.id.startsWith("recipe-missing-saved-chapters-")) {
    return "YouTube description has chapters but Mesa recipe does not";
  }
  if (item.id.startsWith("long-missing-chapters-") || item.id.startsWith("video-no-chapters-")) {
    return "Missing Mesa chapters";
  }
  return item.detail;
}

function actionForItem(item: AttentionQueueItem, group: AttentionReviewGroupId): {
  actionLabel: string;
  actionKind: AttentionActionKind;
} {
  if (item.actionKind === "link-recipe") {
    return { actionLabel: "Link recipe", actionKind: "link-recipe" };
  }
  if (group === "chapters") {
    return { actionLabel: "Review chapters", actionKind: item.actionKind };
  }
  if (group === "metadata" || group === "relationship") {
    if (item.href?.includes("/admin/recipes/")) {
      return { actionLabel: "Review recipe", actionKind: "open-recipe" };
    }
    if (item.actionKind === "create-recipe") {
      return { actionLabel: "Create recipe", actionKind: "create-recipe" };
    }
    return { actionLabel: "Review recipe", actionKind: item.actionKind };
  }
  return { actionLabel: item.actionLabel, actionKind: item.actionKind };
}

function mergeEntity(target: AttentionReviewEntity, item: AttentionQueueItem, group: AttentionReviewGroupId) {
  const line = issueLineFromItem(item);
  if (!target.issues.includes(line)) {
    target.issues.push(line);
  }
  const action = actionForItem(item, group);
  target.actionLabel = action.actionLabel;
  target.actionKind = action.actionKind;
  if (item.href) target.href = item.href;
  if (item.videoId) target.videoId = item.videoId;
  if (item.recipeId) target.recipeId = item.recipeId;
}

export function buildAttentionReviewGroups(input: BuildAttentionReviewInput): AttentionReviewGroup[] {
  const entityBuckets = new Map<AttentionReviewGroupId, Map<string, AttentionReviewEntity>>();

  for (const item of input.items) {
    if (item.id === "remaining-unlinked-queue" || item.id.startsWith("recipe-no-video-")) {
      continue;
    }

    const group = classifyAttentionReviewGroup(item);
    if (!group || group === "recipes-without-video" || group === "videos-without-recipe") continue;

    const key = entityKey(item, group);
    if (!entityBuckets.has(group)) entityBuckets.set(group, new Map());
    const bucket = entityBuckets.get(group)!;

    const action = actionForItem(item, group);
    const existing = bucket.get(key);
    if (existing) {
      mergeEntity(existing, item, group);
      continue;
    }

    bucket.set(key, {
      id: key,
      entityLabel: entityLabelFromItem(item),
      issues: [issueLineFromItem(item)],
      href: item.href,
      actionLabel: action.actionLabel,
      actionKind: action.actionKind,
      videoId: item.videoId,
      recipeId: item.recipeId,
      possibleMatchRecipeId: item.possibleMatchRecipeId,
      possibleMatchRecipeTitle: item.possibleMatchRecipeTitle,
      possibleMatchRecipeSlug: item.possibleMatchRecipeSlug,
      videoTitle: item.videoTitle,
    });
  }

  const groups: AttentionReviewGroup[] = [];

  for (const groupId of GROUP_ORDER) {
    if (groupId === "recipes-without-video") {
      const count = input.recipesWithoutVideo.length;
      if (count === 0) continue;
      const examples = input.recipesWithoutVideo.slice(0, 3).map((row) => row.title);
      groups.push({
        id: groupId,
        label: GROUP_LABELS[groupId],
        entities: [],
        collapsed: {
          count,
          summaryLine: `${count} published recipe${count === 1 ? "" : "s"} have no YouTube video`,
          examples,
          moreCount: Math.max(0, count - examples.length),
          actionLabel: "View recipes",
          actionKind: "open-recipe",
          href: "/admin/recipes",
        },
      });
      continue;
    }

    if (groupId === "videos-without-recipe") {
      const count = input.remainingUnlinkedVideos.length;
      if (count === 0) continue;
      const sorted = [...input.remainingUnlinkedVideos].sort((a, b) => b.periodViews - a.periodViews);
      const top = sorted[0];
      groups.push({
        id: groupId,
        label: GROUP_LABELS[groupId],
        entities: [],
        collapsed: {
          count,
          summaryLine: `${count} public video${count === 1 ? "" : "s"} still need Mesa recipes`,
          examples: [],
          moreCount: 0,
          topByViews: top
            ? {
                title: top.title,
                viewsLabel: top.periodViews.toLocaleString("en-US"),
              }
            : undefined,
          actionLabel: "View videos",
          actionKind: "review-queue",
          filterTarget: "needs-recipe",
        },
      });
      continue;
    }

    const bucket = entityBuckets.get(groupId);
    if (!bucket?.size) continue;

    groups.push({
      id: groupId,
      label: GROUP_LABELS[groupId],
      entities: [...bucket.values()],
    });
  }

  return groups;
}
