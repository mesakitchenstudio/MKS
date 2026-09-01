import type { AggregatedAnalyticsMetrics } from "@/lib/youtube-analytics/aggregate";
import type { YouTubeContentHealthIssue } from "@/lib/youtube-data/types";
import type { YouTubeVideoFormat } from "@/lib/youtube-data/video-format";

export type AttentionPriority = "P0" | "P1" | "P2" | "P3";

export type AttentionActionKind =
  | "open-recipe"
  | "open-video"
  | "link-recipe"
  | "create-recipe"
  | "review-queue";

export type AttentionQueueItem = {
  id: string;
  priority: AttentionPriority;
  rank: number;
  title: string;
  detail: string;
  href?: string;
  actionLabel: string;
  actionKind: AttentionActionKind;
  videoId?: string;
  recipeId?: string;
  possibleMatchRecipeId?: string;
  possibleMatchRecipeTitle?: string;
  filterTarget?: string;
};

export type AttentionVideoInput = {
  videoId: string;
  title: string;
  privacyStatus: string;
  embeddable: boolean;
  format: YouTubeVideoFormat;
  publishedAt: Date | null;
  linkedRecipeId?: string;
  linkedRecipeTitle?: string;
  possibleMatch?: { id: string; title: string; slug: string } | null;
  hasDescriptionChapters: boolean;
  hasRecipeChapters: boolean;
  hasMetadataIssue: boolean;
  analytics: AggregatedAnalyticsMetrics;
};

export type BuildAttentionQueueInput = {
  videos: AttentionVideoInput[];
  healthIssues: YouTubeContentHealthIssue[];
  /** Median period views among public videos with analytics views > 0. */
  catalogMedianPeriodViews: number;
  analyticsConnected: boolean;
};

function sortValuableUnlinked(a: AttentionVideoInput, b: AttentionVideoInput): number {
  const subsDiff = b.analytics.subscribersGained - a.analytics.subscribersGained;
  if (subsDiff !== 0) return subsDiff;
  const viewsDiff = b.analytics.views - a.analytics.views;
  if (viewsDiff !== 0) return viewsDiff;
  const watchDiff = b.analytics.estimatedMinutesWatched - a.analytics.estimatedMinutesWatched;
  if (watchDiff !== 0) return watchDiff;
  const aTime = a.publishedAt?.getTime() ?? 0;
  const bTime = b.publishedAt?.getTime() ?? 0;
  return bTime - aTime;
}

function isValuableUnlinked(video: AttentionVideoInput, medianViews: number): boolean {
  if (video.linkedRecipeId) return false;
  if (video.privacyStatus !== "public" || !video.embeddable) return false;
  if (video.analytics.views <= 0) return false;
  if (medianViews > 0 && video.analytics.views < medianViews) return false;
  return true;
}

const CRITICAL_ISSUE_PREFIXES = ["video-unavailable-", "video-not-embeddable-"];

export function buildAttentionQueue(input: BuildAttentionQueueInput): AttentionQueueItem[] {
  const items: AttentionQueueItem[] = [];
  let rank = 0;

  for (const issue of input.healthIssues) {
    if (!CRITICAL_ISSUE_PREFIXES.some((prefix) => issue.id.startsWith(prefix))) continue;
    items.push({
      id: issue.id,
      priority: "P0",
      rank: rank++,
      title: "Broken live relationship",
      detail: issue.label,
      href: issue.href,
      actionLabel: "Fix relationship",
      actionKind: issue.href?.includes("/recipes/") ? "open-recipe" : "open-video",
    });
  }

  const unlinked = input.videos.filter((video) => !video.linkedRecipeId && video.privacyStatus === "public");
  const withMatch = unlinked
    .filter((video) => video.possibleMatch)
    .sort(sortValuableUnlinked);

  for (const video of withMatch) {
    if (!video.possibleMatch) continue;
    items.push({
      id: `possible-match-${video.videoId}`,
      priority: "P0",
      rank: rank++,
      title: "Possible existing recipe match",
      detail: `${video.title} → ${video.possibleMatch.title}`,
      href: `/admin/youtube/videos/${video.videoId}`,
      actionLabel: "Review match",
      actionKind: "link-recipe",
      videoId: video.videoId,
      possibleMatchRecipeId: video.possibleMatch.id,
      possibleMatchRecipeTitle: video.possibleMatch.title,
    });
  }

  const valuableUnlinked = unlinked
    .filter((video) => !video.possibleMatch && isValuableUnlinked(video, input.catalogMedianPeriodViews))
    .sort(sortValuableUnlinked);

  for (const video of valuableUnlinked.slice(0, 3)) {
    items.push({
      id: `valuable-unlinked-${video.videoId}`,
      priority: "P0",
      rank: rank++,
      title: "High-performing video without recipe",
      detail: video.title,
      href: `/admin/youtube/videos/${video.videoId}`,
      actionLabel: "Create or link",
      actionKind: "create-recipe",
      videoId: video.videoId,
    });
  }

  for (const video of input.videos) {
    if (video.format !== "LONG") continue;
    if (video.linkedRecipeId && !video.hasDescriptionChapters && !video.hasRecipeChapters) {
      items.push({
        id: `long-missing-chapters-${video.videoId}`,
        priority: "P1",
        rank: rank++,
        title: "Long-form video missing Mesa chapters",
        detail: video.title,
        href: video.linkedRecipeId
          ? `/admin/recipes/${video.linkedRecipeId}`
          : `/admin/youtube/videos/${video.videoId}`,
        actionLabel: video.linkedRecipeId ? "Open recipe" : "Open video",
        actionKind: video.linkedRecipeId ? "open-recipe" : "open-video",
        videoId: video.videoId,
        recipeId: video.linkedRecipeId,
      });
    }
  }

  const metadataIssues = input.healthIssues.filter(
    (issue) =>
      !issue.id.startsWith("video-no-recipe-") &&
      !issue.id.startsWith("recipe-no-video-") &&
      !issue.id.startsWith("video-no-chapters-") &&
      !CRITICAL_ISSUE_PREFIXES.some((prefix) => issue.id.startsWith(prefix)),
  );

  for (const issue of metadataIssues) {
    items.push({
      id: issue.id,
      priority: "P2",
      rank: rank++,
      title: "Metadata or content issue",
      detail: issue.label,
      href: issue.href,
      actionLabel: "Review",
      actionKind: issue.href?.includes("/recipes/") ? "open-recipe" : "open-video",
    });
  }

  for (const issue of input.healthIssues.filter((row) => row.id.startsWith("recipe-no-video-"))) {
    items.push({
      id: issue.id,
      priority: "P2",
      rank: rank++,
      title: "Published recipe without video",
      detail: issue.label,
      href: issue.href,
      actionLabel: "Open recipe",
      actionKind: "open-recipe",
    });
  }

  const remainingUnlinked = unlinked.filter(
    (video) =>
      !video.possibleMatch &&
      !isValuableUnlinked(video, input.catalogMedianPeriodViews) &&
      !items.some((item) => item.videoId === video.videoId && item.priority === "P0"),
  );

  if (remainingUnlinked.length > 0) {
    items.push({
      id: "remaining-unlinked-queue",
      priority: "P3",
      rank: rank++,
      title: "Remaining unlinked videos",
      detail: `${remainingUnlinked.length} public videos still need Mesa recipes`,
      actionLabel: "Review all",
      actionKind: "review-queue",
      filterTarget: "needs-recipe",
    });
  }

  return items;
}

export function topAttentionItems(queue: AttentionQueueItem[], limit = 3): AttentionQueueItem[] {
  const priorityOrder: AttentionPriority[] = ["P0", "P1", "P2", "P3"];
  const sorted = [...queue].sort((a, b) => {
    const pDiff = priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
    if (pDiff !== 0) return pDiff;
    return a.rank - b.rank;
  });
  return sorted.slice(0, limit);
}

export function catalogMedianPeriodViews(values: number[]): number {
  const positive = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (!positive.length) return 0;
  const mid = Math.floor(positive.length / 2);
  if (positive.length % 2 === 0) {
    return (positive[mid - 1] + positive[mid]) / 2;
  }
  return positive[mid];
}
