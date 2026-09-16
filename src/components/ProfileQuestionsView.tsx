"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  deleteMyRecipeQuestionAction,
  updateMyRecipeQuestionAction,
} from "@/app/profile/question-actions";
import { authFocusRing } from "@/lib/auth-ui";
import { formatLongDate } from "@/lib/datetime";
import {
  RECIPE_QUESTION_BODY_MAX,
  RECIPE_QUESTION_BODY_MIN,
  formatRecipeQuestionMemberStatusLabel,
  type RecipeQuestionStatus,
} from "@/lib/recipe-questions";

export type ProfileQuestionClientItem = {
  id: string;
  recipeId: string;
  recipeSlug: string | null;
  recipeTitle: string | null;
  recipeStatus: string | null;
  body: string;
  status: RecipeQuestionStatus;
  answerBody: string | null;
  answeredAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  canEdit: boolean;
  canDelete: boolean;
};

const DIALOG_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-sm bg-terracotta px-4 text-sm font-semibold text-paper hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";
const DIALOG_SECONDARY =
  "inline-flex min-h-11 items-center justify-center rounded-sm border border-line bg-paper px-4 text-sm font-semibold text-ink hover:bg-cream disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

function DeleteQuestionDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function confirm() {
    setBusy(true);
    setError("");
    const message = await onConfirm();
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    onClose();
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-sm border border-line bg-paper p-5 shadow-lg"
      >
        <h2 id={titleId} className="font-serif text-2xl text-ink">
          Delete this question?
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">
          This removes your pending question. You can ask again later on the recipe.
        </p>
        {error ? (
          <p className="mt-3 text-sm text-terracotta" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            ref={cancelRef}
            type="button"
            className={DIALOG_SECONDARY}
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={DIALOG_PRIMARY}
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? "Deleting…" : "Delete question"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function QuestionCard({
  item,
  onUpdated,
  onDeleted,
}: {
  item: ProfileQuestionClientItem;
  onUpdated: (next: ProfileQuestionClientItem) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.body);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const formId = useId();
  const answerLabelId = `${formId}-answer`;
  const bodyId = `${formId}-body`;

  const recipeTitle = (item.recipeTitle || "Recipe").trim() || "Recipe";
  const recipePublished = item.recipeStatus === "published" && Boolean(item.recipeSlug);
  const statusLabel = formatRecipeQuestionMemberStatusLabel(item.status);
  const showViewOnRecipe = item.status === "published" && recipePublished;

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setStatusMsg(null);
    try {
      const result = await updateMyRecipeQuestionAction({
        questionId: item.id,
        body: draft,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onUpdated({ ...item, body: draft.trim() });
      setEditing(false);
      setStatusMsg(result.message || "Question updated.");
    } catch {
      setError("Could not update your question. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="min-w-0 py-6">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-olive">
          {statusLabel}
        </p>
        <time
          dateTime={item.createdAt}
          className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted"
        >
          {formatLongDate(item.createdAt)}
        </time>
      </div>

      <p className="mt-2 min-w-0 break-words font-semibold text-ink">
        {recipePublished ? (
          <Link
            href={`/recipes/${item.recipeSlug}`}
            className={`text-ink hover:text-terracotta ${authFocusRing} rounded-sm`}
          >
            {recipeTitle}
          </Link>
        ) : (
          recipeTitle
        )}
      </p>

      {editing ? (
        <form className="mt-4 space-y-3" onSubmit={onSave} aria-busy={pending || undefined}>
          <div className="grid gap-2">
            <label htmlFor={bodyId} className="text-sm font-semibold text-ink">
              Edit your question
            </label>
            <textarea
              id={bodyId}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={5}
              maxLength={RECIPE_QUESTION_BODY_MAX}
              disabled={pending}
              className={`w-full min-w-0 resize-y rounded-sm border border-line bg-paper px-3 py-2 text-sm leading-6 text-ink ${authFocusRing}`}
            />
            <p className="text-xs text-muted">
              {RECIPE_QUESTION_BODY_MIN}–{RECIPE_QUESTION_BODY_MAX} characters ·{" "}
              {Math.min(draft.length, RECIPE_QUESTION_BODY_MAX)} / {RECIPE_QUESTION_BODY_MAX}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={pending} className={DIALOG_PRIMARY}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={pending}
              className={DIALOG_SECONDARY}
              onClick={() => {
                setEditing(false);
                setDraft(item.body);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-[1.05rem] leading-[1.75] text-ink/90">
          {item.body}
        </p>
      )}

      {item.answerBody ? (
        <section className="mt-5 min-w-0" aria-labelledby={answerLabelId}>
          <h3 id={answerLabelId} className="text-sm font-semibold text-ink">
            Mesa Kitchen Studio
          </h3>
          {item.answeredAt ? (
            <time
              dateTime={item.answeredAt}
              className="mt-1 block text-xs text-muted"
            >
              Answered {formatLongDate(item.answeredAt)}
            </time>
          ) : null}
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink/90">
            {item.answerBody}
          </p>
        </section>
      ) : null}

      {!editing ? (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {showViewOnRecipe ? (
            <Link
              href={`/recipes/${item.recipeSlug}#questions`}
              className={`text-sm font-semibold text-terracotta hover:text-terracotta-dark ${authFocusRing} rounded-sm`}
            >
              View answer on recipe
            </Link>
          ) : null}
          {item.canEdit ? (
            <button
              type="button"
              className={`text-sm font-semibold text-ink/80 hover:text-terracotta ${authFocusRing} rounded-sm`}
              onClick={() => {
                setEditing(true);
                setDraft(item.body);
                setError(null);
                setStatusMsg(null);
              }}
            >
              Edit question
            </button>
          ) : null}
          {item.canDelete ? (
            <button
              type="button"
              className={`text-sm font-semibold text-muted hover:text-terracotta ${authFocusRing} rounded-sm`}
              onClick={() => setConfirmDelete(true)}
            >
              Delete question
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-terracotta" role="alert">
          {error}
        </p>
      ) : null}
      {statusMsg ? (
        <p className="mt-3 text-sm text-ink" role="status" aria-live="polite">
          {statusMsg}
        </p>
      ) : null}

      {confirmDelete ? (
        <DeleteQuestionDialog
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              const result = await deleteMyRecipeQuestionAction({
                questionId: item.id,
              });
              if (!result.ok) return result.message;
              onDeleted(item.id);
              return null;
            } catch {
              return "Could not delete your question. Please try again.";
            }
          }}
        />
      ) : null}
    </li>
  );
}

export function ProfileQuestionsView({
  initial,
}: {
  initial: ProfileQuestionClientItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);

  return (
    <ul className="mt-10 divide-y divide-line border-y border-line" aria-label="Your recipe questions">
      {items.map((item) => (
        <QuestionCard
          key={item.id}
          item={item}
          onUpdated={(next) => {
            setItems((rows) => rows.map((row) => (row.id === next.id ? next : row)));
            router.refresh();
          }}
          onDeleted={(id) => {
            setItems((rows) => rows.filter((row) => row.id !== id));
            router.refresh();
          }}
        />
      ))}
    </ul>
  );
}
