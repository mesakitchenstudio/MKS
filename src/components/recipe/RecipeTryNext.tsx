import Link from "next/link";
import type { ContextualInternalLinkTarget } from "@/lib/contextual-internal-links-public";

/**
 * Compact editor-curated contextual Recipe links (“Try next”).
 * Server-friendly presentational component — no DB, no scores.
 */
export function RecipeTryNext({
  targets,
}: {
  targets: ContextualInternalLinkTarget[];
}) {
  if (!targets.length) return null;

  const headingId = "recipe-try-next-heading";

  return (
    <section
      className="no-print mx-auto mt-10 max-w-3xl px-4 sm:px-6"
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="font-serif text-2xl text-ink">
        Try next
      </h2>
      <ul className="mt-3 list-none space-y-2 p-0">
        {targets.map((target) => (
          <li key={target.id} className="min-w-0">
            <Link
              href={`/recipes/${target.slug}`}
              className="break-words text-base font-medium text-terracotta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
            >
              {target.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
