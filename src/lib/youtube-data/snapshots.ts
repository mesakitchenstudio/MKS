export type VideoSnapshotCounters = {
  viewCount: string;
  likeCount: string;
  commentCount: string;
};

export type ChannelSnapshotCounters = {
  viewCount: string;
  subscriberCount: string;
  videoCount: string;
};

export type SnapshotRecord = {
  recordedAt: Date;
  viewCount: string;
  likeCount: string;
  commentCount: string;
};

export type ChannelSnapshotRecord = {
  recordedAt: Date;
  viewCount: string;
  subscriberCount: string;
  videoCount: string;
};

/** Minimum spacing between periodic snapshots (also used for redundant dedup window). */
export const SNAPSHOT_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function videoSnapshotCountersEqual(
  left: VideoSnapshotCounters,
  right: VideoSnapshotCounters,
): boolean {
  return (
    left.viewCount === right.viewCount &&
    left.likeCount === right.likeCount &&
    left.commentCount === right.commentCount
  );
}

export function channelSnapshotCountersEqual(
  left: ChannelSnapshotCounters,
  right: ChannelSnapshotCounters,
): boolean {
  return (
    left.viewCount === right.viewCount &&
    left.subscriberCount === right.subscriberCount &&
    left.videoCount === right.videoCount
  );
}

export function isRecentSnapshot(recordedAt: Date, windowMs = SNAPSHOT_MIN_INTERVAL_MS): boolean {
  return Date.now() - recordedAt.getTime() < windowMs;
}

/**
 * Skip a new video snapshot when counters match the latest row and the latest
 * snapshot was collected very recently (repeated manual/automatic sync).
 */
export function shouldCreateVideoSnapshot(
  latest: SnapshotRecord | null,
  counters: VideoSnapshotCounters,
): boolean {
  if (!latest) return true;
  if (!videoSnapshotCountersEqual(latest, counters)) return true;
  return !isRecentSnapshot(latest.recordedAt);
}

/**
 * Channel snapshots follow the same dedup rule. Manual force no longer bypasses
 * redundant dedup when counters are unchanged and the latest snapshot is recent.
 */
export function shouldCreateChannelSnapshot(
  latest: ChannelSnapshotRecord | null,
  counters: ChannelSnapshotCounters,
  force: boolean,
): boolean {
  if (!latest) return true;

  const identical = channelSnapshotCountersEqual(latest, counters);
  const recent = isRecentSnapshot(latest.recordedAt);

  if (identical && recent) return false;

  if (!force && recent) return false;

  return true;
}

export function computeViewsGained(
  currentViews: string,
  previousViews: string | undefined,
): string | null {
  if (previousViews === undefined) return null;
  try {
    const diff = BigInt(currentViews) - BigInt(previousViews);
    if (diff < BigInt(0)) return null;
    if (diff === BigInt(0)) return "0";
    return `+${diff.toLocaleString("en-US")}`;
  } catch {
    return null;
  }
}

export function formatViewsGainedDisplay(value: string | null): string {
  return value ?? "—";
}
