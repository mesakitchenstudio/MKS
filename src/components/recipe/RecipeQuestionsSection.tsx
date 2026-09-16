import { RecipeQuestionAsk } from "@/components/recipe/RecipeQuestionAsk";
import { site } from "@/data/site";
import { formatLongDate } from "@/lib/datetime";
import { loadPublishedRecipeQuestionsForPage } from "@/lib/recipe-questions-server";
import type { PublicRecipeQuestionItem } from "@/lib/recipe-questions";

type Props = {
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
};

/**
 * Public Recipe Q&A section (Phase 9C).
 *
 * Cache model:
 * - Published + answered Q&A is safe shared/ISR HTML.
 * - Ask UX is a client boundary; no member pending state is server-rendered here.
 * - Read failures degrade this section only — callers keep the Recipe page healthy.
 */
export async function RecipeQuestionsSection({
  recipeId,
  recipeSlug,
  recipeTitle,
}: Props) {
  const loaded = await loadPublishedRecipeQuestionsForPage({ recipeId });
  const items = loaded.ok ? loaded.items : [];
  const unavailable = !loaded.ok;
  const empty = loaded.ok && items.length === 0;

  return (
    <section
      id="questions"
      className="no-print mt-6 scroll-mt-28 border-t border-line/80 pt-4"
      aria-labelledby="recipe-questions-heading"
    >
      <h2
        id="recipe-questions-heading"
        className="font-serif text-xl text-ink md:text-2xl"
      >
        {empty
          ? "Questions about cooking this recipe?"
          : "Questions about cooking this recipe"}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted md:text-base">
        {empty
          ? "Ask Mesa about substitutions, technique, storage, or troubleshooting."
          : "Ask about substitutions, technique, make-ahead, storage, scaling, or troubleshooting."}
      </p>

      <RecipeQuestionAsk
        recipeId={recipeId}
        recipeSlug={recipeSlug}
        recipeTitle={recipeTitle}
      />

      {unavailable ? (
        <p className="mt-5 text-sm text-muted" role="status">
          Questions are temporarily unavailable.
        </p>
      ) : null}

      {!unavailable && items.length > 0 ? (
        <ul className="mt-6 space-y-8">
          {items.map((item) => (
            <li key={item.id}>
              <PublicQuestionItem item={item} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function PublicQuestionItem({ item }: { item: PublicRecipeQuestionItem }) {
  const answeredLabel = formatLongDate(item.answeredAt);
  const answeredIso =
    item.answeredAt instanceof Date
      ? item.answeredAt.toISOString()
      : new Date(item.answeredAt).toISOString();

  return (
    <article className="min-w-0">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Question
        </p>
        <p className="mt-1 text-sm text-muted">
          Asked by <span className="text-ink">{item.authorName}</span>
        </p>
        <p className="mt-2 max-w-3xl whitespace-pre-wrap break-words text-[1.05rem] leading-[1.75] text-ink/90">
          {item.body}
        </p>
      </div>
      <div className="mt-4 border-l-2 border-line pl-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Answer
        </p>
        <p className="mt-1 text-sm text-muted">
          <span className="font-semibold text-ink">{site.name}</span>
          {answeredLabel !== "—" ? (
            <>
              {" · "}
              <time dateTime={answeredIso}>{answeredLabel}</time>
            </>
          ) : null}
        </p>
        <p className="mt-2 max-w-3xl whitespace-pre-wrap break-words text-[1.05rem] leading-[1.75] text-ink/90">
          {item.answerBody}
        </p>
      </div>
    </article>
  );
}
