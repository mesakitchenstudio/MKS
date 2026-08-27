import { isAdminPasswordLongEnough, MIN_ADMIN_PASSWORD_LENGTH } from "@/lib/passwords";

export { MIN_ADMIN_PASSWORD_LENGTH };

/** Practical email check for admin account forms (not a full RFC parser). */
export function isValidAdminEmail(email: string) {
  const value = email.trim().toLowerCase();
  if (!value || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizeAdminEmail(email: string) {
  return email.trim().toLowerCase();
}

export type StaffMutationError = "self-role" | "last-owner" | "self" | "missing";

/** True when the actor is editing their own staff row (named id, email, or env owner). */
export function isCurrentStaffAccount(
  actor: { id: string; email: string },
  admin: { id: string; email: string },
  envOwnerEmail = process.env.ADMIN_EMAIL || "",
) {
  if (actor.id && actor.id !== "env" && actor.id === admin.id) return true;

  const actorEmail = normalizeAdminEmail(actor.email);
  const adminEmail = normalizeAdminEmail(admin.email);
  if (actorEmail && adminEmail && actorEmail === adminEmail) return true;

  if (actor.id === "env") {
    const envEmail = normalizeAdminEmail(envOwnerEmail);
    if (envEmail && adminEmail === envEmail) return true;
  }

  return false;
}

/** Signed-in owner must not change their own access level in the UI. */
export function shouldLockOwnerAccessSelect(
  actor: { id: string; email: string; role: string },
  admin: { id: string; email: string; role: string },
  envOwnerEmail = process.env.ADMIN_EMAIL || "",
) {
  return admin.role === "owner" && isCurrentStaffAccount(actor, admin, envOwnerEmail);
}

/** Role changes for the signed-in owner are locked; studio must keep ≥1 owner. */
export function validateAdminRoleChange(input: {
  actorId: string;
  actorEmail?: string;
  targetId: string;
  targetEmail?: string;
  currentRole: string;
  nextRole: string;
  ownerCount: number;
}): { ok: true; role: string } | { ok: false; error: StaffMutationError } {
  const {
    actorId,
    actorEmail = "",
    targetId,
    targetEmail = "",
    currentRole,
    nextRole,
    ownerCount,
  } = input;

  const editingSelf = isCurrentStaffAccount(
    { id: actorId, email: actorEmail },
    { id: targetId, email: targetEmail },
  );

  if (editingSelf && currentRole === "owner" && nextRole !== "owner") {
    return { ok: false, error: "self-role" };
  }

  if (currentRole === "owner" && nextRole !== "owner" && ownerCount <= 1) {
    return { ok: false, error: "last-owner" };
  }

  // Signed-in owner always stays owner even if the form is tampered with.
  if (editingSelf && currentRole === "owner") {
    return { ok: true, role: "owner" };
  }

  return { ok: true, role: nextRole };
}

export function validateAdminDeletion(input: {
  actorId: string;
  targetId: string;
  targetRole: string;
  ownerCount: number;
}): { ok: true } | { ok: false; error: StaffMutationError } {
  if (!input.targetId) return { ok: false, error: "missing" };
  if (input.targetId === input.actorId) return { ok: false, error: "self" };
  if (input.targetRole === "owner" && input.ownerCount <= 1) {
    return { ok: false, error: "last-owner" };
  }
  return { ok: true };
}

export function isAcceptableAdminPassword(password: string, { required }: { required: boolean }) {
  if (!password) return !required;
  return isAdminPasswordLongEnough(password);
}

/** Blank means keep the existing hash; non-empty must meet the minimum length. */
export function shouldUpdateAdminPassword(password: string) {
  return Boolean(password) && isAdminPasswordLongEnough(password);
}

export function emailsConflictCaseInsensitive(left: string, right: string) {
  return normalizeAdminEmail(left) === normalizeAdminEmail(right);
}
