"use server";

import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  DEFAULT_CADENCE,
  normalizeReleaseCadence,
  setReleaseCadence,
  type ReleaseCadence,
  type ReleaseVideoType,
} from "@/lib/youtube-data/release-cadence";
import {
  zonedLocalToUtc,
  type ReleaseStatus,
} from "@/lib/youtube-data/release-planner";

const RELEASE_STATUSES: ReleaseStatus[] = [
  "BACKLOG",
  "PLANNED",
  "SCHEDULED",
  "PUBLISHED",
  "SKIPPED",
];

const VIDEO_TYPES: ReleaseVideoType[] = ["LONG", "SHORT", "SPECIAL"];

function revalidateYoutube() {
  revalidatePath("/admin/youtube");
}

function parseStatus(value: unknown): ReleaseStatus | null {
  const raw = String(value || "")
    .trim()
    .toUpperCase();
  return RELEASE_STATUSES.includes(raw as ReleaseStatus) ? (raw as ReleaseStatus) : null;
}

function parseVideoType(value: unknown): ReleaseVideoType {
  const raw = String(value || "")
    .trim()
    .toUpperCase();
  return VIDEO_TYPES.includes(raw as ReleaseVideoType)
    ? (raw as ReleaseVideoType)
    : "LONG";
}

function parseOptionalDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function slotReleaseAt(slotKey: string, timeLocal = DEFAULT_CADENCE.timeLocal): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(slotKey.trim());
  if (!match) return null;
  const [hh, mm] = timeLocal.split(":").map(Number);
  return zonedLocalToUtc({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: hh,
    minute: mm,
  });
}

export async function createYoutubeReleaseAction(input: {
  status?: string;
  workingTitle?: string;
  videoType?: string;
  releaseAt?: string | Date | null;
  notes?: string;
  youtubeVideoId?: string | null;
  slotKey?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAccess("youtube");
  const db = getDb();

  const status = parseStatus(input.status) ?? "BACKLOG";
  const workingTitle = String(input.workingTitle || "").trim();
  const videoType = parseVideoType(input.videoType);
  const notes = String(input.notes || "").trim();
  const slotKey = String(input.slotKey || "").trim();
  const youtubeVideoId = String(input.youtubeVideoId || "").trim() || null;
  let releaseAt = parseOptionalDate(input.releaseAt ?? null);

  if (slotKey && !releaseAt) {
    releaseAt = slotReleaseAt(slotKey);
  }

  if (youtubeVideoId) {
    const video = await db.youTubeVideo.findUnique({ where: { videoId: youtubeVideoId } });
    if (!video) return { ok: false, error: "YouTube video not found." };
  }

  const row = await db.youTubeRelease.create({
    data: {
      status,
      workingTitle,
      videoType,
      releaseAt,
      notes,
      slotKey,
      youtubeVideoId,
      timezone: DEFAULT_CADENCE.timezone,
    },
  });

  revalidateYoutube();
  return { ok: true, id: row.id };
}

export async function updateYoutubeReleaseAction(input: {
  id: string;
  status?: string;
  workingTitle?: string;
  videoType?: string;
  releaseAt?: string | Date | null;
  notes?: string;
  skipReason?: string;
  youtubeVideoId?: string | null;
  slotKey?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAccess("youtube");
  const db = getDb();
  const id = String(input.id || "").trim();
  if (!id) return { ok: false, error: "Release id is required." };

  const existing = await db.youTubeRelease.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Release not found." };

  const data: {
    status?: string;
    workingTitle?: string;
    videoType?: string;
    releaseAt?: Date | null;
    notes?: string;
    skipReason?: string;
    youtubeVideoId?: string | null;
    slotKey?: string;
  } = {};

  if (input.status !== undefined) {
    const status = parseStatus(input.status);
    if (!status) return { ok: false, error: "Invalid status." };
    data.status = status;
  }
  if (input.workingTitle !== undefined) data.workingTitle = String(input.workingTitle || "").trim();
  if (input.videoType !== undefined) data.videoType = parseVideoType(input.videoType);
  if (input.notes !== undefined) data.notes = String(input.notes || "").trim();
  if (input.skipReason !== undefined) data.skipReason = String(input.skipReason || "").trim();
  if (input.slotKey !== undefined) data.slotKey = String(input.slotKey || "").trim();
  if (input.releaseAt !== undefined) data.releaseAt = parseOptionalDate(input.releaseAt);

  if (input.youtubeVideoId !== undefined) {
    const youtubeVideoId = String(input.youtubeVideoId || "").trim() || null;
    if (youtubeVideoId) {
      const video = await db.youTubeVideo.findUnique({ where: { videoId: youtubeVideoId } });
      if (!video) return { ok: false, error: "YouTube video not found." };
    }
    data.youtubeVideoId = youtubeVideoId;
  }

  await db.youTubeRelease.update({ where: { id }, data });
  revalidateYoutube();
  return { ok: true };
}

export async function skipYoutubeSlotAction(input: {
  slotKey: string;
  skipReason?: string;
  notes?: string;
  timeLocal?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAccess("youtube");
  const db = getDb();
  const slotKey = String(input.slotKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slotKey)) {
    return { ok: false, error: "slotKey must be YYYY-MM-DD." };
  }

  const timeLocal = String(input.timeLocal || "").trim() || DEFAULT_CADENCE.timeLocal;
  const releaseAt = slotReleaseAt(slotKey, timeLocal);
  if (!releaseAt) return { ok: false, error: "Invalid slotKey." };

  const existing = await db.youTubeRelease.findFirst({
    where: { slotKey, status: "SKIPPED" },
  });
  if (existing) {
    await db.youTubeRelease.update({
      where: { id: existing.id },
      data: {
        skipReason: String(input.skipReason || "").trim(),
        notes: String(input.notes || existing.notes || "").trim(),
        releaseAt,
      },
    });
    revalidateYoutube();
    return { ok: true, id: existing.id };
  }

  const row = await db.youTubeRelease.create({
    data: {
      status: "SKIPPED",
      workingTitle: "",
      videoType: DEFAULT_CADENCE.videoType,
      releaseAt,
      timezone: DEFAULT_CADENCE.timezone,
      slotKey,
      skipReason: String(input.skipReason || "").trim(),
      notes: String(input.notes || "").trim(),
    },
  });

  revalidateYoutube();
  return { ok: true, id: row.id };
}

export async function assignReleaseToSlotAction(input: {
  releaseId: string;
  slotKey: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAccess("youtube");
  const db = getDb();
  const releaseId = String(input.releaseId || "").trim();
  const slotKey = String(input.slotKey || "").trim();
  if (!releaseId) return { ok: false, error: "Release id is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slotKey)) {
    return { ok: false, error: "slotKey must be YYYY-MM-DD." };
  }

  const existing = await db.youTubeRelease.findUnique({ where: { id: releaseId } });
  if (!existing) return { ok: false, error: "Release not found." };

  const releaseAt = slotReleaseAt(slotKey);
  if (!releaseAt) return { ok: false, error: "Invalid slotKey." };

  const nextStatus =
    existing.status === "BACKLOG" || existing.status === "SKIPPED"
      ? "PLANNED"
      : existing.status;

  await db.youTubeRelease.update({
    where: { id: releaseId },
    data: {
      slotKey,
      releaseAt,
      status: nextStatus,
      skipReason: nextStatus === "SKIPPED" ? existing.skipReason : "",
    },
  });

  revalidateYoutube();
  return { ok: true };
}

/**
 * Owner-preferred cadence update. Changing cadence does not rewrite historical
 * release rows — only future open-slot projection uses the new rules.
 */
export async function updateYoutubeReleaseCadenceAction(
  input: Partial<ReleaseCadence>,
): Promise<{ ok: true; cadence: ReleaseCadence } | { ok: false; error: string }> {
  const admin = await requireAccess("youtube");
  if (admin.role !== "owner") {
    return { ok: false, error: "Only owners can update the release cadence." };
  }

  const cadence = await setReleaseCadence(normalizeReleaseCadence({ ...DEFAULT_CADENCE, ...input }));
  revalidateYoutube();
  return { ok: true, cadence };
}
