import Link from "next/link";
import type { StudioLessonSummary } from "@/lib/studio-types";
import { lessonHref } from "@/data/lessons";

export function RecipeStudioLessons({ lessons }: { lessons: StudioLessonSummary[] }) {
  if (!lessons.length) return null;

  return (
    <div className="mt-5 border-t border-line/60 pt-4">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        From the studio
      </p>
      <ul className="mt-3 space-y-2">
        {lessons.map((lesson) => (
          <li key={lesson.slug}>
            <Link
              href={lessonHref(lesson.slug)}
              className="font-serif text-lg text-ink underline-offset-4 transition-colors hover:text-terracotta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
            >
              {lesson.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
