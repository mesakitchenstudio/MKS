import type { Recipe } from "@/data/types";
import { site } from "@/data/site";
import { scaleIngredientAmount } from "@/lib/culinary-format";
import {
  resolvePublicRecipeH1,
  resolveRecipeSecondaryDishLine,
} from "@/lib/recipe-dish-identity";
import { recipeInstructionStages } from "@/lib/recipe-instructions";
import { recipePrimaryCategoryDisplayLabel } from "@/lib/recipe-primary-taxonomy";
import {
  recipePrintCanonicalUrl,
  recipePrintMetaItems,
  recipePrintYieldLabel,
} from "@/lib/recipe-print";
import { formatPublicUpdateLabel } from "@/lib/recipe-public-update";
import { formatPublicNutritionSummary } from "@/lib/field-content";

/**
 * Print-only recipe document. Hidden on screen; shown via @media print.
 * Receives the live selected servings from RecipeCookingWorkspace.
 */
export function RecipePrintSheet({
  recipe,
  servings,
}: {
  recipe: Recipe;
  servings: number;
}) {
  const factor = servings / Math.max(1, recipe.servings);
  const stages = recipeInstructionStages(recipe);
  const taxonomy = recipePrimaryCategoryDisplayLabel(recipe);
  const title = resolvePublicRecipeH1(recipe);
  const secondary = resolveRecipeSecondaryDishLine({
    title: recipe.title,
    course: recipe.course,
    dishName: recipe.dishName,
    typeName: recipe.typeName,
  });
  const meta = recipePrintMetaItems(recipe, servings);
  const url = recipePrintCanonicalUrl(recipe.slug);
  const nutrition = formatPublicNutritionSummary(recipe.nutrition);
  const utensils = recipe.utensils?.filter(Boolean) ?? [];
  const showOriginalYield = servings !== recipe.servings;
  const updateLabel = formatPublicUpdateLabel(recipe.publicUpdatedAt);
  const updateNote = recipe.publicUpdateNote?.trim() ?? "";

  return (
    <div className="recipe-print-sheet" hidden aria-hidden="true">
      <header className="recipe-print-sheet__header">
        <p className="recipe-print-sheet__brand">{site.name}</p>
        <p className="recipe-print-sheet__tagline">{site.tagline}</p>
        {taxonomy ? <p className="recipe-print-sheet__taxonomy">{taxonomy}</p> : null}
        {secondary ? <p className="recipe-print-sheet__dish">{secondary}</p> : null}
        <h1 className="recipe-print-sheet__title">{title}</h1>
        {recipe.excerpt?.trim() ? (
          <p className="recipe-print-sheet__excerpt">{recipe.excerpt.trim()}</p>
        ) : null}
        {updateLabel && updateNote ? (
          <div className="recipe-print-sheet__update">
            <p className="recipe-print-sheet__update-label">{updateLabel}</p>
            <p className="recipe-print-sheet__update-note">{updateNote}</p>
          </div>
        ) : null}
      </header>

      <dl className="recipe-print-sheet__meta">
        {meta.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      {showOriginalYield ? (
        <p className="recipe-print-sheet__original-yield">
          Original recipe: {recipePrintYieldLabel(recipe.servings, recipe.servingsUnit)}
        </p>
      ) : null}

      <section className="recipe-print-sheet__section">
        <h2>Ingredients</h2>
        {recipe.ingredients.map((group, groupIndex) => (
          <div key={`${group.name ?? "group"}-${groupIndex}`} className="recipe-print-sheet__group">
            {group.name?.trim() ? <h3>{group.name.trim()}</h3> : null}
            <ul>
              {group.items.map((item, itemIndex) => {
                const amount = scaleIngredientAmount(item.amount, factor);
                const grams =
                  item.grams != null && Number.isFinite(item.grams)
                    ? ` (${Math.round(item.grams * factor)}g)`
                    : "";
                return (
                  <li key={`${item.item}-${itemIndex}`}>
                    <strong>
                      {amount}
                      {grams}
                    </strong>{" "}
                    {item.item}
                    {item.notes?.trim() ? <span>, {item.notes.trim()}</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {utensils.length ? (
          <div className="recipe-print-sheet__utensils">
            <h3>Utensils</h3>
            <p>{utensils.join(" · ")}</p>
          </div>
        ) : null}
      </section>

      <section className="recipe-print-sheet__section">
        <h2>Instructions</h2>
        {stages.length === 0 ? (
          <p>No instructions available.</p>
        ) : (
          stages.map((stage) => (
            <div key={stage.id} className="recipe-print-sheet__stage">
              {stages.length > 1 ? <h3>{stage.name}</h3> : null}
              <ol>
                {stage.steps.map((step) => (
                  <li key={step.globalIndex}>{step.text}</li>
                ))}
              </ol>
            </div>
          ))
        )}
      </section>

      {recipe.notes?.some((n) => n.trim()) ? (
        <section className="recipe-print-sheet__section">
          <h2>Notes</h2>
          <ul>
            {recipe.notes
              .map((n) => n.trim())
              .filter(Boolean)
              .map((note) => (
                <li key={note}>{note}</li>
              ))}
          </ul>
        </section>
      ) : null}

      {recipe.tips?.some((t) => t.trim()) ? (
        <section className="recipe-print-sheet__section">
          <h2>Tips</h2>
          <ul>
            {recipe.tips
              .map((t) => t.trim())
              .filter(Boolean)
              .map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
          </ul>
        </section>
      ) : null}

      {nutrition ? (
        <section className="recipe-print-sheet__section">
          <h2>Nutrition (estimate)</h2>
          <p>{nutrition}</p>
        </section>
      ) : null}

      <footer className="recipe-print-sheet__footer">
        <p>
          Recipe: <span className="recipe-print-sheet__url">{url}</span>
        </p>
        <p>
          {site.name} · {site.domain}
        </p>
      </footer>
    </div>
  );
}
