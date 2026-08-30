"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { deleteSeriesAction, saveSeriesAction } from "@/app/admin/actions";
import {
  adminFocusRing,
  adminInputClass,
  adminLinkClass,
  adminPrimaryButtonClass,
  adminSelectClass,
} from "@/lib/admin-ui";
import type { AdminSeriesDetail, AdminSeriesItemDraft, SeriesPickerCandidate } from "@/lib/series-admin";
import { slugify } from "@/lib/fields";
import { ADMIN_IMAGE_ACCEPT, RECIPE_HERO_IMAGE_HELP } from "@/lib/admin-upload";

const secondaryBtn =
  "inline-flex h-9 items-center justify-center rounded-sm border border-line bg-paper px-3 text-sm font-semibold text-muted hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function SeriesEditor({
  series,
  candidates,
  isNew = false,
}: {
  series: AdminSeriesDetail;
  candidates: SeriesPickerCandidate[];
  isNew?: boolean;
}) {
  const [title, setTitle] = useState(series.title);
  const [slug, setSlug] = useState(series.slug);
  const [shortTitle, setShortTitle] = useState(series.shortTitle);
  const [description, setDescription] = useState(series.description);
  const [intro, setIntro] = useState(series.intro);
  const [heroImage, setHeroImage] = useState(series.heroImage);
  const [seoTitle, setSeoTitle] = useState(series.seoTitle);
  const [seoDescription, setSeoDescription] = useState(series.seoDescription);
  const [youtubePlaylistId, setYoutubePlaylistId] = useState(series.youtubePlaylistId);
  const [isPublished, setIsPublished] = useState(series.isPublished);
  const [sortOrder, setSortOrder] = useState(String(series.sortOrder));
  const [items, setItems] = useState<AdminSeriesItemDraft[]>(series.items);
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState("all");
  const [linkFilter, setLinkFilter] = useState("all");
  const [uploading, setUploading] = useState(false);

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((c) => {
      if (formatFilter === "LONG" && c.format !== "LONG") return false;
      if (formatFilter === "SHORT" && c.format !== "SHORT") return false;
      if (linkFilter === "linked" && !c.youtubeVideoId) return false;
      if (linkFilter === "unlinked" && c.youtubeVideoId) return false;
      if (linkFilter === "published" && !c.published) return false;
      if (!q) return true;
      const hay = [
        c.recipeTitle,
        c.youtubeTitle,
        c.typeName,
        c.recipeSlug,
        c.youtubeVideoId,
        ...c.categorySlugs,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [candidates, formatFilter, linkFilter, query]);

  function addCandidate(c: SeriesPickerCandidate) {
    const exists = items.some(
      (item) =>
        (c.recipeId && item.recipeId === c.recipeId) ||
        (c.youtubeVideoId && item.youtubeVideoId === c.youtubeVideoId && !c.recipeId),
    );
    if (exists) return;
    setItems((current) => [
      ...current,
      {
        recipeId: c.recipeId,
        youtubeVideoId: c.youtubeVideoId,
        customTitle: "",
        customDescription: "",
        featured: current.length === 0,
        sortOrder: current.length,
        label: c.recipeTitle || c.youtubeTitle || "Item",
        thumbnail: c.thumbnail,
        meta: [c.typeName, c.format, c.status].filter(Boolean).join(" · "),
      },
    ]);
  }

  function moveItem(index: number, direction: -1 | 1) {
    setItems((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return next.map((item, i) => ({ ...item, sortOrder: i }));
    });
  }

  function setFeatured(index: number) {
    setItems((current) => current.map((item, i) => ({ ...item, featured: i === index })));
  }

  async function onHeroUpload(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/admin/upload", { method: "POST", body });
      const data = (await response.json()) as { ok?: boolean; url?: string; message?: string };
      if (response.ok && data.url) setHeroImage(data.url);
      else window.alert(data.message || "Upload failed.");
    } catch {
      window.alert("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-8">
    <form action={saveSeriesAction} className="space-y-8">
      {!isNew ? <input type="hidden" name="id" value={series.id} /> : null}
      <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-ink">{isNew ? "New series" : "Edit series"}</h1>
          <p className="mt-1 text-sm text-muted">
            Curated Mesa landing pages for related recipes and videos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isNew && series.isPublished ? (
            <Link href={`/series/${series.slug}`} className={`${secondaryBtn} ${adminFocusRing}`} target="_blank">
              Preview
            </Link>
          ) : null}
          <button type="submit" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
            Save series
          </button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Title</span>
          <input
            className={adminInputClass}
            name="title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (isNew) setSlug(slugify(e.target.value));
            }}
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Slug</span>
          <input
            className={adminInputClass}
            name="slug"
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            disabled={!isNew}
            required={isNew}
          />
          {!isNew ? <span className="text-xs text-muted">Slug is locked after create.</span> : null}
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Short title</span>
          <input className={adminInputClass} name="shortTitle" value={shortTitle} onChange={(e) => setShortTitle(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Sort order</span>
          <input className={adminInputClass} name="sortOrder" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="font-semibold">Description</span>
          <textarea
            className={`${adminInputClass} min-h-20`}
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="font-semibold">Intro</span>
          <textarea className={`${adminInputClass} min-h-24`} name="intro" value={intro} onChange={(e) => setIntro(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">SEO title</span>
          <input className={adminInputClass} name="seoTitle" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">SEO description</span>
          <input
            className={adminInputClass}
            name="seoDescription"
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="font-semibold">YouTube playlist ID (optional, future)</span>
          <input
            className={adminInputClass}
            name="youtubePlaylistId"
            value={youtubePlaylistId}
            onChange={(e) => setYoutubePlaylistId(e.target.value)}
            placeholder="Not synced in v1"
          />
        </label>
        <div className="grid gap-2 md:col-span-2">
          <span className="text-sm font-semibold">Hero image</span>
          <input type="hidden" name="heroImage" value={heroImage} />
          {heroImage ? (
            <div className="relative aspect-video max-w-md overflow-hidden border border-line bg-sand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={heroImage} alt="" className="h-full w-full object-cover" />
            </div>
          ) : null}
          <input
            type="file"
            accept={ADMIN_IMAGE_ACCEPT}
            disabled={uploading}
            onChange={(e) => void onHeroUpload(e.target.files?.[0] || null)}
          />
          <p className="text-xs text-muted">{RECIPE_HERO_IMAGE_HELP}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold md:col-span-2">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
          />
          Published
          <input type="hidden" name="isPublished" value={isPublished ? "1" : "0"} />
        </label>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-serif text-xl text-ink">Series items</h2>
          <p className="mt-1 text-sm text-muted">Order controls the public page sequence. Prefer published recipes with long-form videos.</p>
        </div>

        <div className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-muted">No items yet. Add content from the picker below.</p>
          ) : (
            items.map((item, index) => (
              <div key={`${item.recipeId}-${item.youtubeVideoId}-${index}`} className="flex flex-wrap items-start gap-3 border border-line bg-paper p-3">
                <div className="relative h-16 w-28 shrink-0 overflow-hidden border border-line bg-sand">
                  {item.thumbnail ? (
                    <Image src={item.thumbnail} alt="" fill className="object-cover" sizes="7rem" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="font-semibold text-ink">{item.label}</p>
                  <p className="text-xs text-muted">{item.meta}</p>
                  <input
                    className={adminInputClass}
                    placeholder="Custom title (optional)"
                    value={item.customTitle}
                    onChange={(e) =>
                      setItems((current) =>
                        current.map((row, i) => (i === index ? { ...row, customTitle: e.target.value } : row)),
                      )
                    }
                  />
                  <textarea
                    className={`${adminInputClass} min-h-16`}
                    placeholder="Short description (optional)"
                    value={item.customDescription}
                    onChange={(e) =>
                      setItems((current) =>
                        current.map((row, i) =>
                          i === index ? { ...row, customDescription: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <button type="button" className={secondaryBtn} onClick={() => moveItem(index, -1)}>
                    Up
                  </button>
                  <button type="button" className={secondaryBtn} onClick={() => moveItem(index, 1)}>
                    Down
                  </button>
                  <button type="button" className={secondaryBtn} onClick={() => setFeatured(index)}>
                    {item.featured ? "Featured" : "Feature"}
                  </button>
                  <button
                    type="button"
                    className={secondaryBtn}
                    onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-sm border border-line bg-cream/30 p-4">
          <h3 className="text-sm font-semibold text-ink">Add content</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className={`${adminInputClass} min-w-[12rem] flex-1`}
              placeholder="Search recipes, videos, types…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select className={adminSelectClass} value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)}>
              <option value="all">All formats</option>
              <option value="LONG">Long-form</option>
              <option value="SHORT">Shorts</option>
            </select>
            <select className={adminSelectClass} value={linkFilter} onChange={(e) => setLinkFilter(e.target.value)}>
              <option value="all">All content</option>
              <option value="linked">Linked YouTube</option>
              <option value="unlinked">No YouTube</option>
              <option value="published">Published recipes</option>
            </select>
          </div>
          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {filteredCandidates.slice(0, 40).map((c) => (
              <li key={c.key} className="flex items-center gap-3 border border-line/70 bg-paper px-2 py-2">
                <div className="relative h-12 w-20 shrink-0 overflow-hidden bg-sand">
                  {c.thumbnail ? (
                    <Image src={c.thumbnail} alt="" fill className="object-cover" sizes="5rem" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{c.recipeTitle || c.youtubeTitle}</p>
                  <p className="truncate text-xs text-muted">
                    {[c.youtubeTitle && c.recipeTitle ? c.youtubeTitle : null, c.typeName, c.format, c.status]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <button type="button" className={`${adminLinkClass} text-sm`} onClick={() => addCandidate(c)}>
                  Add
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </form>

      {!isNew ? (
        <div className="border-t border-line pt-6">
          <form
            action={deleteSeriesAction}
            onSubmit={(event) => {
              if (!window.confirm("Delete this series permanently?")) event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={series.id} />
            <button type="submit" className="text-sm font-semibold text-terracotta hover:underline">
              Delete series
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
