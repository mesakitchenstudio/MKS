"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import {
  hideRecipeQuestionAction,
  publishRecipeQuestionAction,
  rejectRecipeQuestionAction,
  saveAndPublishRecipeQuestionAction,
  saveRecipeQuestionAnswerAction,
} from "@/app/admin/question-actions";
import {
  adminDangerButtonClass,
  adminFocusRing,
  adminInputClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "@/lib/admin-ui";
import {
  RECIPE_QUESTION_ANSWER_MAX,
  type AdminRecipeQuestionListItem,
} from "@/lib/recipe-questions";

type Props = {
  question: AdminRecipeQuestionListItem;
  recipeDraft: boolean;
};

export function AdminQuestionModerationForm({ question, recipeDraft }: Props) {
  const router = useRouter();
  const formId = useId();
  const answerId = `${formId}-answer`;
  const errorId = `${formId}-error`;
  const statusId = `${formId}-status`;

  const [answerBody, setAnswerBody] = useState(question.answerBody || "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const rejected = question.status === "rejected";
  const published = question.status === "published";
  const hidden = question.status === "hidden";
  const pendingStatus = question.status === "pending";
  const hasAnswer = Boolean(answerBody.trim());

  async function run(
    action: () => Promise<{ ok: boolean; message?: string }>,
  ) {
    if (pending) return;
    setPending(true);
    setError(null);
    setStatus(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.message || "Action failed.");
        return;
      }
      setStatus(result.message || "Saved.");
      router.refresh();
    } catch {
      setError("Could not complete that action. Please try again.");
    } finally {
      setPending(false);
    }
  }

  function onSaveAnswer(event: FormEvent) {
    event.preventDefault();
    void run(() =>
      saveRecipeQuestionAnswerAction({
        questionId: question.id,
        answerBody,
      }),
    );
  }

  return (
    <div className="mt-8 space-y-6">
      {!rejected ? (
        <form onSubmit={onSaveAnswer} className="space-y-3" aria-busy={pending || undefined}>
          <div className="grid gap-2">
            <label htmlFor={answerId} className="text-sm font-semibold text-ink">
              Official Mesa answer
            </label>
            <p className="text-sm text-muted">
              Public attribution is Mesa Kitchen Studio. Max {RECIPE_QUESTION_ANSWER_MAX}{" "}
              characters.
            </p>
            <textarea
              id={answerId}
              name="answerBody"
              value={answerBody}
              onChange={(event) => setAnswerBody(event.target.value)}
              rows={8}
              maxLength={RECIPE_QUESTION_ANSWER_MAX}
              disabled={pending}
              className={`${adminInputClass} min-h-[10rem] resize-y py-3 ${adminFocusRing}`}
            />
            <p className="text-xs text-muted">
              {Math.min(answerBody.length, RECIPE_QUESTION_ANSWER_MAX)} /{" "}
              {RECIPE_QUESTION_ANSWER_MAX}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={pending} className={adminPrimaryButtonClass}>
              {pending ? "Saving…" : "Save answer"}
            </button>
            {pendingStatus || hidden ? (
              <button
                type="button"
                disabled={pending || !hasAnswer || recipeDraft}
                className={adminSecondaryButtonClass}
                onClick={() =>
                  void run(() =>
                    saveAndPublishRecipeQuestionAction({
                      questionId: question.id,
                      answerBody,
                    }),
                  )
                }
              >
                Save &amp; publish
              </button>
            ) : null}
          </div>
          {recipeDraft && (pendingStatus || hidden) ? (
            <p className="text-sm text-muted">
              This question cannot be published while the recipe is unpublished.
            </p>
          ) : null}
        </form>
      ) : (
        <p className="text-sm text-muted">
          Rejected questions are terminal and cannot be answered or published.
        </p>
      )}

      <div className="flex flex-wrap gap-3 border-t border-line/70 pt-5">
        {pendingStatus && question.hasAnswer && !recipeDraft ? (
          <button
            type="button"
            disabled={pending}
            className={adminSecondaryButtonClass}
            onClick={() =>
              void run(() =>
                publishRecipeQuestionAction({ questionId: question.id }),
              )
            }
          >
            Publish
          </button>
        ) : null}
        {hidden && question.hasAnswer && !recipeDraft ? (
          <button
            type="button"
            disabled={pending}
            className={adminSecondaryButtonClass}
            onClick={() =>
              void run(() =>
                publishRecipeQuestionAction({ questionId: question.id }),
              )
            }
          >
            Republish
          </button>
        ) : null}
        {published ? (
          <button
            type="button"
            disabled={pending}
            className={adminSecondaryButtonClass}
            onClick={() =>
              void run(() => hideRecipeQuestionAction({ questionId: question.id }))
            }
          >
            Hide
          </button>
        ) : null}
        {pendingStatus ? (
          <button
            type="button"
            disabled={pending}
            className={adminDangerButtonClass}
            onClick={() =>
              void run(() =>
                rejectRecipeQuestionAction({ questionId: question.id }),
              )
            }
          >
            Reject
          </button>
        ) : null}
      </div>

      {error ? (
        <p id={errorId} className="text-sm text-terracotta" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p id={statusId} className="text-sm text-ink" role="status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </div>
  );
}
