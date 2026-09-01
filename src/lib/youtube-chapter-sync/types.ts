export type YoutubeChapterExportSource = "mesa_section" | "synthetic_intro";

export type YoutubeChapterExportItem = {
  timestamp: number;
  label: string;
  source: YoutubeChapterExportSource;
  instructionIndex?: number;
};

export type YoutubeChapterReadinessIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type YoutubeChapterExport = {
  videoId: string;
  items: YoutubeChapterExportItem[];
  ready: boolean;
  errors: YoutubeChapterReadinessIssue[];
  warnings: YoutubeChapterReadinessIssue[];
};

export type ChapterBlockReplacementStrategy =
  | "replace_previous_mesa"
  | "replace_detected"
  | "append"
  | "ambiguous"
  | "already_in_sync";

export type DetectedChapterBlock = {
  start: number;
  end: number;
  text: string;
  lineCount: number;
};

export type YoutubeChapterSyncMetadata = {
  videoId: string;
  lastSyncedAt: string;
  lastSyncedBy: string;
  lastSyncedDescriptionHash: string;
  lastSyncedChapterBlock: string;
  lastSyncedCanonicalFingerprint: string;
  remoteEtag?: string;
};

export type ChapterSyncPreviewOAuth = {
  connected: boolean;
  canReadAnalytics: boolean;
  canWrite: boolean;
  /** Derived from stored granted scopes — not from ?write=1 request alone. */
  writeScopeGranted: boolean;
  reconnectUrl?: string;
};

export type ChapterSyncStatus =
  | "not_synced"
  | "ready_to_sync"
  | "in_sync"
  | "mesa_changed"
  | "youtube_changed"
  | "reconnect_required"
  | "conflict"
  | "not_youtube_ready";
