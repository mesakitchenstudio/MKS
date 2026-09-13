import type { ReactNode } from "react";
import { AdminDocumentationButton } from "@/components/admin/AdminDocumentationButton";

/**
 * Thin Admin page header — title, short description, secondary “About this page”
 * documentation control, and primary/page actions.
 */
export function AdminPageHeader({
  title,
  description,
  documentationTopicId,
  actions,
  titleClassName = "font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]",
  className = "",
  meta,
}: {
  title: string;
  description?: string;
  /** When set, renders the secondary “About this page” documentation control. */
  documentationTopicId?: string;
  actions?: ReactNode;
  /** Optional second muted line (e.g. recipe counts). */
  meta?: ReactNode;
  titleClassName?: string;
  className?: string;
}) {
  const hasActions = Boolean(documentationTopicId || actions);

  return (
    <header className={`mb-8 md:mb-9 ${className}`.trim()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h1 className={titleClassName}>{title}</h1>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          ) : null}
          {meta ? <div className="mt-2 text-sm text-muted">{meta}</div> : null}
        </div>
        {hasActions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {documentationTopicId ? (
              <AdminDocumentationButton topicId={documentationTopicId} />
            ) : null}
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
