export type PublicUser = {
  name: string;
  email: string;
  notify?: boolean;
};

const SESSION_KEY = "mesa-session";
const PRESENCE_SESSION_KEY = "mesa-presence-session";

export function readSession(): PublicUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  } catch {
    return null;
  }
}

export function writeSession(user: PublicUser) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ name: user.name, email: user.email, notify: user.notify }),
  );
  emitSessionChanged();
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY);
  emitSessionChanged();
}

/** Clear local + Auth.js session after the server rejects a deleted/expired member. */
export async function forcePublicSignOut() {
  if (typeof window === "undefined") return;
  try {
    await clearMemberPresenceSession();
  } catch {
    // Presence clear is best-effort once the member row is already gone.
  }
  signOut();
  try {
    const { signOut: signOutGoogle } = await import("next-auth/react");
    await signOutGoogle({ redirect: false });
  } catch {
    // Cookie clear may already have been handled by the Auth.js session callback.
  }
}

export class MemberSessionExpiredError extends Error {
  constructor(message = "Your session has expired. Please sign in again.") {
    super(message);
    this.name = "MemberSessionExpiredError";
  }
}

/** Stable per-tab presence id so one closed tab cannot clear another tab's Online row. */
export function getPresenceSessionKey() {
  if (typeof window === "undefined") return "";
  try {
    let key = sessionStorage.getItem(PRESENCE_SESSION_KEY)?.trim() || "";
    if (!key || key.length > 80 || !/^[A-Za-z0-9_-]+$/.test(key)) {
      key = crypto.randomUUID().replace(/-/g, "");
      sessionStorage.setItem(PRESENCE_SESSION_KEY, key);
    }
    return key;
  } catch {
    return "";
  }
}

/** Clear this tab's presence row while the auth cookie is still valid (logout = immediate). */
export async function clearMemberPresenceSession() {
  if (typeof window === "undefined") return;
  const sessionKey = getPresenceSessionKey();
  if (!sessionKey) return;
  const payload = JSON.stringify({ clear: true, immediate: true, sessionKey });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const ok = navigator.sendBeacon(
        "/api/account/presence",
        new Blob([payload], { type: "application/json" }),
      );
      if (ok) return;
    }
    await fetch("/api/account/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });
  } catch {
    // Best-effort; TTL still expires the row if this fails.
  }
}

/** Soft disconnect for pagehide — keeps Online briefly for refresh/restore. */
export function signalMemberPresenceDisconnect() {
  if (typeof window === "undefined") return;
  const sessionKey = getPresenceSessionKey();
  if (!sessionKey) return;
  const payload = JSON.stringify({ clear: true, immediate: false, sessionKey });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const ok = navigator.sendBeacon(
        "/api/account/presence",
        new Blob([payload], { type: "application/json" }),
      );
      if (ok) return;
    }
    void fetch("/api/account/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });
  } catch {
    // Best-effort; stale TTL covers hard crashes.
  }
}

const BRAND_NAME_BLOCKLIST = new Set(["mesa kitchen studio", "mesa"]);

function normalizeIdentity(value: string) {
  return value.trim().toLowerCase();
}

function isUsableDisplayName(value: string, email: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const key = normalizeIdentity(trimmed);
  if (key === normalizeIdentity(email)) return false;
  if (BRAND_NAME_BLOCKLIST.has(key)) return false;
  return true;
}

/**
 * Canonical member label for profile + account menu.
 * Prefer full/display name → email local-part (username) → email.
 */
export function resolveMemberDisplayName(input: {
  name?: string | null;
  email: string;
  username?: string | null;
}) {
  const email = input.email.trim();
  const candidates = [input.name, input.username]
    .map((value) => value?.trim() || "")
    .filter((value) => isUsableDisplayName(value, email));

  if (candidates[0]) return candidates[0];

  const localPart = email.split("@")[0]?.trim() || "";
  if (localPart && isUsableDisplayName(localPart, email)) return localPart;

  return email;
}

/** Primary + optional secondary lines for account identity UI (avoids duplicating email). */
export function memberIdentityLines(input: {
  name?: string | null;
  email: string;
  username?: string | null;
}) {
  const email = input.email.trim();
  const primary = resolveMemberDisplayName(input);
  if (normalizeIdentity(primary) === normalizeIdentity(email)) {
    return { primary: email, secondary: null as string | null };
  }
  return { primary, secondary: email };
}

export function firstName(user: PublicUser) {
  const display = resolveMemberDisplayName(user);
  if (normalizeIdentity(display) === normalizeIdentity(user.email)) {
    return user.email.split("@")[0] || user.email;
  }
  const fromName = display.split(/\s+/)[0];
  return fromName || user.email.split("@")[0];
}

function emitSessionChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("mesa-session-changed"));
}
