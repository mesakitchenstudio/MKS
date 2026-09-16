export function isSitePrivate() {
  return process.env.SITE_PRIVATE === "true";
}

/**
 * Personalized Member Home enhancements on `/profile`.
 * Server-only — default OFF unless exactly `"true"`.
 * Do not mirror with NEXT_PUBLIC_* ; pass boolean props from server layouts.
 */
export function isPersonalizedMemberHomeEnabled(): boolean {
  return process.env.PERSONALIZED_MEMBER_HOME_ENABLED === "true";
}

/**
 * Roadmap #8 — Follow Topics/Series + in-app Notifications.
 * Server-only — default OFF unless exactly `"true"`.
 * Do not mirror with NEXT_PUBLIC_* .
 */
export function isMemberFollowsEnabled(): boolean {
  return process.env.MEMBER_FOLLOWS_ENABLED === "true";
}

/**
 * Roadmap #9 — Recipe Q&A.
 * Server-only — default OFF unless exactly `"true"`.
 * Do not mirror with NEXT_PUBLIC_* .
 */
export function isRecipeQaEnabled(): boolean {
  return process.env.RECIPE_QA_ENABLED === "true";
}

/**
 * Roadmap #10 — Recipe step ↔ video timestamps.
 * Server-only — default OFF unless exactly `"true"`.
 * Do not mirror with NEXT_PUBLIC_* .
 * Data helpers stay deterministic; UI/actions enforce this gate.
 */
export function isRecipeStepTimestampsEnabled(): boolean {
  return process.env.RECIPE_STEP_TIMESTAMPS_ENABLED === "true";
}
