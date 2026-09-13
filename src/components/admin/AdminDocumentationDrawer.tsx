"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { adminFocusRing } from "@/lib/admin-ui";
import {
  adminDocumentationCenterHref,
  getAdminDocTopicById,
  type AdminDocTopic,
} from "@/lib/admin-documentation";

export const ADMIN_DOCUMENTATION_DRAWER_Z_CLASS = "z-[70]";

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return [...nodes].filter(
    (node) => !node.hasAttribute("disabled") && node.getAttribute("aria-hidden") !== "true",
  );
}

export function AdminDocumentationDrawer({
  topic,
  open,
  onClose,
  returnFocusRef,
  initialSectionId,
  allowDocumentationCenterNavigation = true,
}: {
  topic: AdminDocTopic;
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** When set, scroll/focus this section after open (or after returning to the root topic). */
  initialSectionId?: string;
  /**
   * When false, omit the Documentation Center navigation link.
   * Keep true on normal Admin pages; false on dirty editors without leave guards.
   */
  allowDocumentationCenterNavigation?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Fresh mount per open session (see AdminDocumentationButton key) resets navigation.
  const [topicStack, setTopicStack] = useState<string[]>([topic.id]);
  const [focusSectionId, setFocusSectionId] = useState<string | undefined>(initialSectionId);

  const currentTopic =
    getAdminDocTopicById(topicStack[topicStack.length - 1] ?? topic.id) ?? topic;
  const canGoBack = topicStack.length > 1;

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const trigger = returnFocusRef?.current ?? null;
    const focusTimer = window.setTimeout(() => {
      closeRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      trigger?.focus?.();
    };
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open || !scrollRef.current) return;
    const scrollRoot = scrollRef.current;
    if (focusSectionId) {
      const target = scrollRoot.querySelector<HTMLElement>(
        `[data-doc-section="${focusSectionId}"]`,
      );
      if (target) {
        const heading = target.querySelector<HTMLElement>("h3");
        window.setTimeout(() => {
          target.scrollIntoView({ block: "start", behavior: "smooth" });
          heading?.focus();
        }, 40);
        return;
      }
    }
    scrollRoot.scrollTop = 0;
    const heading = panelRef.current?.querySelector<HTMLElement>(`#${CSS.escape(titleId)}`);
    window.setTimeout(() => heading?.focus(), 40);
  }, [open, currentTopic.id, focusSectionId, titleId]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = getFocusableElements(panelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (active === first || !panelRef.current.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  function openRelatedTopic(relatedId: string) {
    const next = getAdminDocTopicById(relatedId);
    if (!next) return;
    setFocusSectionId(undefined);
    setTopicStack((stack) => [...stack, relatedId]);
  }

  function goBack() {
    if (topicStack.length <= 1) return;
    const next = topicStack.slice(0, -1);
    setTopicStack(next);
    setFocusSectionId(next.length === 1 ? initialSectionId : undefined);
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={`fixed inset-0 ${ADMIN_DOCUMENTATION_DRAWER_Z_CLASS}`} role="presentation">
      <button
        type="button"
        aria-label="Close documentation"
        className="absolute inset-0 bg-ink/40"
        onClick={handleClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-0 flex max-h-[100dvh] flex-col bg-paper sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-lg sm:border-l sm:border-line"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
          <div className="min-w-0">
            {canGoBack ? (
              <button
                type="button"
                onClick={goBack}
                className={`mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:text-ink ${adminFocusRing}`}
              >
                ← Back
              </button>
            ) : (
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
                Documentation
              </p>
            )}
            <h2
              id={titleId}
              tabIndex={-1}
              className="mt-1 font-serif text-2xl leading-tight text-ink outline-none"
            >
              {currentTopic.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">{currentTopic.summary}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={handleClose}
            className={`shrink-0 rounded-md px-2 py-1.5 text-sm font-semibold text-muted hover:text-ink ${adminFocusRing}`}
          >
            Close
          </button>
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
          <div className="space-y-8">
            {currentTopic.sections.map((section) => {
              const relatedIds =
                section.id === "related"
                  ? (currentTopic.relatedTopicIds ?? []).filter(
                      (id) => id !== currentTopic.id && Boolean(getAdminDocTopicById(id)),
                    )
                  : [];

              return (
                <section
                  key={section.id}
                  data-doc-section={section.id}
                  aria-labelledby={`${titleId}-${section.id}`}
                >
                  <h3
                    id={`${titleId}-${section.id}`}
                    tabIndex={-1}
                    className="text-xs font-semibold uppercase tracking-[0.14em] text-olive outline-none"
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
                                onClick={() => openRelatedTopic(relatedId)}
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
          {allowDocumentationCenterNavigation ? (
            <div className="mt-10 border-t border-line pt-4">
              <p className="text-xs text-muted">
                Browse the full Mesa Admin manual, including related topics.
              </p>
              <Link
                href={adminDocumentationCenterHref(currentTopic.id)}
                className={`mt-2 inline-flex text-sm font-semibold text-terracotta hover:underline ${adminFocusRing}`}
                onClick={handleClose}
              >
                Open Documentation Center →
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
