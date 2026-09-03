/**
 * Phase 2E guest retention configuration.
 * Defaults are operational (not legal/compliance claims).
 */

export const GUEST_RETENTION_DEFAULTS = {
  presenceRetentionDays: 7,
  networkRetentionDays: 30,
  inactiveRetentionDays: 400,
} as const;

export type GuestRetentionConfig = {
  presenceRetentionDays: number;
  networkRetentionDays: number;
  inactiveRetentionDays: number;
};

/** Safe positive integer days; zero/negative/malformed fall back to default. */
export function parseGuestRetentionDays(
  raw: unknown,
  fallback: number,
): number {
  if (raw == null) return fallback;
  const text = String(raw).trim();
  if (!text) return fallback;
  if (!/^\d+$/.test(text)) return fallback;
  const n = Number(text);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  // Guard absurd values that could disable retention or starve ops.
  if (n > 3650) return fallback;
  return n;
}

export function getGuestRetentionConfig(
  env: Record<string, string | undefined> = process.env,
): GuestRetentionConfig {
  return {
    presenceRetentionDays: parseGuestRetentionDays(
      env.GUEST_PRESENCE_RETENTION_DAYS,
      GUEST_RETENTION_DEFAULTS.presenceRetentionDays,
    ),
    networkRetentionDays: parseGuestRetentionDays(
      env.GUEST_NETWORK_RETENTION_DAYS,
      GUEST_RETENTION_DEFAULTS.networkRetentionDays,
    ),
    inactiveRetentionDays: parseGuestRetentionDays(
      env.GUEST_INACTIVE_RETENTION_DAYS,
      GUEST_RETENTION_DEFAULTS.inactiveRetentionDays,
    ),
  };
}

export function guestRetentionCutoff(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** True when a stored IP string still holds network data. */
export function guestIpIsPresent(ip: string | null | undefined): boolean {
  const value = String(ip ?? "").trim();
  return Boolean(value) && value !== "unknown";
}

/**
 * Visitor IP age basis: prefer ipUpdatedAt (set whenever IP is written on ingest).
 * Historical rows without ipUpdatedAt fall back to lastSeenAt (same touches that refresh IP).
 */
export function guestVisitorIpAgeAt(input: {
  ipUpdatedAt?: Date | string | null;
  lastSeenAt: Date | string;
}): Date {
  if (input.ipUpdatedAt) return new Date(input.ipUpdatedAt);
  return new Date(input.lastSeenAt);
}

export function shouldScrubGuestVisitorIp(input: {
  ip?: string | null;
  ipUpdatedAt?: Date | string | null;
  lastSeenAt: Date | string;
  networkCutoff: Date;
}): boolean {
  if (!guestIpIsPresent(input.ip)) return false;
  return guestVisitorIpAgeAt(input).getTime() < input.networkCutoff.getTime();
}

export function shouldScrubGuestPageViewIp(input: {
  ip?: string | null;
  createdAt: Date | string;
  networkCutoff: Date;
}): boolean {
  if (!guestIpIsPresent(input.ip)) return false;
  return new Date(input.createdAt).getTime() < input.networkCutoff.getTime();
}

export function shouldDeleteStalePresence(input: {
  lastSeenAt: Date | string;
  presenceCutoff: Date;
}): boolean {
  return new Date(input.lastSeenAt).getTime() < input.presenceCutoff.getTime();
}

export function shouldDeleteInactiveGuest(input: {
  lastSeenAt: Date | string;
  inactiveCutoff: Date;
}): boolean {
  return new Date(input.lastSeenAt).getTime() < input.inactiveCutoff.getTime();
}
