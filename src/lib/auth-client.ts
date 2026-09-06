export type PublicUser = {
  name: string;
  email: string;
  notify?: boolean;
};

const SESSION_KEY = "mesa-session";
const PRESENCE_SESSION_KEY = "mesa-presence-session";
/** Browser-local registry of tab presence keys (not shared with other devices). */
const MEMBER_PRESENCE_KEYS_STORAGE = "mesa-member-presence-keys";
const MEMBER_LOGOUT_CHANNEL = "mesa-member-logout";
const MEMBER_LOGOUT_STORAGE_KEY = "mesa-member-logout-at";

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
    await clearMemberPresenceOnLogout();
  } catch {
    // Presence clear is best-effort once the member row is already gone.
  }
  signOut();
  try {
    const { disableGoogleOneTapAutoSelect } = await import("@/components/GoogleOneTap");
    disableGoogleOneTapAutoSelect();
  } catch {
    // Optional GIS helper.
  }
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

function normalizePresenceKey(value: string) {
  const key = value.trim();
  if (!key || key.length > 80 || !/^[A-Za-z0-9_-]+$/.test(key)) return "";
  return key;
}

function readRegisteredMemberPresenceKeys() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const raw = localStorage.getItem(MEMBER_PRESENCE_KEYS_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizePresenceKey(String(item))).filter(Boolean);
  } catch {
    return [];
  }
}

/** Remember this tab's presence key so logout can clear every tab in this browser. */
export function registerMemberPresenceKey(sessionKey: string) {
  const key = normalizePresenceKey(sessionKey);
  if (!key || typeof window === "undefined") return;
  try {
    const keys = new Set(readRegisteredMemberPresenceKeys());
    keys.add(key);
    localStorage.setItem(MEMBER_PRESENCE_KEYS_STORAGE, JSON.stringify([...keys]));
  } catch {
    // ignore storage failures
  }
}

function clearRegisteredMemberPresenceKeys() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(MEMBER_PRESENCE_KEYS_STORAGE);
  } catch {
    // ignore
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
    registerMemberPresenceKey(key);
    return key;
  } catch {
    return "";
  }
}

async function postMemberPresenceClear(sessionKey: string, immediate: boolean) {
  const key = normalizePresenceKey(sessionKey);
  if (!key) return false;
  const payload = JSON.stringify({ clear: true, immediate, sessionKey: key });
  const response = await fetch("/api/account/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: payload,
    keepalive: true,
  });
  return response.ok;
}

/**
 * Clear this tab's presence row while the auth cookie is still valid.
 * Prefer awaited fetch — sendBeacon races with signOut and often arrives unauthenticated.
 */
export async function clearMemberPresenceSession() {
  if (typeof window === "undefined") return;
  const sessionKey = getPresenceSessionKey();
  if (!sessionKey) return;
  try {
    await postMemberPresenceClear(sessionKey, true);
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

function broadcastMemberLogout() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MEMBER_LOGOUT_STORAGE_KEY, String(Date.now()));
  } catch {
    // ignore
  }
  try {
    const channel = new BroadcastChannel(MEMBER_LOGOUT_CHANNEL);
    channel.postMessage({ type: "logout" });
    channel.close();
  } catch {
    // storage event still covers same-origin tabs
  }
}

/** Sibling tabs stop member heartbeats when this browser session logs out. */
export function subscribeMemberLogout(onLogout: () => void) {
  if (typeof window === "undefined") return () => undefined;

  function onStorage(event: StorageEvent) {
    if (event.key === MEMBER_LOGOUT_STORAGE_KEY && event.newValue) onLogout();
  }

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(MEMBER_LOGOUT_CHANNEL);
    channel.onmessage = (event) => {
      if (event?.data?.type === "logout") onLogout();
    };
  } catch {
    channel = null;
  }

  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
    try {
      channel?.close();
    } catch {
      // ignore
    }
  };
}

/**
 * Explicit logout presence cleanup for this browser only.
 * Clears every tab connection registered in localStorage (not other devices),
 * then signals sibling tabs to stop member heartbeats — all while auth is still valid.
 */
export async function clearMemberPresenceOnLogout() {
  if (typeof window === "undefined") return;

  broadcastMemberLogout();

  const keys = new Set(readRegisteredMemberPresenceKeys());
  const current = normalizePresenceKey(getPresenceSessionKey());
  if (current) keys.add(current);

  await Promise.all(
    [...keys].map(async (sessionKey) => {
      try {
        await postMemberPresenceClear(sessionKey, true);
      } catch {
        // continue clearing remaining keys
      }
    }),
  );

  clearRegisteredMemberPresenceKeys();
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
