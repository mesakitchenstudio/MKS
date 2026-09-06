import { getSiteSetting, setSiteSetting, SITE_SETTING_KEYS } from "@/lib/site-settings";

/** Canonical planner timezone for Mesa Kitchen Studio. */
export const RELEASE_TIMEZONE = "Europe/Istanbul";

/** Planner calendar starts September 2026 (no Jan–Aug 2026 slots). */
export const PLANNER_START_DATE = "2026-09-01";

/**
 * Default long-form Friday 15:00 Istanbul cadence.
 * weekday uses JS convention: 0=Sun … 5=Fri … 6=Sat.
 */
export const DEFAULT_CADENCE: ReleaseCadence = {
  weekday: 5,
  timeLocal: "15:00",
  timezone: RELEASE_TIMEZONE,
  videoType: "LONG",
  effectiveFrom: PLANNER_START_DATE,
  plannerStart: PLANNER_START_DATE,
};

export type ReleaseVideoType = "LONG" | "SHORT" | "SPECIAL";

export type ReleaseCadence = {
  /** JS weekday: 0=Sunday … 5=Friday. */
  weekday: number;
  /** Local wall clock in `timezone`, HH:mm. */
  timeLocal: string;
  timezone: string;
  videoType: ReleaseVideoType;
  /** ISO date (YYYY-MM-DD). Slots before this date are not projected. */
  effectiveFrom: string;
  /** ISO date (YYYY-MM-DD). Hard planner floor (Sep 2026). */
  plannerStart: string;
};

function isVideoType(value: unknown): value is ReleaseVideoType {
  return value === "LONG" || value === "SHORT" || value === "SPECIAL";
}

function parseTimeLocal(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return null;
  const [hRaw, mRaw] = trimmed.split(":");
  const hour = Number(hRaw);
  const minute = Number(mRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return trimmed;
}

/**
 * Normalize persisted / partial cadence JSON onto defaults.
 * Changing cadence must NOT rewrite history: past PLANNED/SKIPPED/PUBLISHED rows and
 * their slotKeys stay as stored; only future open-slot projection uses the new rules.
 */
export function normalizeReleaseCadence(raw: unknown): ReleaseCadence {
  const base = { ...DEFAULT_CADENCE };
  if (!raw || typeof raw !== "object") return base;
  const input = raw as Record<string, unknown>;

  const weekday = Number(input.weekday);
  if (Number.isInteger(weekday) && weekday >= 0 && weekday <= 6) {
    base.weekday = weekday;
  }

  const timeLocal = parseTimeLocal(input.timeLocal);
  if (timeLocal) base.timeLocal = timeLocal;

  if (typeof input.timezone === "string" && input.timezone.trim()) {
    base.timezone = input.timezone.trim();
  }

  if (isVideoType(input.videoType)) base.videoType = input.videoType;

  const effectiveFrom = parseIsoDate(input.effectiveFrom);
  if (effectiveFrom) base.effectiveFrom = effectiveFrom;

  const plannerStart = parseIsoDate(input.plannerStart);
  if (plannerStart) base.plannerStart = plannerStart;

  // Never allow plannerStart earlier than the product floor.
  if (base.plannerStart < PLANNER_START_DATE) {
    base.plannerStart = PLANNER_START_DATE;
  }

  return base;
}

export async function getReleaseCadence(): Promise<ReleaseCadence> {
  const raw = await getSiteSetting(SITE_SETTING_KEYS.youtubeReleaseCadence);
  if (!raw) return { ...DEFAULT_CADENCE };
  try {
    return normalizeReleaseCadence(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_CADENCE };
  }
}

/**
 * Persist cadence JSON. Callers must treat this as forward-looking only:
 * existing release rows, skip reasons, and historical slot assignments are left untouched.
 */
export async function setReleaseCadence(cadence: ReleaseCadence): Promise<ReleaseCadence> {
  const normalized = normalizeReleaseCadence(cadence);
  await setSiteSetting(SITE_SETTING_KEYS.youtubeReleaseCadence, JSON.stringify(normalized));
  return normalized;
}
