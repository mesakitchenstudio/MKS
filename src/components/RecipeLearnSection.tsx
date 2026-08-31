"use client";

import { useState } from "react";

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={`mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
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
  const cards = [
    whyItWorks.trim()
      ? { id: "learn-why", title: "Why this works", body: whyItWorks, kind: "text" as const }
      : null,
    keyIngredients.length
      ? { id: "learn-keys", title: "Key ingredients", body: keyIngredients, kind: "keys" as const }
      : null,
    tips.length
      ? { id: "learn-tips", title: "Studio tips", body: tips, kind: "tips" as const }
      : null,
  ].filter(Boolean) as Array<{
    id: string;
    title: string;
    body: string | { name: string; note: string }[] | string[];
    kind: "text" | "keys" | "tips";
  }>;

  if (!cards.length) return null;

  return (
    <section id="recipe-learn" className="mt-6 scroll-mt-24">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-olive">Learn</p>
      <h2 className="mt-1 font-serif text-2xl text-ink md:text-3xl">Technique & context</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <LearnCard key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}

function LearnCard({
  card,
}: {
  card: {
    id: string;
    title: string;
    body: string | { name: string; note: string }[] | string[];
    kind: "text" | "keys" | "tips";
  };
}) {
  const [open, setOpen] = useState(false);
  const panelId = `${card.id}-panel`;
  const preview =
    card.kind === "text"
      ? String(card.body).slice(0, 120)
      : card.kind === "keys"
        ? `${(card.body as { name: string }[]).length} highlights`
        : `${(card.body as string[]).length} tips`;

  return (
    <article className="bg-cream/30 px-4 py-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="no-print flex w-full items-start justify-between gap-3 rounded-sm text-left transition-colors hover:bg-cream/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
      >
        <div className="min-w-0">
          <h3 className="font-serif text-lg text-ink">{card.title}</h3>
          {!open ? <p className="mt-1 line-clamp-2 text-sm text-muted">{preview}…</p> : null}
        </div>
        <ChevronDown open={open} />
      </button>
      <div
        id={panelId}
        className={`text-sm leading-7 text-ink/90 ${open ? "mt-2 block" : "hidden print:block"}`}
      >
        {card.kind === "text" ? <p>{card.body as string}</p> : null}
        {card.kind === "keys" ? (
          <dl className="space-y-3">
            {(card.body as { name: string; note: string }[]).map((item) => (
              <div key={item.name}>
                <dt className="font-semibold">{item.name}</dt>
                <dd className="text-muted">{item.note}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {card.kind === "tips" ? (
          <ul className="space-y-2">
            {(card.body as string[]).map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
