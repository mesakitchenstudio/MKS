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
