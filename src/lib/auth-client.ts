export type PublicUser = {
  name: string;
  email: string;
  notify?: boolean;
};

const SESSION_KEY = "mesa-session";

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
