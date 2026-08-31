"use client";

import { useState } from "react";

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function RecipeLearnSection({
  whyItWorks,
  keyIngredients,
  tips,
}: {
  whyItWorks: string;
  keyIngredients: { name: string; note: string }[];
  tips: string[];
}) {
  const hasWhy = Boolean(whyItWorks.trim());
  const hasKeys = keyIngredients.length > 0;
  const hasTips = tips.length > 0;

  if (!hasWhy && !hasKeys && !hasTips) return null;

  const summaryParts: string[] = [];
  if (hasKeys) {
    summaryParts.push(
      `${keyIngredients.length} key ingredient${keyIngredients.length === 1 ? "" : "s"}`,
    );
  }
  if (hasTips) {
    summaryParts.push(`${tips.length} studio tip${tips.length === 1 ? "" : "s"}`);
  }

  return (
    <RecipeLearnAccordion
      whyItWorks={whyItWorks}
      keyIngredients={keyIngredients}
      tips={tips}
      summaryParts={summaryParts}
      hasWhy={hasWhy}
      hasKeys={hasKeys}
      hasTips={hasTips}
    />
  );
}

function RecipeLearnAccordion({
  whyItWorks,
  keyIngredients,
  tips,
  summaryParts,
  hasWhy,
  hasKeys,
  hasTips,
}: {
  whyItWorks: string;
  keyIngredients: { name: string; note: string }[];
  tips: string[];
  summaryParts: string[];
  hasWhy: boolean;
  hasKeys: boolean;
  hasTips: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = "recipe-learn-panel";

  return (
    <section id="recipe-learn" className="mt-5 scroll-mt-24 border-t border-line/70 pt-4">
      <div className="mb-3 hidden print:block">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-ink">Learn</p>
        <h2 className="mt-1 font-serif text-xl text-ink">Technique & context</h2>
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="no-print flex w-full items-start justify-between gap-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">Learn</p>
          <h2 className="mt-1 font-serif text-xl text-ink">Technique & context</h2>
          {!open ? (
            <>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Why this recipe works, which ingredients matter, and the studio techniques worth
                knowing.
              </p>
              {summaryParts.length ? (
                <p className="mt-2 text-sm font-medium text-ink/80">{summaryParts.join(" · ")}</p>
              ) : null}
            </>
          ) : null}
        </div>
        <span className="flex shrink-0 items-center gap-1.5 pt-1 text-sm font-semibold text-muted">
          <span className="hidden sm:inline">{open ? "Collapse" : "Expand"}</span>
          <span className="sm:hidden">{open ? "↑" : "↓"}</span>
          <ChevronDown open={open} />
        </span>
      </button>

      <div
        id={panelId}
        className={`recipe-learn-panel border-t border-line/60 pt-3 ${open ? "mt-3 block" : "hidden print:block"}`}
      >
        <div className="grid gap-5 md:grid-cols-3 md:gap-6 md:divide-x md:divide-line/50">
          {hasWhy ? (
            <div className="border-b border-line/40 pb-5 md:border-b-0 md:pb-0 md:pr-5">
              <h3 className="border-b border-line/40 pb-2 font-serif text-base text-ink md:text-lg">
                Why this works
              </h3>
              <p className="mt-2.5 text-sm leading-7 text-ink/90">{whyItWorks}</p>
            </div>
          ) : null}
          {hasKeys ? (
            <div
              className={`border-b border-line/40 pb-5 md:border-b-0 md:pb-0 ${hasWhy ? "md:px-5" : "md:pr-5"}`}
            >
              <h3 className="border-b border-line/40 pb-2 font-serif text-base text-ink md:text-lg">
                Key ingredients
              </h3>
              <dl className="mt-2.5 space-y-2.5">
                {keyIngredients.map((item) => (
                  <div key={item.name}>
                    <dt className="text-sm font-semibold text-ink">{item.name}</dt>
                    <dd className="text-sm leading-6 text-muted">{item.note}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {hasTips ? (
            <div className={hasWhy || hasKeys ? "md:pl-5" : ""}>
              <h3 className="border-b border-line/40 pb-2 font-serif text-base text-ink md:text-lg">
                Studio tips
              </h3>
              <ul className="mt-2.5 space-y-2 text-sm leading-6 text-ink/90">
                {tips.map((tip) => (
                  <li key={tip} className="flex gap-2">
                    <span className="text-terracotta">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
