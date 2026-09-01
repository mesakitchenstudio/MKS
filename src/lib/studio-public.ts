import type { Lesson } from "@/data/types";
import { hasValidAdminSessionCookie } from "@/lib/admin-session-token";

/** Flip to true when Studio is ready for a public launch. */
export function isStudioPublicLaunchEnabled(): boolean {
  return process.env.STUDIO_PUBLIC_LAUNCH === "true";
}

export function isStudioPath(pathname: string): boolean {
  return pathname === "/studio" || pathname.startsWith("/studio/");
}

export function isLessonPublished(lesson: Pick<Lesson, "status">): boolean {
  return lesson.status === "published";
}

/** Lessons that may appear on public Studio pages and cross-links. */
export function filterPubliclyVisibleLessons(lessons: Lesson[]): Lesson[] {
  if (!isStudioPublicLaunchEnabled()) return [];
  return lessons.filter(isLessonPublished);
}

/** Staff preview shows the full draft catalog; visitors only see published lessons after launch. */
export function visibleStudioLessons(allLessons: Lesson[], staffPreview: boolean): Lesson[] {
  if (staffPreview) return allLessons;
  return filterPubliclyVisibleLessons(allLessons);
}

export function canViewStudioLesson(lesson: Lesson, staffPreview: boolean): boolean {
  if (staffPreview) return true;
  if (!isStudioPublicLaunchEnabled()) return false;
  return isLessonPublished(lesson);
}

/**
 * Gate /studio routes for visitors while Studio remains unpublished.
 * Staff with a valid admin session may preview drafts.
 */
export function shouldGateStudioRequest(
  pathname: string,
  cookieHeader: string | null | undefined,
): boolean {
  if (!isStudioPath(pathname)) return false;
  if (isStudioPublicLaunchEnabled()) return false;
  return !hasValidAdminSessionCookie(cookieHeader);
}

export function studioRobotsNoIndex(): boolean {
  return !isStudioPublicLaunchEnabled();
}
