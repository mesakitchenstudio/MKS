"use server";

import { auth } from "@/auth";
import { findActiveMemberByEmail } from "@/lib/accounts";
import {
  isMealPlannerEnabled,
  validateMealPlanDate,
  validateMealPlanDateHorizon,
} from "@/lib/meal-planner";
import { getMemberHomePlannerWeekForUser } from "@/lib/member-home-server";
import type { MemberHomePlannerSummary } from "@/lib/member-home";

export type MemberHomeThisWeekActionResult =
  | { ok: true; planner: MemberHomePlannerSummary }
  | {
      ok: false;
      error:
        | "NOT_AUTHENTICATED"
        | "FEATURE_DISABLED"
        | "INVALID_DATE"
        | "OUT_OF_HORIZON"
        | "UNAVAILABLE";
      message: string;
    };

/** Abuse-resistance reference day (UTC civil). Not used as member-local “today” for week content. */
function serverUtcCivilYmd(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

  // Horizon uses server UTC civil day only to reject absurd far dates — not to choose the week.
  const horizon = validateMealPlanDateHorizon(date.planDate, serverUtcCivilYmd());
  if (!horizon.ok) {
    return {
      ok: false,
      error: horizon.error === "OUT_OF_HORIZON" ? "OUT_OF_HORIZON" : "INVALID_DATE",
      message: horizon.message,
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
