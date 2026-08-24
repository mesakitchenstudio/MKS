"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { StarPicker, StarRating } from "@/components/StarRating";
import type { RecipeReviewData, RecipeReviewReplyRow, RecipeReviewRow } from "@/lib/recipe-reviews";

type RecipeReviewsProps = {
  slug: string;
  title: string;
  initial: RecipeReviewData;
  defaultName?: string;
  defaultEmail?: string;
};

function formatReviewDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function AuthorAvatar({ name, staff = false }: { name: string; staff?: boolean }) {
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        staff ? "bg-olive text-paper" : "bg-sand text-ink"
      }`}
      aria-hidden
    >
      {initials(name) || "?"}
    </div>
  );
}

function ReplyForm({
  slug,
  reviewId,
  defaultName,
  defaultEmail,
  onCancel,
  onSuccess,
}: {
  slug: string;
  reviewId: string;
  defaultName: string;
  defaultEmail: string;
  onCancel: () => void;
  onSuccess: (data: RecipeReviewData) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
          body: JSON.stringify({ authorName: name, authorEmail: email, comment }),
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
    <form onSubmit={onSubmit} className="mt-4 grid gap-3 border border-line bg-paper p-4">
      <p className="text-sm font-semibold text-ink">Leave a reply</p>
      <div className="grid gap-3 md:grid-cols-2">
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
      <label className="grid gap-1 text-sm">
        Reply <span className="text-terracotta">*</span>
        <textarea
          required
          rows={4}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className="rounded-sm border border-line bg-cream px-3 py-2 outline-none focus:border-terracotta"
        />
      </label>
      {error ? <p className="text-sm text-terracotta">{error}</p> : null}
      <div className="flex flex-wrap gap-3">
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

function ReviewReply({
  reply,
  onReply,
}: {
  reply: RecipeReviewReplyRow;
  onReply: () => void;
}) {
  const label = reply.authorTitle ? `${reply.authorName} (${reply.authorTitle})` : reply.authorName;

  return (
    <article className="mt-4 flex gap-3 border border-line bg-cream p-4 md:gap-4 md:p-5">
      <AuthorAvatar name={reply.authorName} staff={reply.isStaff} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-none">
            <span className="font-semibold text-ink">{label}</span>
            <span className="text-muted">{formatReviewDate(reply.createdAt)}</span>
          </div>
          <button
            type="button"
            onClick={onReply}
            className="shrink-0 text-sm font-semibold text-olive underline underline-offset-2 hover:text-olive-dark"
          >
            Reply
          </button>
        </div>
        <p className="mt-3 leading-7 text-ink/90">{reply.body}</p>
      </div>
    </article>
  );
}

function ReviewItem({
  review,
  slug,
  defaultName,
  defaultEmail,
  activeReplyId,
  onReply,
  onCancelReply,
  onDataChange,
}: {
  review: RecipeReviewRow;
  slug: string;
  defaultName: string;
  defaultEmail: string;
  activeReplyId: string | null;
  onReply: (id: string) => void;
  onCancelReply: () => void;
  onDataChange: (data: RecipeReviewData) => void;
}) {
  return (
    <li className="border-b border-line py-8 first:pt-0 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-none">
          <span className="font-semibold text-ink">{review.authorName}</span>
          <span className="text-muted">{formatReviewDate(review.createdAt)}</span>
          <StarRating value={review.rating} size="sm" label={`${review.rating} out of 5 stars`} />
        </div>
        <button
          type="button"
          onClick={() => onReply(review.id)}
          className="shrink-0 text-sm font-semibold text-olive underline underline-offset-2 hover:text-olive-dark"
        >
          Reply
        </button>
      </div>
      <p className="mt-4 leading-7 text-ink/90">{review.body}</p>

      {review.replies.map((reply) => (
        <ReviewReply key={reply.id} reply={reply} onReply={() => onReply(review.id)} />
      ))}

      {activeReplyId === review.id ? (
        <ReplyForm
          slug={slug}
          reviewId={review.id}
          defaultName={defaultName}
          defaultEmail={defaultEmail}
          onCancel={onCancelReply}
          onSuccess={(data) => {
            onDataChange(data);
            onCancelReply();
          }}
        />
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
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [rating, setRating] = useState(0);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(`/api/recipes/${encodeURIComponent(slug)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: name,
          authorEmail: email,
          rating,
          comment,
        }),
      });
      const payload = (await response.json()) as RecipeReviewData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save your review.");
      setData(payload);
      setSubmitted(true);
      setComment("");
      setRating(0);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="recipe-comments" className="mt-14 scroll-mt-24 border-t border-line pt-10">
      <h2 className="font-serif text-4xl text-ink">Comments</h2>

      {data.reviews.length ? (
        <ul className="mt-2">
          {data.reviews.map((review) => (
            <ReviewItem
              key={review.id}
              review={review}
              slug={slug}
              defaultName={defaultName}
              defaultEmail={defaultEmail}
              activeReplyId={activeReplyId}
              onReply={setActiveReplyId}
              onCancelReply={() => setActiveReplyId(null)}
              onDataChange={(next) => {
                setData(next);
                router.refresh();
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">Be the first to rate and review {title}.</p>
      )}

      <form
        onSubmit={onSubmit}
        id="leave-comment"
        className="mt-10 grid gap-4 border border-line bg-paper p-5 md:p-6"
      >
        <h3 className="font-serif text-2xl text-ink">Leave a comment</h3>
        <StarPicker value={rating} onChange={setRating} />

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

        <label className="grid gap-1 text-sm">
          Comment <span className="text-terracotta">*</span>
          <textarea
            required
            rows={5}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Tell us how this recipe turned out in your kitchen."
            className="rounded-sm border border-line bg-cream px-3 py-2 outline-none focus:border-terracotta"
          />
        </label>

        {error ? <p className="text-sm text-terracotta">{error}</p> : null}
        {submitted ? (
          <p className="text-sm text-olive">Thank you — your review is live above.</p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || rating < 1}
          className="justify-self-start rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-paper hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Posting…" : "Post comment"}
        </button>
      </form>
    </section>
  );
}
