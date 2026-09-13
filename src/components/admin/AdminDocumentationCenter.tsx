"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ADMIN_DOC_CATEGORY_LABELS,
  adminDocumentationCenterHref,
  getAdminDocPageLink,
  getAdminDocTopicById,
  groupAdminDocTopicsByCategory,
  searchAdminDocTopics,
  type AdminDocTopic,
} from "@/lib/admin-documentation";
import {
  adminFocusRing,
  adminInputClass,
  adminLinkClass,
  adminSecondaryButtonClass,
} from "@/lib/admin-ui";

function AdminDocTopicSections({
  topic,
  onOpenRelated,
  relatedFilter,
}: {
  topic: AdminDocTopic;
  onOpenRelated: (topicId: string) => void;
  relatedFilter: (topicId: string) => boolean;
}) {
  return (
    <div className="space-y-8">
      {topic.sections.map((section) => {
        const relatedIds =
          section.id === "related"
            ? (topic.relatedTopicIds ?? []).filter(
                (id) => id !== topic.id && relatedFilter(id) && Boolean(getAdminDocTopicById(id)),
              )
            : [];
        const hasBody =
          section.paragraphs.length > 0 ||
          (section.bullets?.length ?? 0) > 0 ||
          relatedIds.length > 0;
        if (!hasBody) return null;

        return (
          <section key={section.id} aria-labelledby={`doc-center-${topic.id}-${section.id}`}>
            <h3
              id={`doc-center-${topic.id}-${section.id}`}
              className="text-xs font-semibold uppercase tracking-[0.14em] text-olive"
            >
              {section.title}
            </h3>
            <div className="mt-3 space-y-3 text-sm leading-6 text-ink">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {relatedIds.length > 0 ? (
                <ul className="space-y-1.5">
                  {relatedIds.map((relatedId) => {
                    const related = getAdminDocTopicById(relatedId);
                    if (!related) return null;
                    return (
                      <li key={relatedId}>
                        <button
                          type="button"
                          onClick={() => onOpenRelated(relatedId)}
                          className={`text-left font-semibold text-terracotta hover:underline ${adminFocusRing}`}
                        >
                          {related.title} →
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : section.bullets?.length ? (
                <ul className="list-disc space-y-1.5 pl-5 text-ink">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function AdminDocumentationCenter({
  topics,
  initialTopicId = null,
}: {
  topics: AdminDocTopic[];
  initialTopicId?: string | null;
}) {
  const router = useRouter();
  const searchId = useId();
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const allowedIds = useMemo(() => new Set(topics.map((topic) => topic.id)), [topics]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (initialTopicId && allowedIds.has(initialTopicId)) return initialTopicId;
    return null;
  });

  const selectedTopic = selectedId ? topics.find((topic) => topic.id === selectedId) ?? null : null;
  const pageLink = selectedTopic ? getAdminDocPageLink(selectedTopic.id) : null;

  const searchMatches = useMemo(
    () => searchAdminDocTopics(topics, deferredQuery),
    [topics, deferredQuery],
  );
  const isSearching = deferredQuery.trim().length > 0;
  const visibleTopics = isSearching ? searchMatches.map((match) => match.topic) : topics;
  const grouped = useMemo(() => groupAdminDocTopicsByCategory(visibleTopics), [visibleTopics]);

  function selectTopic(topicId: string) {
    if (!allowedIds.has(topicId)) return;
    setSelectedId(topicId);
    router.replace(adminDocumentationCenterHref(topicId), { scroll: false });
  }

  function clearTopic() {
    setSelectedId(null);
    router.replace("/admin/documentation", { scroll: false });
  }

  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => detailHeadingRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [selectedId]);

  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <div className={`min-w-0 space-y-5 ${selectedTopic ? "hidden lg:block" : ""}`}>
        <div>
          <label htmlFor={searchId} className="text-sm font-semibold text-ink">
            Search documentation
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try cooking time, redirect, CTR…"
            className={`${adminInputClass} mt-2 w-full`}
            autoComplete="off"
          />
          <p className="mt-2 text-xs text-muted">
            {topics.length} topic{topics.length === 1 ? "" : "s"} available for your role
          </p>
        </div>

        {!isSearching ? (
          <p className="text-sm leading-6 text-muted">
            Browse by category, or open a topic for workflows, rules, and related Admin pages.
          </p>
        ) : null}

        {isSearching && visibleTopics.length === 0 ? (
          <div className="rounded-sm border border-line bg-paper px-4 py-5" role="status">
            <p className="text-sm font-semibold text-ink">
              No documentation found for “{deferredQuery.trim()}”
            </p>
            <p className="mt-2 text-sm text-muted">
              Try another term or clear search to browse by category.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map((group) => (
              <section key={group.category} aria-labelledby={`doc-cat-${group.category}`}>
                <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-line pb-2">
                  <h2
                    id={`doc-cat-${group.category}`}
                    className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive"
                  >
                    {group.label}
                  </h2>
                  <span className="text-xs text-muted">{group.topics.length}</span>
                </div>
                <ul className="space-y-1">
                  {group.topics.map((topic) => {
                    const selected = topic.id === selectedId;
                    return (
                      <li key={topic.id}>
                        <button
                          type="button"
                          onClick={() => selectTopic(topic.id)}
                          aria-current={selected ? "true" : undefined}
                          className={`w-full rounded-sm border px-3 py-3 text-left transition-colors ${adminFocusRing} ${
                            selected
                              ? "border-ink/20 bg-sand/40"
                              : "border-transparent hover:border-line hover:bg-paper"
                          }`}
                        >
                          <span className="block font-semibold text-ink">{topic.title}</span>
                          <span className="mt-1 block text-sm leading-5 text-muted">
                            {topic.summary}
                          </span>
                          <span className="mt-2 block text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
                            {ADMIN_DOC_CATEGORY_LABELS[topic.category]}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <div className={`min-w-0 ${selectedTopic ? "" : "hidden lg:block"}`}>
        {selectedTopic ? (
          <article className="rounded-sm border border-line bg-paper px-4 py-5 sm:px-6 sm:py-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={clearTopic}
                  className={`mb-3 text-sm font-semibold text-muted hover:text-terracotta lg:hidden ${adminFocusRing}`}
                >
                  ← Documentation
                </button>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
                  {ADMIN_DOC_CATEGORY_LABELS[selectedTopic.category]}
                </p>
                <h2
                  ref={detailHeadingRef}
                  tabIndex={-1}
                  className="mt-1 font-serif text-3xl leading-tight text-ink outline-none"
                >
                  {selectedTopic.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{selectedTopic.summary}</p>
              </div>
              {pageLink ? (
                <Link
                  href={pageLink.href}
                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                >
                  {pageLink.label} →
                </Link>
              ) : null}
            </div>
            <AdminDocTopicSections
              topic={selectedTopic}
              onOpenRelated={selectTopic}
              relatedFilter={(id) => allowedIds.has(id)}
            />
            <p className="mt-8 border-t border-line pt-4 text-sm text-muted">
              <button
                type="button"
                onClick={clearTopic}
                className={`font-semibold text-muted hover:text-terracotta ${adminFocusRing}`}
              >
                ← All documentation
              </button>
            </p>
          </article>
        ) : (
          <div className="rounded-sm border border-dashed border-line bg-paper/60 px-4 py-8 sm:px-6">
            <h2 className="font-serif text-2xl text-ink">Mesa Admin manual</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
              Select a topic to read guidance for publishing, library, community, analytics, and
              team operations. Documentation mirrors the pages you can already open in Admin.
            </p>
            <p className="mt-4 text-sm text-muted">
              Tip: from any Admin page, use the page Documentation button for contextual help.
            </p>
            <p className="mt-6 text-sm">
              <Link href="/admin/profile" className={`${adminLinkClass} ${adminFocusRing}`}>
                Open Profile
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
