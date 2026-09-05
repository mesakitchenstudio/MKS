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
import {
  PUBLIC_RECIPE_VISIBLE_COMMENTS,
  resolvePublicTargetReviewId,
  visibleRecipeReviewsForTarget,
  type RecipeReviewData,
  type RecipeReviewReplyRow,
  type RecipeReviewRow,
} from "@/lib/recipe-reviews";

type RecipeReviewsProps = {
  slug: string;
  title: string;
  initial: RecipeReviewData;
  defaultName?: string;
  defaultEmail?: string;
  /** From `?review=` — durable deep-link target for admin → public navigation. */
  targetReviewId?: string | null;
};

/** Initial top-level reviews before "Show more comments". */
const VISIBLE_COMMENTS = PUBLIC_RECIPE_VISIBLE_COMMENTS;

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
  const dim = size === "sm" ? "h-9 w-9 text-xs" : "h-12 w-12 text-sm";
  const src = typeof photoUrl === "string" ? photoUrl.trim() : "";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
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

/** Reader-facing staff label: "Owner (Mesa Kitchen Studio)" */
function staffIdentityLabel(authorName: string, authorTitle: string) {
  const title = authorTitle.trim();
  if (!title) return authorName;
  const publication = "Mesa Kitchen Studio";
  if (/mesa kitchen studio\s*team/i.test(title)) {
    return `${authorName} (${publication})`;
  }
  if (title.toLowerCase() === publication.toLowerCase()) {
    return `${authorName} (${publication})`;
  }
  return `${authorName} (${title})`;
}

function ThreadMessage({ reply }: { reply: RecipeReviewReplyRow }) {
  if (reply.isStaff) {
    const label = staffIdentityLabel(reply.authorName, reply.authorTitle);
    return (
      <article className="rounded-sm bg-sand/20 px-4 py-2.5 sm:px-5 sm:py-3">
        <div className="flex gap-3 sm:gap-3.5">
          <AuthorAvatar
            name={reply.authorName}
            staff
            photoUrl={reply.authorPhotoUrl}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm leading-snug">
              <p className="min-w-0 font-semibold text-ink">{label}</p>
              <time className="shrink-0 text-muted/85" dateTime={reply.createdAt}>
                {formatAdminDate(reply.createdAt)}
              </time>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-base leading-7 text-ink/90">
              {reply.body}
            </p>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="flex gap-3 py-1 sm:gap-3.5">
      <AuthorAvatar
        name={reply.authorName}
        photoUrl={reply.authorPhotoUrl}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm leading-snug">
          <span className="font-semibold text-ink">{reply.authorName}</span>
          <time className="shrink-0 text-muted/85" dateTime={reply.createdAt}>
            {formatAdminDate(reply.createdAt)}
          </time>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-ink/90">
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
      className="mt-5 space-y-3"
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
          className="w-full max-w-full resize-y rounded-sm border border-line bg-paper px-3 py-2.5 font-normal leading-6 outline-none focus:border-terracotta"
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
    <li
      id={`review-${review.id}`}
      className="scroll-mt-28 border-b border-line/70 py-8 last:border-b-0 target:border-l-2 target:border-l-olive/50 target:bg-sand/25 target:pl-3 md:py-10 md:target:pl-4"
    >
      {/* Flat editorial metadata — no card chrome */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1.5">
            <span className="break-words text-[0.95rem] font-semibold text-ink">
              {review.authorName}
            </span>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-sm text-muted/85">
              <time dateTime={review.createdAt}>{formatAdminDate(review.createdAt)}</time>
              <StarRating
                value={review.rating}
                size="md"
                label={`${review.rating} out of 5 stars`}
              />
            </div>
          </div>
        </div>
        {canReply ? (
          <button
            type="button"
            onClick={onToggleReply}
            className="shrink-0 pt-0.5 text-sm font-semibold text-olive underline underline-offset-[3px] hover:text-olive-dark"
          >
            {replyOpen ? "Cancel" : "Reply"}
          </button>
        ) : null}
      </div>

      <p className="mt-5 max-w-3xl whitespace-pre-wrap break-words text-[1.08rem] leading-[1.85] text-ink/90">
        {review.body}
      </p>

      {/* One shared inset column — flat conversation, not nested trees */}
      {review.replies.length ? (
        <div
          className="mt-7 w-full max-w-none space-y-5 pl-3 sm:mt-8 sm:space-y-6 sm:pl-8 md:pl-10"
          aria-label="Replies"
        >
          {review.replies.map((reply) => (
            <ThreadMessage key={reply.id} reply={reply} />
          ))}
        </div>
      ) : null}

      {replyOpen && canReply ? (
        <div className="pl-3 sm:pl-8 md:pl-10">
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
  targetReviewId = null,
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
  const [formOpen, setFormOpen] = useState(false);
  const [hashTargetId, setHashTargetId] = useState<string | null>(null);
  const scrolledTargetRef = useRef<string | null>(null);
  const threadSigRef = useRef(recipeReviewThreadSignature(data));

  const knownIdentity = Boolean(
    (session?.user?.name || defaultName) && (session?.user?.email || defaultEmail),
  );
  const signedInAs =
    session?.user?.name?.trim() ||
    defaultName.trim() ||
    session?.user?.email?.trim() ||
    "";

  const resolvedTargetId = resolvePublicTargetReviewId({
    reviewQuery: targetReviewId,
    hash: hashTargetId ? `#review-${hashTargetId}` : null,
  });
  const targetInThread =
    resolvedTargetId && data.reviews.some((review) => review.id === resolvedTargetId)
      ? resolvedTargetId
      : null;

  const replyable = new Set(data.replyableReviewIds || []);
  const visibleReviews = visibleRecipeReviewsForTarget(data.reviews, {
    showAll: showAllComments,
    targetReviewId: targetInThread,
    visibleCount: VISIBLE_COMMENTS,
  });
  const hasMoreComments = data.reviews.length > VISIBLE_COMMENTS;

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- session identity hydrate */
    if (session?.user?.name) setName(session.user.name);
    if (session?.user?.email) setEmail(session.user.email);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [session?.user?.name, session?.user?.email]);

  useEffect(() => {
    // Reset compact review UI when navigating between recipes.
    /* eslint-disable react-hooks/set-state-in-effect -- intentional remount sync on slug */
    const next = { ...initial, replyableReviewIds: initial.replyableReviewIds || [] };
    threadSigRef.current = recipeReviewThreadSignature(next);
    setData(next);
    setLoaded(false);
    setShowAllComments(false);
    setActiveReplyId(null);
    setFormOpen(false);
    setSubmitted(false);
    setError("");
    scrolledTargetRef.current = null;
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- SSR snapshot for this slug
  }, [slug]);

  useEffect(() => {
    function syncHashTarget() {
      if (typeof window === "undefined") return;
      const fromHash = resolvePublicTargetReviewId({ hash: window.location.hash });
      setHashTargetId(fromHash);
    }
    syncHashTarget();
    window.addEventListener("hashchange", syncHashTarget);
    return () => window.removeEventListener("hashchange", syncHashTarget);
  }, [slug]);

  useEffect(() => {
    if (!targetInThread) return;

    // Keep hash in sync so CSS :target applies when arriving via ?review= only.
    if (typeof window !== "undefined") {
      const expectedHash = `#review-${targetInThread}`;
      if (window.location.hash !== expectedHash) {
        const url = new URL(window.location.href);
        url.searchParams.set("review", targetInThread);
        url.hash = expectedHash;
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }

    if (scrolledTargetRef.current === targetInThread) return;

    let cancelled = false;
    let attempts = 0;
    let raf = 0;
    let timeout = 0;

    function tryScroll() {
      if (cancelled) return;
      const el = document.getElementById(`review-${targetInThread}`);
      if (el) {
        scrolledTargetRef.current = targetInThread;
        // auto: more reliable than smooth against layout/hydration scroll resets
        el.scrollIntoView({ behavior: "auto", block: "start" });
        return;
      }
      if (attempts++ < 60) {
        raf = requestAnimationFrame(tryScroll);
      }
    }

    // Defer past Next.js App Router scroll-to-top on navigation.
    timeout = window.setTimeout(() => {
      raf = requestAnimationFrame(tryScroll);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
  }, [targetInThread, visibleReviews, slug]);

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
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="recipe-comments" className="no-print mt-6 scroll-mt-28 border-t border-line/80 pt-4">
      <h2 className="font-serif text-xl text-ink md:text-2xl">Ratings & comments</h2>

      {!data.reviews.length && !formOpen ? (
        <div className="mt-2">
          <p className="text-sm text-muted">
            No reviews yet. Be the first to share how it turned out.
          </p>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="no-print mt-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-terracotta hover:text-terracotta"
          >
            Leave a review
          </button>
        </div>
      ) : null}

      {formOpen ? (
        <form onSubmit={onSubmit} id="leave-comment" className="mt-5 space-y-5 pb-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-serif text-xl text-ink">Leave a review</h3>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setError("");
              }}
              className="text-sm font-semibold text-muted hover:text-terracotta"
            >
              Cancel
            </button>
          </div>
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
                className="rounded-sm border border-line bg-paper px-3 py-2 outline-none focus:border-terracotta"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Email <span className="text-terracotta">*</span>
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-sm border border-line bg-paper px-3 py-2 outline-none focus:border-terracotta"
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
            className="w-full max-w-full rounded-sm border border-line bg-paper px-3 py-2.5 outline-none focus:border-terracotta"
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
      ) : null}

      {data.reviews.length ? (
        <div className="mt-6">
          {!formOpen ? (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="no-print mb-6 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-terracotta hover:text-terracotta"
            >
              Leave a review
            </button>
          ) : null}

        <div aria-live="polite" aria-atomic="false">
          <ul>
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
            <div className="flex justify-center border-t border-line/80 pt-8">
              <button
                type="button"
                onClick={() => setShowAllComments(true)}
                className="rounded-sm border border-line bg-transparent px-6 py-2.5 text-sm font-semibold text-olive hover:border-olive hover:bg-paper"
              >
                Show more comments
              </button>
            </div>
          ) : null}
        </div>
      </div>
      ) : !loaded ? (
        <p className="mt-4 text-sm text-muted">Loading comments…</p>
      ) : null}
    </section>
  );
}
