"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { findActiveMemberByEmail } from "@/lib/accounts";
import {
  isMemberFollowsEnabled,
  isFollowTarget,
  memberFollowErrorMessage,
  type FollowTarget,
  type MemberFollowActionResult,
  type MemberFollowList,
} from "@/lib/member-follows";
import {
  followCategoryForUser,
  followSeriesForUser,
  isCategoryFollowedByUser,
  isSeriesFollowedByUser,
  listMemberFollowsForUser,
  unfollowCategoryForUser,
  unfollowSeriesForUser,
} from "@/lib/member-follows-server";

async function requireMemberFollowsUserId(): Promise<
  { ok: true; userId: string } | { ok: false; result: MemberFollowActionResult<never> }
> {
  if (!isMemberFollowsEnabled()) {
    return {
      ok: false,
      result: {
        ok: false,
        error: "FEATURE_DISABLED",
        message: memberFollowErrorMessage("FEATURE_DISABLED"),
      },
    };
  }

  const session = await auth();
  const email = session?.user?.email;
  if (
    !email ||
    session.error === "MemberDeleted" ||
    session.error === "SessionRevoked"
  ) {
    return {
      ok: false,
      result: {
        ok: false,
        error: "NOT_AUTHENTICATED",
        message: memberFollowErrorMessage("NOT_AUTHENTICATED"),
      },
    };
  }

  const member = await findActiveMemberByEmail(email);
  if (!member) {
    return {
      ok: false,
      result: {
        ok: false,
        error: "NOT_AUTHENTICATED",
        message: memberFollowErrorMessage("NOT_AUTHENTICATED"),
      },
    };
  }

  return { ok: true, userId: member.id };
}

function revalidateFollowing() {
  revalidatePath("/profile/following");
}

function parseTarget(raw: unknown): FollowTarget | null {
  if (!isFollowTarget(raw)) return null;
  return { type: raw.type, id: raw.id.trim() };
}

export async function getMemberFollowStateAction(
  rawTarget: unknown,
): Promise<MemberFollowActionResult<{ following: boolean }>> {
  const target = parseTarget(rawTarget);
  if (!target) {
    return {
      ok: false,
      error: "INVALID_TARGET",
      message: memberFollowErrorMessage("INVALID_TARGET"),
    };
  }

  const authz = await requireMemberFollowsUserId();
  if (!authz.ok) return authz.result;

  const following =
    target.type === "series"
      ? await isSeriesFollowedByUser(authz.userId, target.id)
      : await isCategoryFollowedByUser(authz.userId, target.id);

  return { ok: true, data: { following } };
}

export async function followTargetAction(
  rawTarget: unknown,
): Promise<MemberFollowActionResult<{ following: boolean }>> {
  const target = parseTarget(rawTarget);
  if (!target) {
    return {
      ok: false,
      error: "INVALID_TARGET",
      message: memberFollowErrorMessage("INVALID_TARGET"),
    };
  }

  const authz = await requireMemberFollowsUserId();
  if (!authz.ok) return authz.result;

  const result =
    target.type === "series"
      ? await followSeriesForUser(authz.userId, target.id)
      : await followCategoryForUser(authz.userId, target.id);

  if (!result.ok) return result;
  revalidateFollowing();
  return { ok: true, data: { following: true } };
}

export async function unfollowTargetAction(
  rawTarget: unknown,
): Promise<MemberFollowActionResult<{ following: boolean }>> {
  const target = parseTarget(rawTarget);
  if (!target) {
    return {
      ok: false,
      error: "INVALID_TARGET",
      message: memberFollowErrorMessage("INVALID_TARGET"),
    };
  }

  const authz = await requireMemberFollowsUserId();
  if (!authz.ok) return authz.result;

  const result =
    target.type === "series"
      ? await unfollowSeriesForUser(authz.userId, target.id)
      : await unfollowCategoryForUser(authz.userId, target.id);

  if (!result.ok) return result;
  revalidateFollowing();
  return { ok: true, data: { following: false } };
}

/** Convenience wrappers — same ownership rules; accept canonical ids only. */
export async function followSeriesAction(
  seriesId: string,
): Promise<MemberFollowActionResult<{ following: boolean }>> {
  return followTargetAction({ type: "series", id: seriesId });
}

export async function unfollowSeriesAction(
  seriesId: string,
): Promise<MemberFollowActionResult<{ following: boolean }>> {
  return unfollowTargetAction({ type: "series", id: seriesId });
}

export async function followCategoryAction(
  categoryId: string,
): Promise<MemberFollowActionResult<{ following: boolean }>> {
  return followTargetAction({ type: "category", id: categoryId });
}

export async function unfollowCategoryAction(
  categoryId: string,
): Promise<MemberFollowActionResult<{ following: boolean }>> {
  return unfollowTargetAction({ type: "category", id: categoryId });
}

export async function listMyFollowsAction(): Promise<
  MemberFollowActionResult<MemberFollowList>
> {
  const authz = await requireMemberFollowsUserId();
  if (!authz.ok) return authz.result;
  const list = await listMemberFollowsForUser(authz.userId);
  return { ok: true, data: list };
}
