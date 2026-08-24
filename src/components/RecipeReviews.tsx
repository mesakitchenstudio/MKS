"use client";

import { FormEvent, useState } from "react";
import { StarPicker, StarRating } from "@/components/StarRating";
import type { RecipeReviewData } from "@/lib/recipe-reviews";

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

export function RecipeReviews({
  slug,
  title,
  initial,
  defaultName = "",
  defaultEmail = "",
}: RecipeReviewsProps) {
  const [data, setData] = useState(initial);
  const [rating, setRating] = useState(0);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="recipe-comments" className="mt-14 scroll-mt-24 border-t border-line pt-10">
      <h2 className="font-serif text-3xl text-ink">Comments</h2>

      {data.stats.count > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StarRating value={data.stats.average} label={`${data.stats.average} out of 5 stars`} />
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">{data.stats.average.toFixed(1)}</span> from{" "}
            {data.stats.count} {data.stats.count === 1 ? "review" : "reviews"}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">Be the first to rate and review {title}.</p>
      )}

      <form onSubmit={onSubmit} className="mt-8 grid gap-4 border border-line bg-cream p-5 md:p-6">
        <p className="text-sm font-semibold text-ink">Leave a comment</p>
        <StarPicker value={rating} onChange={setRating} />

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

        <label className="grid gap-1 text-sm">
          Comment <span className="text-terracotta">*</span>
          <textarea
            required
            rows={5}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Tell us how this recipe turned out in your kitchen."
            className="rounded-sm border border-line bg-paper px-3 py-2 outline-none focus:border-terracotta"
          />
        </label>

        {error ? <p className="text-sm text-terracotta">{error}</p> : null}
        {submitted ? (
          <p className="text-sm text-olive">Thank you — your review is live below.</p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || rating < 1}
          className="justify-self-start rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-paper hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Posting…" : "Post review"}
        </button>
      </form>

      {data.reviews.length ? (
        <ul className="mt-10 space-y-8">
          {data.reviews.map((review) => (
            <li key={review.id} className="border-b border-line pb-8 last:border-b-0">
              <div className="flex flex-wrap items-center gap-3">
                <StarRating value={review.rating} size="sm" />
                <p className="font-semibold text-ink">{review.authorName}</p>
                <p className="text-sm text-muted">{formatReviewDate(review.createdAt)}</p>
              </div>
              <p className="mt-3 leading-7 text-ink/90">{review.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function RecipeRatingBadge({ stats }: { stats: RecipeReviewData["stats"] }) {
  if (!stats.count) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
      <StarRating value={stats.average} size="sm" />
      <span>
        {stats.average.toFixed(1)} from {stats.count} {stats.count === 1 ? "review" : "reviews"}
      </span>
    </div>
  );
}
