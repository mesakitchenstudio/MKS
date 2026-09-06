/** Member JWT invalidation — mirrors Admin.sessionVersion after credential changes. */

export function isMemberSessionVersionCurrent(
  cookieSessionVersion: number | undefined,
  persistedSessionVersion: number,
) {
  const cookieSv =
    typeof cookieSessionVersion === "number" && Number.isFinite(cookieSessionVersion)
      ? cookieSessionVersion
      : 0;
  return cookieSv === persistedSessionVersion;
}

export type MemberCredentialLookup = {
  email: string;
  name: string;
  passwordHash: string | null;
};

/** Sign-in resolves members by unique email only — never by display name. */
export function findMemberForCredentialSignIn<T extends MemberCredentialLookup>(
  identifier: string,
  users: T[],
): T | null {
  const key = identifier.trim().toLowerCase();
  if (!key) return null;
  return users.find((user) => user.email.toLowerCase() === key) ?? null;
}

export function countMembersMatchingDisplayName<T extends { name: string }>(
  displayName: string,
  users: T[],
): number {
  const key = displayName.trim().toLowerCase();
  if (!key) return 0;
  return users.filter((user) => user.name.trim().toLowerCase() === key).length;
}

export type PasswordRegistrationDecision =
  | { allowed: true }
  | { allowed: false; reason: "password_account_exists" | "google_only_account" };

/** Password registration must not attach credentials to an existing Google-only row. */
export function evaluatePasswordRegistration(
  existing: { passwordHash: string | null } | null,
): PasswordRegistrationDecision {
  if (!existing) return { allowed: true };
  if (existing.passwordHash) return { allowed: false, reason: "password_account_exists" };
  return { allowed: false, reason: "google_only_account" };
}

/**
 * Whether signup should call the real newsletter subscribe path.
 * Does not write User.notify — NewsletterSubscriber is the source of truth.
 */
export function defaultNotifyForMemberCreation(input: {
  method: "email" | "google";
  explicitNotify?: boolean;
}): boolean {
  if (input.method === "email") return Boolean(input.explicitNotify);
  return false;
}
