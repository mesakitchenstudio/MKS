/**
 * Phase 2D audience classification (Human / Likely automated / Bot / Unknown).
 * Pure helpers — persist results on GuestVisitor; never use ASN/IP enrichment.
 */

import { classifyGuestClient } from "@/lib/guest-client";

export const GUEST_AUDIENCE_KINDS = [
  "human",
  "likely_automated",
  "bot",
  "unknown",
] as const;

export type GuestAudienceKind = (typeof GUEST_AUDIENCE_KINDS)[number];

/** Machine reason codes stored in clientKindReasons JSON. */
export const GUEST_CLASSIFICATION_REASON_CODES = [
  "known_named_bot_ua",
  "strong_automation_ua",
  "empty_user_agent",
  "unparseable_user_agent",
  "weak_automation_ua",
  "high_pageview_rate",
  "extreme_pageview_rate",
  "same_path_burst",
  "extreme_same_path_burst",
] as const;

export type GuestClassificationReasonCode =
  (typeof GUEST_CLASSIFICATION_REASON_CODES)[number];

export type GuestClassificationResult = {
  kind: GuestAudienceKind;
  reasons: GuestClassificationReasonCode[];
};

export type GuestRecentPageViewSignal = {
  path: string;
  createdAt: Date | string;
};

/**
 * Behavioral thresholds (conservative — normal tabbing / refresh must not trip).
 *
 * Moderate high rate: ≥12 page views in 60s (needs a second signal).
 * Extreme rate alone: ≥25 page views in 60s.
 * Same-path burst: ≥8 identical path hits in 30s (needs a second signal).
 * Extreme same-path alone: ≥20 identical path hits in 30s.
 */
export const GUEST_CLASSIFICATION_THRESHOLDS = {
  rateWindowMs: 60_000,
  moderatePageviewsInWindow: 12,
  extremePageviewsInWindow: 25,
  samePathWindowMs: 30_000,
  samePathBurstCount: 8,
  extremeSamePathBurstCount: 20,
} as const;

const WEAK_AUTOMATION_UA =
  /\b(phantomjs|selenium|webdriver|puppeteer|playwright|cypress|nightmare|slimerjs|htmlunit)\b/i;

const STRONG_AUTOMATION_UA =
  /\b(headlesschrome|scrapy|httpclient|python-requests|go-http-client|java\/|libwww-perl|wget|curl\/)\b/i;

export function guestAudienceKindLabel(kind: GuestAudienceKind) {
  switch (kind) {
    case "human":
      return "Human";
    case "likely_automated":
      return "Likely automated";
    case "bot":
      return "Bot";
    case "unknown":
      return "Unknown";
  }
}

export function guestClassificationReasonLabel(code: GuestClassificationReasonCode) {
  switch (code) {
    case "known_named_bot_ua":
      return "Known crawler user agent";
    case "strong_automation_ua":
      return "Strong automation / library user agent";
    case "empty_user_agent":
      return "User-Agent unavailable";
    case "unparseable_user_agent":
      return "User-Agent could not be recognized as a normal browser";
    case "weak_automation_ua":
      return "Automation-related User-Agent token";
    case "high_pageview_rate":
      return "Unusually high request rate";
    case "extreme_pageview_rate":
      return "Machine-speed request rate";
    case "same_path_burst":
      return "Repeated hits to the same page";
    case "extreme_same_path_burst":
      return "Extreme repeated hits to the same page";
  }
}

export function parseGuestAudienceKind(value: unknown): GuestAudienceKind | null {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if ((GUEST_AUDIENCE_KINDS as readonly string[]).includes(raw)) {
    return raw as GuestAudienceKind;
  }
  // Legacy persisted / filter aliases
  if (raw === "visitor" || raw === "humans" || raw === "human") return "human";
  if (raw === "likely_automated" || raw === "likely-automated" || raw === "automated") {
    return "likely_automated";
  }
  if (raw === "bots" || raw === "bot") return "bot";
  if (raw === "unknown") return "unknown";
  return null;
}

export function serializeGuestClassificationReasons(
  reasons: GuestClassificationReasonCode[],
): string {
  return JSON.stringify(reasons);
}

/** Fields written to GuestVisitor when persisting a classification result. */
export function guestClassificationWriteFields(
  result: GuestClassificationResult,
  at: Date = new Date(),
) {
  return {
    clientKind: result.kind,
    clientKindReasons: serializeGuestClassificationReasons(result.reasons),
    clientKindAt: at,
  };
}

export function parseGuestClassificationReasons(raw: unknown): GuestClassificationReasonCode[] {
  if (raw == null || raw === "") return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    const allowed = new Set<string>(GUEST_CLASSIFICATION_REASON_CODES);
    return parsed.filter(
      (item): item is GuestClassificationReasonCode =>
        typeof item === "string" && allowed.has(item),
    );
  } catch {
    return [];
  }
}

/** KPI / default audience pool: Human only. */
export function isAudienceHumanKind(kind: GuestAudienceKind) {
  return kind === "human";
}

export type GuestKindFilter =
  | "humans"
  | "likely_automated"
  | "bots"
  | "unknown"
  | "all";

export function matchesAudienceKindFilter(
  kind: GuestAudienceKind,
  filter: GuestKindFilter,
) {
  if (filter === "all") return true;
  if (filter === "humans") return kind === "human";
  if (filter === "likely_automated") return kind === "likely_automated";
  if (filter === "bots") return kind === "bot";
  return kind === "unknown";
}

export function parseGuestKindFilter(value: unknown): GuestKindFilter {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "bots" || raw === "bot") return "bots";
  if (raw === "likely_automated" || raw === "likely-automated" || raw === "automated") {
    return "likely_automated";
  }
  if (raw === "unknown") return "unknown";
  if (raw === "all") return "all";
  return "humans";
}

/** Same Human-only gate used by Visitors KPIs and Website Funnel. */
export function isHumanAudienceGuest(input: {
  clientKind?: string | null;
  userAgent?: string | null;
}) {
  return isAudienceHumanKind(resolveGuestAudienceKind(input));
}

/**
 * Resolve audience kind for analytics/UI.
 * Prefer persisted clientKind; fall back to UA-only mapping for historical null rows.
 */
export function resolveGuestAudienceKind(input: {
  clientKind?: string | null;
  userAgent?: string | null;
}): GuestAudienceKind {
  const persisted = parseGuestAudienceKind(input.clientKind);
  if (persisted) return persisted;
  return classifyGuestAudienceFromUserAgent(input.userAgent || "").kind;
}

/** UA-only path used for historical fallback (no behavioral signals). */
export function classifyGuestAudienceFromUserAgent(userAgent: string): GuestClassificationResult {
  return classifyGuestAudience({ userAgent, recentPageViews: [] });
}

function countViewsInWindow(
  views: GuestRecentPageViewSignal[],
  nowMs: number,
  windowMs: number,
) {
  return views.filter((view) => {
    const t = new Date(view.createdAt).getTime();
    return Number.isFinite(t) && nowMs - t <= windowMs && nowMs - t >= 0;
  }).length;
}

function maxSamePathInWindow(
  views: GuestRecentPageViewSignal[],
  nowMs: number,
  windowMs: number,
) {
  const counts = new Map<string, number>();
  for (const view of views) {
    const t = new Date(view.createdAt).getTime();
    if (!Number.isFinite(t) || nowMs - t > windowMs || nowMs - t < 0) continue;
    const path = view.path.trim() || "/";
    counts.set(path, (counts.get(path) || 0) + 1);
  }
  let max = 0;
  for (const n of counts.values()) max = Math.max(max, n);
  return max;
}

/**
 * Full classification with optional recent page-view signals.
 * Conservative: Likely automated needs ≥2 signals, or one documented extreme behavior signal.
 * ASN/datacenter IP is never considered.
 */
export function classifyGuestAudience(input: {
  userAgent: string;
  recentPageViews?: GuestRecentPageViewSignal[];
  now?: Date | number;
}): GuestClassificationResult {
  const ua = input.userAgent.trim();
  const nowMs =
    typeof input.now === "number"
      ? input.now
      : input.now
        ? input.now.getTime()
        : Date.now();
  const recent = input.recentPageViews || [];
  const reasons: GuestClassificationReasonCode[] = [];

  // --- Strong Bot (existing crawler rules preserved via classifyGuestClient) ---
  const uaClass = classifyGuestClient(ua);
  if (uaClass.kind === "bot") {
    // Named crawlers keep a distinct reason; generic bot/crawler/spider + libraries share strong_automation_ua.
    if (uaClass.label !== "Bot") {
      return { kind: "bot", reasons: ["known_named_bot_ua"] };
    }
    return { kind: "bot", reasons: ["strong_automation_ua"] };
  }

  if (STRONG_AUTOMATION_UA.test(ua)) {
    return { kind: "bot", reasons: ["strong_automation_ua"] };
  }

  // --- Unknown ---
  if (!ua) {
    return { kind: "unknown", reasons: ["empty_user_agent"] };
  }
  if (uaClass.kind === "unknown") {
    return { kind: "unknown", reasons: ["unparseable_user_agent"] };
  }

  // --- Behavioral + weak UA signals for Likely automated ---
  const weakUa = WEAK_AUTOMATION_UA.test(ua);
  if (weakUa) reasons.push("weak_automation_ua");

  const {
    rateWindowMs,
    moderatePageviewsInWindow,
    extremePageviewsInWindow,
    samePathWindowMs,
    samePathBurstCount,
    extremeSamePathBurstCount,
  } = GUEST_CLASSIFICATION_THRESHOLDS;

  const viewsInRateWindow = countViewsInWindow(recent, nowMs, rateWindowMs);
  const samePathMax = maxSamePathInWindow(recent, nowMs, samePathWindowMs);

  if (viewsInRateWindow >= extremePageviewsInWindow) {
    reasons.push("extreme_pageview_rate");
  } else if (viewsInRateWindow >= moderatePageviewsInWindow) {
    reasons.push("high_pageview_rate");
  }

  if (samePathMax >= extremeSamePathBurstCount) {
    reasons.push("extreme_same_path_burst");
  } else if (samePathMax >= samePathBurstCount) {
    reasons.push("same_path_burst");
  }

  const extremeAlone =
    reasons.includes("extreme_pageview_rate") ||
    reasons.includes("extreme_same_path_burst");
  const signalCount = reasons.length;

  if (extremeAlone || signalCount >= 2) {
    // Deduplicate while preserving order
    const unique = [...new Set(reasons)];
    return { kind: "likely_automated", reasons: unique };
  }

  return { kind: "human", reasons: [] };
}
