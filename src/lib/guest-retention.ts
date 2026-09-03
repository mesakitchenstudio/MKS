import { getDb } from "@/lib/db";
import {
  getGuestRetentionConfig,
  guestRetentionCutoff,
  type GuestRetentionConfig,
} from "@/lib/guest-retention-config";

/**
 * Batching: each lifecycle step runs up to MAX_BATCHES of BATCH_SIZE id-selects,
 * then DB-side update/delete by those ids. Stops early when a batch returns fewer
 * than BATCH_SIZE rows. Caps total work per invocation to avoid serverless timeouts
 * while still clearing meaningful backlog (vs one batch/day).
 *
 * Vercel serverless cron budget is typically tens of seconds; 20×500 = 10k rows/step
 * is a conservative daily-pass ceiling (4 steps × 10k worst-case theoretical).
 */
export const GUEST_RETENTION_BATCH_SIZE = 500;
export const GUEST_RETENTION_MAX_BATCHES_PER_STEP = 20;

export type GuestRetentionRunResult = {
  ok: boolean;
  presenceDeleted: number;
  visitorIpsScrubbed: number;
  pageViewIpsScrubbed: number;
  inactiveVisitorsDeleted: number;
  /** True when any step hit the max-batch ceiling (more eligible rows remain). */
  truncated: boolean;
  config: GuestRetentionConfig;
  errors: string[];
};

type BatchStepResult = { count: number; truncated: boolean };

function hasStoredIpWhere() {
  return {
    AND: [{ ip: { not: null } }, { ip: { not: "" } }],
  };
}

async function deleteStalePresence(cutoff: Date): Promise<BatchStepResult> {
  const db = getDb();
  let total = 0;
  for (let batchIndex = 0; batchIndex < GUEST_RETENTION_MAX_BATCHES_PER_STEP; batchIndex += 1) {
    const batch = await db.guestPresenceSession.findMany({
      where: { lastSeenAt: { lt: cutoff } },
      select: { id: true },
      take: GUEST_RETENTION_BATCH_SIZE,
    });
    if (!batch.length) return { count: total, truncated: false };
    const result = await db.guestPresenceSession.deleteMany({
      where: { id: { in: batch.map((row) => row.id) } },
    });
    total += result.count;
    if (batch.length < GUEST_RETENTION_BATCH_SIZE) return { count: total, truncated: false };
  }
  return { count: total, truncated: true };
}

async function scrubExpiredPageViewIps(cutoff: Date): Promise<BatchStepResult> {
  const db = getDb();
  let total = 0;
  for (let batchIndex = 0; batchIndex < GUEST_RETENTION_MAX_BATCHES_PER_STEP; batchIndex += 1) {
    const batch = await db.guestPageView.findMany({
      where: {
        createdAt: { lt: cutoff },
        ...hasStoredIpWhere(),
      },
      select: { id: true },
      take: GUEST_RETENTION_BATCH_SIZE,
    });
    if (!batch.length) return { count: total, truncated: false };
    const result = await db.guestPageView.updateMany({
      where: { id: { in: batch.map((row) => row.id) } },
      data: { ip: null },
    });
    total += result.count;
    if (batch.length < GUEST_RETENTION_BATCH_SIZE) return { count: total, truncated: false };
  }
  return { count: total, truncated: true };
}

/**
 * Scrub visitor IPs whose age (ipUpdatedAt, else lastSeenAt) is older than the network window.
 * Omits networkScrubbedAt — `ip IS NOT NULL / not ''` is sufficient for idempotent re-runs.
 */
async function scrubExpiredVisitorIps(cutoff: Date): Promise<BatchStepResult> {
  const db = getDb();
  let total = 0;
  for (let batchIndex = 0; batchIndex < GUEST_RETENTION_MAX_BATCHES_PER_STEP; batchIndex += 1) {
    const batch = await db.guestVisitor.findMany({
      where: {
        ...hasStoredIpWhere(),
        OR: [
          { ipUpdatedAt: { lt: cutoff } },
          { AND: [{ ipUpdatedAt: null }, { lastSeenAt: { lt: cutoff } }] },
        ],
      },
      select: { id: true },
      take: GUEST_RETENTION_BATCH_SIZE,
    });
    if (!batch.length) return { count: total, truncated: false };
    const result = await db.guestVisitor.updateMany({
      where: { id: { in: batch.map((row) => row.id) } },
      data: { ip: null },
    });
    total += result.count;
    if (batch.length < GUEST_RETENTION_BATCH_SIZE) return { count: total, truncated: false };
  }
  return { count: total, truncated: true };
}

async function deleteInactiveVisitors(cutoff: Date): Promise<BatchStepResult> {
  const db = getDb();
  let total = 0;
  for (let batchIndex = 0; batchIndex < GUEST_RETENTION_MAX_BATCHES_PER_STEP; batchIndex += 1) {
    const batch = await db.guestVisitor.findMany({
      where: { lastSeenAt: { lt: cutoff } },
      select: { id: true },
      take: GUEST_RETENTION_BATCH_SIZE,
    });
    if (!batch.length) return { count: total, truncated: false };
    // Cascade removes page views, funnel events, and presence sessions.
    const result = await db.guestVisitor.deleteMany({
      where: { id: { in: batch.map((row) => row.id) } },
    });
    total += result.count;
    if (batch.length < GUEST_RETENTION_BATCH_SIZE) return { count: total, truncated: false };
  }
  return { count: total, truncated: true };
}

/**
 * Daily lifecycle:
 * 1) stale presence (operational)
 * 2) IP scrub (privacy-minimizing; visitors/pageviews remain)
 * 3) inactive guest delete last (cascades related rows)
 *
 * Order is safe: presence is independent; scrubbing before delete is idempotent waste at worst;
 * deleting last avoids racing with IP scrub on rows about to vanish, and cascade cleans children.
 */
export async function runGuestRetentionLifecycle(input?: {
  now?: Date;
  env?: Record<string, string | undefined>;
}): Promise<GuestRetentionRunResult> {
  const now = input?.now ?? new Date();
  const config = getGuestRetentionConfig(input?.env);
  const result: GuestRetentionRunResult = {
    ok: true,
    presenceDeleted: 0,
    visitorIpsScrubbed: 0,
    pageViewIpsScrubbed: 0,
    inactiveVisitorsDeleted: 0,
    truncated: false,
    config,
    errors: [],
  };

  const presenceCutoff = guestRetentionCutoff(config.presenceRetentionDays, now);
  const networkCutoff = guestRetentionCutoff(config.networkRetentionDays, now);
  const inactiveCutoff = guestRetentionCutoff(config.inactiveRetentionDays, now);

  try {
    const step = await deleteStalePresence(presenceCutoff);
    result.presenceDeleted = step.count;
    result.truncated = result.truncated || step.truncated;
  } catch (error) {
    result.ok = false;
    result.errors.push("presence_delete_failed");
    console.error("guest retention: presence delete failed", error);
  }

  try {
    const step = await scrubExpiredPageViewIps(networkCutoff);
    result.pageViewIpsScrubbed = step.count;
    result.truncated = result.truncated || step.truncated;
  } catch (error) {
    result.ok = false;
    result.errors.push("pageview_ip_scrub_failed");
    console.error("guest retention: pageview IP scrub failed", error);
  }

  try {
    const step = await scrubExpiredVisitorIps(networkCutoff);
    result.visitorIpsScrubbed = step.count;
    result.truncated = result.truncated || step.truncated;
  } catch (error) {
    result.ok = false;
    result.errors.push("visitor_ip_scrub_failed");
    console.error("guest retention: visitor IP scrub failed", error);
  }

  try {
    const step = await deleteInactiveVisitors(inactiveCutoff);
    result.inactiveVisitorsDeleted = step.count;
    result.truncated = result.truncated || step.truncated;
  } catch (error) {
    result.ok = false;
    result.errors.push("inactive_visitor_delete_failed");
    console.error("guest retention: inactive visitor delete failed", error);
  }

  return result;
}
