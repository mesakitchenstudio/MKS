"use client";

import { useSession } from "next-auth/react";
import { useId, useState, type FormEvent } from "react";
import { submitRecipeQuestionAction } from "@/app/recipes/question-actions";
import { authFocusRing } from "@/lib/auth-ui";
import { readSession } from "@/lib/auth-client";
import {
  RECIPE_QUESTION_BODY_MAX,
  RECIPE_QUESTION_BODY_MIN,
} from "@/lib/recipe-questions";

const primaryBtn =
  "inline-flex h-11 items-center justify-center rounded-full bg-terracotta px-5 text-sm font-semibold text-paper transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtn =
  "inline-flex h-11 items-center justify-center rounded-full border border-line bg-paper px-5 text-sm font-semibold text-ink transition-colors hover:bg-cream/80 disabled:cursor-not-allowed disabled:opacity-60";

type Props = {
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
};

/**
 * Cache-safe Ask control. Does not receive member identity or pending state from the server.
 * Signed-out → mesa-open-auth; never auto-submits after sign-in; never stores draft text.
 */
export function RecipeQuestionAsk({ recipeId, recipeSlug, recipeTitle }: Props) {
  const { status: sessionStatus } = useSession();
  const formId = useId();
  const textareaId = `${formId}-body`;
  const helpId = `${formId}-help`;
  const errorId = `${formId}-error`;
  const successId = `${formId}-success`;

  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  void recipeSlug;
  void recipeTitle;

  function isSignedIn() {
    return Boolean(readSession()) || sessionStatus === "authenticated";
  }

  function openAuth() {
    window.dispatchEvent(new Event("mesa-open-auth"));
  }

  function onAskClick() {
    setError(null);
    setSuccess(false);
    if (!isSignedIn()) {
      openAuth();
      return;
    }
    setOpen(true);
  }

  function onCancel() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setSuccess(false);

    if (!isSignedIn()) {
      openAuth();
      return;
    }

    setPending(true);
    try {
      const result = await submitRecipeQuestionAction({
        recipeId,
        body,
      });
      if (!result.ok) {
        if (result.status === "AUTH_REQUIRED") {
          openAuth();
          return;
        }
        setError(result.message);
        return;
      }
      setBody("");
      setOpen(false);
      setSuccess(true);
    } catch {
      setError("Could not submit your question. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const trimmedLen = body.trim().length;
  const overMin = trimmedLen >= RECIPE_QUESTION_BODY_MIN;

  return (
    <div className="mt-5">
      {!open ? (
        <button
          type="button"
          onClick={onAskClick}
          className={`text-sm font-semibold text-terracotta hover:text-terracotta-dark ${authFocusRing}`}
        >
          Ask a question
        </button>
      ) : (
        <form
          onSubmit={onSubmit}
          className="mt-1 space-y-3"
          aria-busy={pending || undefined}
        >
          <div className="grid gap-2">
            <label htmlFor={textareaId} className="text-sm font-semibold text-ink">
              Your question
            </label>
            <p id={helpId} className="text-sm leading-6 text-muted">
              Ask about substitutions, technique, make-ahead, storage, scaling, or
              troubleshooting for this recipe. Mesa staff answers officially — questions
              are reviewed before they appear publicly.
            </p>
            <textarea
              id={textareaId}
              name="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              maxLength={RECIPE_QUESTION_BODY_MAX}
              disabled={pending}
              aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
              aria-invalid={error ? true : undefined}
              className={`min-h-[6.5rem] w-full resize-y rounded-sm border border-line bg-paper px-3.5 py-3 text-base text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-olive focus:ring-2 focus:ring-olive/15 sm:text-sm ${authFocusRing}`}
              placeholder="What would you like to know about cooking this recipe?"
            />
            <p className="text-xs text-muted">
              {Math.min(body.length, RECIPE_QUESTION_BODY_MAX)} / {RECIPE_QUESTION_BODY_MAX}
              {!overMin && body.trim().length > 0
                ? ` · at least ${RECIPE_QUESTION_BODY_MIN} characters`
                : null}
            </p>
          </div>

          {error ? (
            <p id={errorId} className="text-sm text-terracotta" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={pending} className={primaryBtn}>
              {pending ? "Submitting…" : "Submit question"}
            </button>
            <button type="button" onClick={onCancel} disabled={pending} className={secondaryBtn}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {success ? (
        <p
          id={successId}
          className="mt-3 text-sm leading-6 text-ink"
          role="status"
          aria-live="polite"
        >
          Thanks — your question was submitted for review.
        </p>
      ) : null}
    </div>
  );
}
