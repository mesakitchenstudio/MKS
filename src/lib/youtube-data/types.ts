export type YouTubeApiChannel = {
  channelId: string;
  title: string;
  description: string;
  customUrl: string;
  publishedAt: string | null;
  thumbnailUrl: string;
  country: string;
  uploadsPlaylistId: string;
  viewCount: string;
  subscriberCount: string;
  hiddenSubscriberCount: boolean;
  videoCount: string;
};

export type YouTubeApiVideo = {
  videoId: string;
  channelId: string;
  title: string;
  description: string;
  publishedAt: string | null;
  thumbnailUrl: string;
  tags: string[];
  categoryId: string;
  durationSeconds: number;
  durationDisplay: string;
  definition: string;
  caption: string;
  privacyStatus: string;
  embeddable: boolean;
  madeForKids: boolean;
  viewCount: string;
  likeCount: string;
  commentCount: string;
};

export type YouTubeSyncResult = {
  ok: boolean;
  channelId?: string;
  videosSynced: number;
  snapshotCreated: boolean;
  error?: string;
  errorCode?: string;
};

export type YouTubeVideoRowStatus =
  | "Healthy"
  | "No recipe"
  | "Unavailable"
  | "Not embeddable"
  | "Missing chapters";

export type YouTubeContentHealthIssue = {
  id: string;
  label: string;
  href?: string;
  kind: "video" | "recipe";
};
