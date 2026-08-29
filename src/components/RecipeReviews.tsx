"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { notifyRecipeReviewsUpdated } from "@/components/RecipeRatingSummary";
import { StarPicker, StarRating } from "@/components/StarRating";
import { trackEvent } from "@/lib/analytics";
import { formatAdminDate } from "@/lib/datetime";
import {
  fetchRecipeReviewData,
  RECIPE_REVIEW_POLL_MS,
  recipeReviewThreadSignature,
} from "@/lib/recipe-reviews-client";
import type { RecipeReviewData, RecipeReviewReplyRow, RecipeReviewRow } from "@/lib/recipe-reviews";

type RecipeReviewsProps = {
  slug: string;
  title: string;
  initial: RecipeReviewData;
  defaultName?: string;
  defaultEmail?: string;
};

/** Initial top-level reviews before "Show more comments". */
const VISIBLE_COMMENTS = 12;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function AuthorAvatar({
  name,
  staff = false,
  photoUrl = "",
  size = "md",
}: {
  name: string;
  staff?: boolean;
  photoUrl?: string;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm";
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        className={`${dim} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full font-semibold ${
        staff ? "bg-olive text-paper" : "bg-sand text-ink"
      }`}
      aria-hidden
    >
      {initials(name) || "?"}
    </div>
  );
}

function ThreadMessage({ reply }: { reply: RecipeReviewReplyRow }) {
  const roleLabel = reply.authorTitle?.trim();
  const nameLine = roleLabel ? (
    <>
      <span className="font-semibold text-ink">{reply.authorName}</span>
      <span className="text-muted"> · {roleLabel}</span>
    </>
  ) : (
    <span className="font-semibold text-ink">{reply.authorName}</span>
  );

  return (
    <article
      className={`flex gap-3 rounded-sm px-3 py-3 sm:gap-4 sm:px-4 sm:py-3.5 ${
        reply.isStaff ? "bg-cream/90" : "bg-sand/35"
      }`}
    >
      <AuthorAvatar
        name={reply.authorName}
        staff={reply.isStaff}
        photoUrl={reply.authorPhotoUrl}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm leading-snug">
          <p className="min-w-0">{nameLine}</p>
          <time className="shrink-0 text-muted" dateTime={reply.createdAt}>
            {formatAdminDate(reply.createdAt)}
          </time>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-[0.95rem] leading-7 text-ink/90">
          {reply.body}
        </p>
      </div>
    </article>
  );
}

function ThreadReplyForm({
  slug,
  reviewId,
  signedInAs,
  onCancel,
  onSuccess,
}: {
  slug: string;
  reviewId: string;
  signedInAs?: string;
  onCancel: () => void;
  onSuccess: (data: RecipeReviewData) => void;
}) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/recipes/${encodeURIComponent(slug)}/reviews/${encodeURIComponent(reviewId)}/replies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ comment }),
        },
      );
      const payload = (await response.json()) as RecipeReviewData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save your reply.");
      onSuccess(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your reply.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 space-y-3 border-t border-line/80 pt-4"
      aria-label="Reply to this conversation"
    >
      {signedInAs ? (
        <p className="text-sm text-muted">
          Replying as <span className="font-semibold text-ink">{signedInAs}</span>
        </p>
      ) : null}
      <label className="grid gap-1.5 text-sm font-semibold text-ink">
        Reply
        <textarea
          ref={textareaRef}
          required
          minLength={3}
          rows={3}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Add to this conversation…"
          className="w-full max-w-full resize-y rounded-sm border border-line bg-cream px-3 py-2.5 font-normal leading-6 outline-none focus:border-terracotta"
        />
      </label>
      {error ? (
        <p className="text-sm text-terracotta" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-terracotta px-5 py-2 text-sm font-semibold text-paper hover:bg-terracotta-dark disabled:opacity-60"
        >
          {submitting ? "Posting…" : "Post reply"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-semibold text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ReviewItem({
  review,
  slug,
  canReply,
  replyOpen,
  signedInAs,
  onToggleReply,
  onCancelReply,
  onDataChange,
}: {
  review: RecipeReviewRow;
  slug: string;
  canReply: boolean;
  replyOpen: boolean;
  signedInAs?: string;
  onToggleReply: () => void;
  onCancelReply: () => void;
  onDataChange: (data: RecipeReviewData) => void;
}) {
  return (
    <li className="border-b border-line py-7 first:pt-2 last:border-b-0 md:py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
            <span className="break-words text-sm font-semibold text-ink">{review.authorName}</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <time dateTime={review.createdAt}>{formatAdminDate(review.createdAt)}</time>
              <StarRating
                value={review.rating}
                size="sm"
                label={`${review.rating} out of 5 stars`}
              />
            </div>
          </div>
        </div>
        {canReply ? (
          <button
            type="button"
            onClick={onToggleReply}
            className="shrink-0 pt-0.5 text-sm font-semibold text-olive underline-offset-2 hover:text-olive-dark hover:underline"
          >
            {replyOpen ? "Cancel" : "Reply"}
          </button>
        ) : null}
      </div>

      <p className="mt-3 max-w-2xl whitespace-pre-wrap break-words text-[1.02rem] leading-7 text-ink/90">
        {review.body}
      </p>

      {review.replies.length ? (
        <div className="mt-5 space-y-2.5 pl-3 sm:pl-5" aria-label="Conversation">
          {review.replies.map((reply) => (
            <ThreadMessage key={reply.id} reply={reply} />
          ))}
        </div>
      ) : null}

      {replyOpen && canReply ? (
        <div className="pl-0 sm:pl-5">
          <ThreadReplyForm
            slug={slug}
            reviewId={review.id}
            signedInAs={signedInAs}
            onCancel={onCancelReply}
            onSuccess={(data) => {
              onDataChange(data);
              onCancelReply();
            }}
          />
        </div>
      ) : null}
    </li>
  );
}

export function RecipeReviews({
  slug,
  title,
  initial,
  defaultName = "",
  defaultEmail = "",
}: RecipeReviewsProps) {
  const { data: session } = useSession();
  const [data, setData] = useState<RecipeReviewData>({
    ...initial,
    replyableReviewIds: initial.replyableReviewIds || [],
  });
  const [rating, setRating] = useState(0);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const threadSigRef = useRef(recipeReviewThreadSignature(data));

  const knownIdentity = Boolean(
    (session?.user?.name || defaultName) && (session?.user?.email || defaultEmail),
  );
  const signedInAs =
    session?.user?.name?.trim() ||
    defaultName.trim() ||
    session?.user?.email?.trim() ||
    "";

  const replyable = new Set(data.replyableReviewIds || []);
  const visibleReviews = showAllComments
    ? data.reviews
    : data.reviews.slice(0, VISIBLE_COMMENTS);
  const hasMoreComments = data.reviews.length > VISIBLE_COMMENTS;
  const commentCount = data.stats.count || data.reviews.length;

  useEffect(() => {
    if (session?.user?.name) setName(session.user.name);
    if (session?.user?.email) setEmail(session.user.email);
  }, [session?.user?.name, session?.user?.email]);

  useEffect(() => {
    const next = { ...initial, replyableReviewIds: initial.replyableReviewIds || [] };
    threadSigRef.current = recipeReviewThreadSignature(next);
    setData(next);
    setLoaded(false);
    setShowAllComments(false);
    setActiveReplyId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- SSR snapshot for this slug
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let inFlight = false;

    async function poll() {
      if (cancelled || inFlight) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      inFlight = true;
      try {
        const next = await fetchRecipeReviewData(slug);
        if (cancelled) return;
        const normalized = {
          ...next,
          replyableReviewIds: next.replyableReviewIds || [],
        };
        const signature = recipeReviewThreadSignature(normalized);
        if (signature === threadSigRef.current) {
          setLoaded(true);
          return;
        }
        threadSigRef.current = signature;
        setData(normalized);
        notifyRecipeReviewsUpdated(normalized.stats);
        setActiveReplyId((current) =>
          current && !normalized.reviews.some((review) => review.id === current)
            ? null
            : current,
        );
      } catch {
        // Keep the visible thread; retry on the next interval.
      } finally {
        inFlight = false;
        if (!cancelled) setLoaded(true);
      }
    }

    void poll();
    timer = window.setInterval(() => void poll(), RECIPE_REVIEW_POLL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") void poll();
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [slug]);

  function applyReviewData(next: RecipeReviewData) {
    const normalized = {
      ...next,
      replyableReviewIds: next.replyableReviewIds || [],
    };
    threadSigRef.current = recipeReviewThreadSignature(normalized);
    setData(normalized);
    notifyRecipeReviewsUpdated(normalized.stats);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(`/api/recipes/${encodeURIComponent(slug)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          authorName: name,
          authorEmail: email,
          rating,
          comment,
        }),
      });
      const payload = (await response.json()) as RecipeReviewData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save your review.");
      applyReviewData(payload);
      trackEvent("recipe_comment_submit", {
        recipe_slug: slug,
        recipe_title: title,
      });
      setSubmitted(true);
      setComment("");
      setRating(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="recipe-comments" className="mt-14 scroll-mt-24 border-t border-line pt-10">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-serif text-4xl text-ink">Comments</h2>
        {commentCount > 0 ? (
          <span className="text-sm text-muted">· {commentCount}</span>
        ) : null}
      </div>

      <form
        onSubmit={onSubmit}
        id="leave-comment"
        className="mt-8 space-y-4 border-b border-line pb-10"
      >
        <h3 className="font-serif text-2xl text-ink">Leave a comment</h3>
        {knownIdentity ? (
          <p className="text-sm text-muted">
            Commenting as{" "}
            <span className="font-semibold text-ink">
              {name.trim() || email.trim() || "you"}
            </span>
          </p>
        ) : null}
        <StarPicker value={rating} onChange={setRating} />

        {!knownIdentity ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Name <span className="text-terracotta">*</span>
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-sm border border-line bg-cream px-3 py-2 outline-none focus:border-terracotta"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Email <span className="text-terracotta">*</span>
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-sm border border-line bg-cream px-3 py-2 outline-none focus:border-terracotta"
              />
            </label>
          </div>
        ) : (
          <>
            <input type="hidden" value={name} readOnly />
            <input type="hidden" value={email} readOnly />
          </>
        )}

        <label className="grid gap-1 text-sm">
          Comment <span className="text-terracotta">*</span>
          <textarea
            required
            rows={5}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Tell us how this recipe turned out in your kitchen."
            className="w-full max-w-full rounded-sm border border-line bg-cream px-3 py-2 outline-none focus:border-terracotta"
          />
        </label>

        {error ? (
          <p className="text-sm text-terracotta" role="alert">
            {error}
          </p>
        ) : null}
        {submitted ? (
          <p className="text-sm text-olive" role="status">
            Thank you — your review is live below.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || rating < 1}
          className="rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-paper hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Posting…" : "Post comment"}
        </button>
      </form>

      <div aria-live="polite" aria-atomic="false">
        {data.reviews.length ? (
          <>
            <ul className="mt-2">
              {visibleReviews.map((review) => (
                <ReviewItem
                  key={review.id}
                  review={review}
                  slug={slug}
                  canReply={replyable.has(review.id)}
                  replyOpen={activeReplyId === review.id}
                  signedInAs={signedInAs}
                  onToggleReply={() =>
                    setActiveReplyId((current) => (current === review.id ? null : review.id))
                  }
                  onCancelReply={() => setActiveReplyId(null)}
                  onDataChange={applyReviewData}
                />
              ))}
            </ul>
            {hasMoreComments && !showAllComments ? (
              <div className="mt-8 flex justify-center border-t border-line pt-8">
                <button
                  type="button"
                  onClick={() => setShowAllComments(true)}
                  className="text-sm font-semibold text-olive underline-offset-2 hover:text-olive-dark hover:underline"
                >
                  Show more comments
                </button>
              </div>
            ) : null}
          </>
        ) : loaded ? (
          <p className="mt-8 text-sm text-muted">Be the first to rate and review {title}.</p>
        ) : (
          <p className="mt-8 text-sm text-muted">Loading comments…</p>
        )}
      </div>
    </section>
  );
}
