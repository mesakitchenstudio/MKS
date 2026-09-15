"use server";

import { auth } from "@/auth";
import { findActiveMemberByEmail } from "@/lib/accounts";
import { isMealPlannerEnabled, validateMealPlanDate } from "@/lib/meal-planner";
import { getMemberHomePlannerWeekForUser } from "@/lib/member-home-server";
import type { MemberHomePlannerSummary } from "@/lib/member-home";

export type MemberHomeThisWeekActionResult =
  | { ok: true; planner: MemberHomePlannerSummary }
  | {
      ok: false;
      error: "NOT_AUTHENTICATED" | "FEATURE_DISABLED" | "INVALID_DATE" | "UNAVAILABLE";
      message: string;
    };

/**
 * Browser-local week read for Profile “This week”.
 * Accepts only weekAnchorYmd — never userId/email/planId from the client.
 * Read-only: does not create a Meal Plan.
 */
export async function getMemberHomeThisWeekAction(
  weekAnchorYmd: string,
): Promise<MemberHomeThisWeekActionResult> {
  if (!isMealPlannerEnabled()) {
    return {
      ok: false,
      error: "FEATURE_DISABLED",
      message: "Meal Planner is not available.",
    };
  }

  const date = validateMealPlanDate(weekAnchorYmd);
  if (!date.ok) {
    return {
      ok: false,
      error: "INVALID_DATE",
      message: date.message,
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
      error: "NOT_AUTHENTICATED",
      message: "Sign in to see your meal plan.",
    };
  }

  const member = await findActiveMemberByEmail(email);
  if (!member) {
    return {
      ok: false,
      error: "NOT_AUTHENTICATED",
      message: "Sign in to see your meal plan.",
    };
  }

  try {
    const planner = await getMemberHomePlannerWeekForUser(member.id, date.planDate);
    return { ok: true, planner };
  } catch {
    return {
      ok: false,
      error: "UNAVAILABLE",
      message: "This week’s plan could not be loaded.",
    };
  }
}
