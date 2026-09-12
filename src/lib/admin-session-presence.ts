/**
 * Admin staff session presence timing — client-safe (no DB imports).
 * Heartbeat + Sessions poll use these; server write throttle lives here too
 * so client and server share one source of truth.
 */

/** Dedicated Admin presence heartbeat write throttle (POST /api/admin/presence). */
export const ADMIN_SESSION_PRESENCE_WRITE_THROTTLE_MS = 18_000;

/** Client AdminShell presence heartbeat while the Admin tab is visible. */
export const ADMIN_PRESENCE_HEARTBEAT_MS = 20_000;

/** Owner Sessions panel poll interval while /admin/staff is visible. */
export const ADMIN_STAFF_SESSIONS_POLL_MS = 10_000;

/** “Active now” when lastSeenAt is within this window (covers ~1 missed 20s heartbeat). */
export const ADMIN_SESSION_ACTIVE_NOW_MS = 60_000;

/** Whether the Admin shell should send a presence heartbeat for this visibility state. */
export function shouldRunAdminPresenceHeartbeat(visibilityState: string) {
  return visibilityState !== "hidden";
}

/** Whether the Staff Sessions panel should poll for this visibility state. */
export function shouldPollAdminStaffSessions(visibilityState: string) {
  return visibilityState !== "hidden";
}
