/**
 * Schedule page presentation mode.
 *
 * When false (current production default), /admin/youtube?view=schedule is a
 * read-only YouTube calendar/archive. Local release-planning UI is hidden.
 *
 * Planner models, cadence projection, server actions, and unit tests remain
 * in the codebase for a future re-enable — flip this flag to restore them.
 */
export const ENABLE_LOCAL_RELEASE_PLANNING = false;
