import { formatPublicUpdateLabel } from "@/lib/recipe-public-update";

/**
 * Server-friendly editorial update note. Pass through from any parent —
 * no client state; React escapes note text.
 */
export function RecipePublicUpdateNote({
  note,
  updatedAt,
  className = "",
}: {
  note?: string | null;
  updatedAt?: string | null;
  className?: string;
}) {
  const text = note?.trim() ?? "";
  const label = formatPublicUpdateLabel(updatedAt);
  if (!text || !label) return null;

  const headingId = "recipe-public-update-heading";

  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-sm border border-line/80 bg-cream/40 px-3.5 py-3 ${className}`.trim()}
    >
      <p
        id={headingId}
        className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-olive"
      >
        {label}
      </p>
      <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-ink/90">{text}</p>
    </section>
  );
}
